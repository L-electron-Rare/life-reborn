import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { rateLimitMiddleware } from "../middleware/rate-limit.js";

// The in-memory store is module-level, so we need a fresh import per describe block.
// We reset by faking time so windows expire between tests.

function createApp() {
  const app = new Hono();
  app.use("/*", rateLimitMiddleware);
  app.get("/ping", (c) => c.json({ pong: true }));
  return app;
}

function makeRequest(app: Hono, ip?: string) {
  const headers: Record<string, string> = {};
  if (ip) headers["x-forwarded-for"] = ip;
  return app.request("/ping", { headers });
}

describe("rateLimitMiddleware - basic pass-through", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LIFE_REBORN_RATE_LIMIT_RPM", "5");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns 200 for first request from a given IP", async () => {
    const app = createApp();
    const res = await makeRequest(app, "10.0.0.1");
    expect(res.status).toBe(200);
  });

  it("returns 200 for requests within the rate limit", async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app, "10.0.0.2");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when request count exceeds the configured limit", async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      await makeRequest(app, "10.0.0.3");
    }
    const res = await makeRequest(app, "10.0.0.3");
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toBe("Too many requests");
  });

  it("isolates rate limit counters per IP address", async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      await makeRequest(app, "10.0.0.4");
    }
    // Different IP should still get through
    const res = await makeRequest(app, "10.0.0.5");
    expect(res.status).toBe(200);
  });

  it("resets counter after the time window expires", async () => {
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      await makeRequest(app, "10.0.0.6");
    }
    // Advance time past the 60s window
    vi.advanceTimersByTime(61_000);
    const res = await makeRequest(app, "10.0.0.6");
    expect(res.status).toBe(200);
  });
});

describe("rateLimitMiddleware - default limit fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LIFE_REBORN_RATE_LIMIT_RPM", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("applies default limit of 60 when env var is not set", async () => {
    const app = createApp();
    // Send 60 requests — all should pass
    for (let i = 0; i < 60; i++) {
      const res = await makeRequest(app, "10.0.0.7");
      expect(res.status).toBe(200);
    }
    // The 61st should be rate-limited
    const res = await makeRequest(app, "10.0.0.7");
    expect(res.status).toBe(429);
  });
});

describe("rateLimitMiddleware - IP detection fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("LIFE_REBORN_RATE_LIMIT_RPM", "2");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("falls back to 'local' key when no IP header is present", async () => {
    const app = createApp();
    // Without any IP header two requests should pass
    await makeRequest(app);
    const res2 = await makeRequest(app);
    expect(res2.status).toBe(200);
    // Third should be limited under the 'local' key
    const res3 = await makeRequest(app);
    expect(res3.status).toBe(429);
  });
});
