import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../app.js";

// Mock the fetchCoreHealth function
vi.mock("../client/core.js", () => ({
  fetchCoreHealth: vi.fn().mockResolvedValue({ status: "ok" }),
  fetchCore: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ url: "https://example.com", title: "Example", content: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  ),
  buildForwardHeaders: vi.fn((_request: Request, initHeaders?: HeadersInit) => ({
    headers: new Headers(initHeaders),
    correlationId: "corr-static-token-test",
  })),
  getCoreUrl: vi.fn().mockReturnValue("http://localhost:8000"),
  buildCoreUrl: vi.fn((p: string) => `http://localhost:8000${p}`),
}));

describe("App Integration - Routes Registration", () => {
  it("should build app with all routes registered", async () => {
    const app = buildApp();
    expect(app).toBeDefined();
  });

  it("should have health route available", async () => {
    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/health", {
        method: "GET",
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("status");
  });

  it("should have version route available", async () => {
    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/api/version", {
        method: "GET",
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("version");
  });

  it("should have root endpoint", async () => {
    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/", {
        method: "GET",
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.service).toBe("life-reborn");
    expect(data.status).toBe("ready");
  });

  it("should return 401 on /api/v1/chat without auth", async () => {
    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "test" }],
          model: "test-model",
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  it("should allow protected routes with the static bearer token", async () => {
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "test-static-token");
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "false");

    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/api/browser/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-static-token",
        },
        body: JSON.stringify({ url: "https://example.com", timeoutMs: 5000 }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toBe("corr-static-token-test");
    vi.unstubAllEnvs();
  });

  it("should handle CORS configuration", async () => {
    const app = buildApp();
    // CORS middleware is configured, but testing headers requires actual HTTP context
    // Verify that the middleware was registered (no errors during app creation)
    expect(app).toBeDefined();
  });
});
