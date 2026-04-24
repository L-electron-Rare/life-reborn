import { beforeEach, describe, it, expect } from "vitest";
import { Hono } from "hono";
import { jwtAuthMiddleware, resetJwtCacheForTests } from "../middleware/jwt";

describe("JWT Auth Middleware", () => {
  beforeEach(() => {
    resetJwtCacheForTests();
  });

  function createApp(opts: { bypass?: boolean } = {}) {
    const app = new Hono();
    app.use(
      "/*",
      jwtAuthMiddleware({
        jwksUrl: "http://localhost/.well-known/jwks.json",
        issuer: "http://localhost/realms/finefab",
        bypassAuth: opts.bypass || false,
      })
    );
    app.get("/protected", (c) => c.json({ ok: true }));
    // Catch-all for testing JWT on any path
    app.all("/*", (c) => c.json({ ok: true }));
    return app;
  }

  it("should return 401 when no Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Missing");
  });

  it("should return 401 when token is invalid", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  it("should bypass auth when bypassAuth is true", async () => {
    const app = createApp({ bypass: true });
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("should return 401 with non-Bearer auth scheme", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });

  it("should return 401 on proxy routes when auth is enabled", async () => {
    const app = createApp();
    const proxyPaths = ["/models", "/stats", "/conversations", "/rag/stats", "/infra/containers"];
    for (const path of proxyPaths) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
    }
  });

  describe("access_token query string fallback (SSE / EventSource)", () => {
    it("accepts ?access_token=<jwt> on /events when Authorization header absent", async () => {
      const app = createApp();
      // EventSource cannot set custom headers, so frontend passes token in query string.
      // Token is invalid here, but the middleware must at least *consider* it (401 for
      // "Invalid or expired token") instead of rejecting with "Missing Authorization header".
      const res = await app.request("/events?access_token=not-a-real-jwt");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).not.toContain("Missing");
      expect(data.error).toContain("Invalid");
    });

    it("rejects /events without any token (neither header nor query)", async () => {
      const app = createApp();
      const res = await app.request("/events");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Missing");
    });

    it("ignores ?access_token query on non-/events routes (scope restriction)", async () => {
      const app = createApp();
      // Query-string token must NOT be honored on other routes, to avoid leaking
      // the token in access logs / referrers for non-SSE endpoints.
      const res = await app.request("/stats?access_token=not-a-real-jwt");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Missing");
    });
  });
});
