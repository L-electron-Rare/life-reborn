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
});
