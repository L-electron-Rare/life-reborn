import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerGooseProxyRoutes } from "../routes/goose-proxy.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("goose-proxy", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    registerGooseProxyRoutes(app as any);
    vi.clearAllMocks();
  });

  it("proxies GET /goose/health to life-core", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await app.request("/goose/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("proxies GET /goose/recipes to life-core", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ recipes: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await app.request("/goose/recipes");
    expect(res.status).toBe(200);
  });

  it("proxies POST /goose/sessions to life-core", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ session_id: "abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await app.request("/goose/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ working_dir: "/tmp" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 502 on upstream failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    const res = await app.request("/goose/health");
    expect(res.status).toBe(502);
  });
});
