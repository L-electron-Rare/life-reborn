import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { registerChatRouteV2, registerChatRouteV1 } from "../chat-v2.js";

describe("Chat V2 Route - life-core integration", () => {
  let app: OpenAPIHono;

  beforeAll(() => {
    app = new OpenAPIHono();
    registerChatRouteV2(app);
    registerChatRouteV1(app);
  });

  it("should register v2 and v1 routes without errors", () => {
    expect(app).toBeDefined();
  });

  it("should handle /api/v1/chat bootstrap fallback", async () => {
    const response = await app.request(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "test" }],
          model: "claude-3-5-sonnet-20241022",
        }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("content");
    expect(data).toHaveProperty("model");
    expect(data.provider).toBe("bootstrap");
  });

  it("should mock life-core /api/chat endpoint when server unavailable", async () => {
    // Mock fetch to simulate life-core API
    global.fetch = vi.fn().mockRejectedValue(
      new Error("ECONNREFUSED: Connection refused")
    );

    const response = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
          model: "claude-3-5-sonnet-20241022",
          provider: "claude",
        }),
      })
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("Failed to call life-core");
  });
});

describe("Chat V2 Route - Request Validation", () => {
  let app: OpenAPIHono;

  beforeAll(() => {
    app = new OpenAPIHono();
    registerChatRouteV2(app);
  });

  it("should validate required messages field", async () => {
    const response = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
        }),
      })
    );

    // Zod validation should fail
    expect(response.status).not.toBe(200);
  });

  it("should handle empty messages array", async () => {
    const response = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [],
          model: "claude-3-5-sonnet-20241022",
        }),
      })
    );

    // Should fail validation due to .min(1)
    expect(response.status).not.toBe(200);
  });

  it("should accept valid request with optional fields", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: "Mocked response",
          model: "claude-3-5-sonnet-20241022",
          provider: "claude",
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        { status: 200 }
      )
    );

    const response = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "user", content: "test" },
          ],
          // model and provider are optional but with defaults
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-correlation-id")).toBeTruthy();
  });
});
