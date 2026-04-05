import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import {
  authMiddleware,
  isAuthConfigured,
  allowPublicApi,
  extractBearerToken,
  matchesStaticBearerToken,
} from "../middleware/auth.js";

function createApp() {
  const app = new Hono();
  app.use("/*", authMiddleware);
  app.get("/protected", (c) => c.json({ ok: true }));
  return app;
}

describe("authMiddleware - public API mode", () => {
  beforeEach(() => {
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "true");
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows request without Authorization header when public API mode is enabled", async () => {
    const app = createApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("allows request with any token when public API mode is enabled", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer anything-goes" },
    });
    expect(res.status).toBe(200);
  });
});

describe("authMiddleware - token configured, public mode off", () => {
  const SECRET = "super-secret-token";

  beforeEach(() => {
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "false");
    vi.stubEnv("LIFE_REBORN_API_TOKEN", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 when valid Bearer token is provided", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = createApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 401 when token does not match expected value", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 401 when Authorization uses Basic scheme instead of Bearer", async () => {
    const app = createApp();
    const res = await app.request("/protected", {
      headers: { Authorization: `Basic ${Buffer.from(`user:${SECRET}`).toString("base64")}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("authMiddleware - no token configured and public mode off (fail-closed)", () => {
  beforeEach(() => {
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "false");
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 for every request when no token is configured", async () => {
    const app = createApp();
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });
});

describe("isAuthConfigured helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when LIFE_REBORN_API_TOKEN has a non-empty value", () => {
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "my-token");
    expect(isAuthConfigured()).toBe(true);
  });

  it("returns false when LIFE_REBORN_API_TOKEN is empty", () => {
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "");
    expect(isAuthConfigured()).toBe(false);
  });
});

describe("allowPublicApi helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when LIFE_REBORN_ALLOW_PUBLIC_API is set to 1", () => {
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "1");
    expect(allowPublicApi()).toBe(true);
  });

  it("returns true when LIFE_REBORN_ALLOW_PUBLIC_API is set to true", () => {
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "true");
    expect(allowPublicApi()).toBe(true);
  });

  it("returns false when LIFE_REBORN_ALLOW_PUBLIC_API is absent", () => {
    vi.stubEnv("LIFE_REBORN_ALLOW_PUBLIC_API", "");
    expect(allowPublicApi()).toBe(false);
  });
});

describe("Bearer token helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("extracts the Bearer token value from the Authorization header", () => {
    expect(extractBearerToken("Bearer abc-123")).toBe("abc-123");
  });

  it("returns false when the configured static token is missing", () => {
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "");
    expect(matchesStaticBearerToken("Bearer abc-123")).toBe(false);
  });

  it("returns true when the Authorization header matches the configured static token", () => {
    vi.stubEnv("LIFE_REBORN_API_TOKEN", "abc-123");
    expect(matchesStaticBearerToken("Bearer abc-123")).toBe(true);
  });
});
