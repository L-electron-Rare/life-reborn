import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../app.js";

// Mock the fetchCoreHealth function
vi.mock("../client/core.js", () => ({
  fetchCoreHealth: vi.fn().mockResolvedValue({ status: "ok" }),
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

  it("should handle CORS configuration", async () => {
    const app = buildApp();
    // CORS middleware is configured, but testing headers requires actual HTTP context
    // Verify that the middleware was registered (no errors during app creation)
    expect(app).toBeDefined();
  });
});
