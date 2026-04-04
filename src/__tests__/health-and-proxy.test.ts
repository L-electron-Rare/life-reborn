import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";

// Module-level mocks — hoisted before any imports
vi.mock("../client/core.js", () => ({
  fetchCoreHealth: vi.fn(),
  fetchCore: vi.fn(),
  getCoreUrl: vi.fn().mockReturnValue("http://localhost:8000"),
  buildCoreUrl: vi.fn((p: string) => `http://localhost:8000${p}`),
}));

import { fetchCoreHealth, fetchCore } from "../client/core.js";
import { registerHealthRoute } from "../routes/health.js";
import { registerCoreProxyRoutes } from "../routes/core-proxy.js";

const mockFetchCoreHealth = vi.mocked(fetchCoreHealth);
const mockFetchCore = vi.mocked(fetchCore);

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
});

describe("Core proxy routes - upstream failures", () => {
  it("returns 502 with error message when fetchCore throws a network error", async () => {
    mockFetchCore.mockRejectedValue(new Error("ECONNREFUSED"));
    const app = new OpenAPIHono();
    registerCoreProxyRoutes(app);
    const res = await app.request("/models");
    expect(res.status).toBe(502);
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
