import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { resetJwtCacheForTests } from "./middleware/jwt.js";

describe("life-reborn bootstrap", () => {
  afterEach(() => {
    delete process.env.LIFE_REBORN_ALLOW_PUBLIC_API;
    delete process.env.CORE_URL;
    delete process.env.KEYCLOAK_JWKS_URL;
    delete process.env.KEYCLOAK_ISSUER;
    resetJwtCacheForTests();
  });

  it("returns 401 on protected routes without auth", async () => {
    const app = buildApp();
    const response = await app.request("/api/providers");
    expect(response.status).toBe(401);
  });

  it("protects the chat route when no bearer token is provided", async () => {
    const app = buildApp();
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });
    expect(response.status).toBe(401);
  });

  it("responds to the health endpoint", async () => {
    const app = buildApp();
    const response = await app.request("/health");
    expect([200, 503]).toContain(response.status);
  });
});
