import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";

// Module-level mocks — hoisted before any imports
vi.mock("../client/core.js", () => ({
  fetchCoreHealth: vi.fn(),
  fetchCore: vi.fn(),
  buildForwardHeaders: vi.fn((_request: Request, initHeaders?: HeadersInit) => ({
    headers: new Headers(initHeaders),
    correlationId: "corr-test-123",
  })),
  getCoreUrl: vi.fn().mockReturnValue("http://localhost:8000"),
  buildCoreUrl: vi.fn((p: string) => `http://localhost:8000${p}`),
}));

import { fetchCoreHealth, fetchCore, buildForwardHeaders } from "../client/core.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerCoreProxyRoutes } from "../routes/core-proxy.js";

const mockFetchCoreHealth = vi.mocked(fetchCoreHealth);
const mockFetchCore = vi.mocked(fetchCore);
const mockBuildForwardHeaders = vi.mocked(buildForwardHeaders);

// ---------------------------------------------------------------------------
// Health route tests
// ---------------------------------------------------------------------------

describe("Health route - fetchCoreHealth succeeds", () => {
  beforeEach(() => {
    mockFetchCoreHealth.mockResolvedValue({
      status: "ok",
      providers: ["claude", "openai"],
      backends: ["ollama"],
      cache_available: true,
    });
  });

  it("returns 200 with status ok when core is reachable", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.core).toBe("ok");
  });

  it("includes providers list from core response", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    const data = await res.json();
    expect(data.providers).toEqual(["claude", "openai"]);
  });

  it("includes backends list from core response", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    const data = await res.json();
    expect(data.backends).toEqual(["ollama"]);
  });

  it("reports cache_available flag from core response", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    const data = await res.json();
    expect(data.cache_available).toBe(true);
  });
});

describe("Health route - fetchCoreHealth fails", () => {
  beforeEach(() => {
    mockFetchCoreHealth.mockRejectedValue(new Error("ECONNREFUSED"));
  });

  it("returns 503 when core is unreachable", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    expect(res.status).toBe(503);
  });

  it("returns degraded status when core is unreachable", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    const data = await res.json();
    expect(data.status).toBe("degraded");
    expect(data.core).toBe("unreachable");
  });

  it("returns empty arrays for providers and backends when core is unreachable", async () => {
    const app = new OpenAPIHono();
    registerHealthRoute(app);
    const res = await app.request("/health");
    const data = await res.json();
    expect(data.providers).toEqual([]);
    expect(data.backends).toEqual([]);
    expect(data.cache_available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Core proxy route tests
// ---------------------------------------------------------------------------

describe("Core proxy routes - successful passthrough", () => {
  beforeEach(() => {
    mockBuildForwardHeaders.mockReturnValue({
      headers: new Headers(),
      correlationId: "corr-test-123",
    });
  });

  it("proxies GET /models and returns the upstream response body", async () => {
    mockFetchCore.mockResolvedValue(
      new Response(JSON.stringify({ models: ["gpt-4", "claude-3"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/models");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-correlation-id")).toBe("corr-test-123");
    const data = await res.json();
    expect(data).toHaveProperty("models");
  });

  it("proxies GET /stats and forwards the upstream status code", async () => {
    mockFetchCore.mockResolvedValue(
      new Response(JSON.stringify({ requests: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/stats");
    expect(res.status).toBe(200);
  });

  it("proxies GET /api/search to the RAG search upstream and preserves query strings", async () => {
    mockFetchCore.mockImplementation(async (path: string) => {
      expect(path).toBe("/rag/search?q=pcb&top_k=2&collections=life_chunks");
      return new Response(JSON.stringify({
        query: "pcb",
        mode: "dense",
        collections: ["life_chunks"],
        results: [],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/api/search?q=pcb&top_k=2&collections=life_chunks");

    expect(res.status).toBe(200);
    expect(res.headers.get("x-correlation-id")).toBe("corr-test-123");
    expect(await res.json()).toEqual({
      query: "pcb",
      mode: "dense",
      collections: ["life_chunks"],
      results: [],
    });
  });

  it("proxies GET /conversations and returns upstream body", async () => {
    mockFetchCore.mockResolvedValue(
      new Response(JSON.stringify({ conversations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/conversations");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("conversations");
  });

  it("proxies parameterized conversation routes with the documented OpenAPI paths", async () => {
    mockFetchCore.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/conversations/conv-123" && init?.method === "GET") {
        return new Response(JSON.stringify({
          id: "conv-123",
          title: "Test conversation",
          provider: "ollama",
          messages: [{ role: "user", content: "hello" }],
          created_at: "2026-04-05T00:00:00Z",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (path === "/conversations/conv-123/messages" && init?.method === "POST") {
        return new Response(JSON.stringify({ status: "ok", message_count: 2 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (path === "/conversations/conv-123" && init?.method === "DELETE") {
        return new Response(JSON.stringify({ status: "deleted" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetchCore call: ${path} ${init?.method}`);
    });

    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);

    const getRes = await app.request("/conversations/conv-123");
    const addRes = await app.request(
      new Request("http://localhost/conversations/conv-123/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "user", content: "hello" }),
      }),
    );
    const deleteRes = await app.request(
      new Request("http://localhost/conversations/conv-123", {
        method: "DELETE",
      }),
    );

    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({ id: "conv-123", provider: "ollama" });
    expect(addRes.status).toBe(200);
    expect(await addRes.json()).toEqual({ status: "ok", message_count: 2 });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({ status: "deleted" });
  });
});

describe("Core proxy routes - upstream failures", () => {
  it("returns 502 with error message when fetchCore throws a network error", async () => {
    mockFetchCore.mockRejectedValue(new Error("ECONNREFUSED"));
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/models");
    expect(res.status).toBe(502);
    expect(res.headers.get("x-correlation-id")).toBe("corr-test-123");
    const data = await res.json();
    expect(data.error).toContain("Failed to call life-core");
  });

  it("forwards a 404 status code returned by the upstream core service", async () => {
    mockFetchCore.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      })
    );
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/stats");
    expect(res.status).toBe(404);
  });

  it("returns 502 with error field when a non-Error value is thrown", async () => {
    mockFetchCore.mockRejectedValue("non-Error rejection");
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/rag/stats");
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });
});
