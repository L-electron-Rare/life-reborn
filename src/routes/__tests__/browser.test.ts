import { describe, it, expect, beforeAll, vi } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { registerBrowserRoute } from "../browser.js";

describe("Browser Route - life-core integration", () => {
  let app: OpenAPIHono;

  beforeAll(() => {
    app = new OpenAPIHono();
    registerBrowserRoute(app);
  });

  it("should return 200 for a valid scrape response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://example.com",
          title: "Example",
          content: "Hello",
        }),
        { status: 200 }
      )
    );

    const response = await app.request(
      new Request("http://localhost/api/browser/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", timeoutMs: 5000 }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.title).toBe("Example");
  });

  it("should map life-core errors to 500", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("boom", { status: 503 }));

    const response = await app.request(
      new Request("http://localhost/api/browser/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      })
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain("life-core API error");
  });
});
