import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("life-reborn bootstrap", () => {
  afterEach(() => {
    delete process.env.LIFE_REBORN_API_TOKEN;
    delete process.env.LIFE_REBORN_ALLOW_PUBLIC_API;
  });

  it("returns providers without auth by default", async () => {
    const app = buildApp();
    const response = await app.request("/api/providers");
    expect(response.status).toBe(200);
  });

  it("protects the chat route when auth is configured", async () => {
    process.env.LIFE_REBORN_API_TOKEN = "secret-token";
    const app = buildApp();
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });
    expect(response.status).toBe(401);
  });

  it("responds to the health endpoint", async () => {
    const app = buildApp();
    const response = await app.request("/health");
    expect([200, 503]).toContain(response.status);
  });
});