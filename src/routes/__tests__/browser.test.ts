import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  BROWSER_SCRAPE_TIMEOUT_DEFAULT_MS,
  BROWSER_SCRAPE_TIMEOUT_MAX_MS,
  BROWSER_SCRAPE_TIMEOUT_MIN_MS,
  BrowserScrapeRequestSchema,
  BrowserScrapeResponseSchema,
  registerBrowserRoute,
  toCoreBrowserScrapeRequest,
} from "../browser.js";

const CONTRACT_CANDIDATES = [
  path.resolve(process.cwd(), "../finefab-shared/schemas/browser_scrape.schema.json"),
  path.resolve(process.cwd(), "src/routes/__tests__/fixtures/browser_scrape.schema.json"),
];

async function readBrowserContract() {
  for (const contractPath of CONTRACT_CANDIDATES) {
    try {
      return JSON.parse(await readFile(contractPath, "utf8"));
    } catch {
      // Try the next location. Standalone CI does not checkout sibling repos.
    }
  }
  throw new Error("Unable to locate browser scrape contract snapshot");
}

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
    expect(response.headers.get("x-correlation-id")).toBeTruthy();

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const init = fetchCall?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("x-correlation-id")).toBeTruthy();
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

  it("should map the public payload to the shared life-core contract", async () => {
    const payload = BrowserScrapeRequestSchema.parse({
      url: "https://example.com",
      selector: null,
    });

    expect(toCoreBrowserScrapeRequest(payload)).toEqual({
      url: "https://example.com",
      selector: null,
      timeout_ms: BROWSER_SCRAPE_TIMEOUT_DEFAULT_MS,
    });
  });

  it("should stay aligned with finefab-shared browser_scrape.schema.json", async () => {
    const contract = await readBrowserContract();

    const requestSchema = contract.properties.request;
    const responseSchema = contract.properties.response;

    expect(new Set(Object.keys(requestSchema.properties))).toEqual(
      new Set(["url", "selector", "timeout_ms"]),
    );
    expect(requestSchema.required).toEqual(["url"]);
    expect(requestSchema.properties.timeout_ms.minimum).toBe(BROWSER_SCRAPE_TIMEOUT_MIN_MS);
    expect(requestSchema.properties.timeout_ms.maximum).toBe(BROWSER_SCRAPE_TIMEOUT_MAX_MS);

    expect(
      BrowserScrapeRequestSchema.safeParse({
        url: "https://example.com",
        selector: null,
      }).success,
    ).toBe(true);
    expect(
      BrowserScrapeRequestSchema.safeParse({
        url: "https://example.com",
        timeoutMs: 0,
      }).success,
    ).toBe(false);
    expect(
      BrowserScrapeRequestSchema.safeParse({
        url: "https://example.com",
        timeoutMs: 120001,
      }).success,
    ).toBe(false);
    expect(
      BrowserScrapeResponseSchema.safeParse({
        url: "https://example.com",
        title: "Example",
        content: "Hello",
      }).success,
    ).toBe(true);
    expect(new Set(Object.keys(responseSchema.properties))).toEqual(
      new Set(["url", "title", "content"]),
    );
    expect(responseSchema.required).toEqual(["url", "title", "content"]);
  });
});
