import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { fetchCore } from "../client/core.js";

const BrowserScrapeRequestSchema = z.object({
  url: z.string().url(),
  selector: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(1).max(120000).optional().default(15000),
});

const BrowserScrapeResponseSchema = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string(),
});

const BrowserErrorSchema = z.object({
  error: z.string(),
});

const browserScrapeRoute = createRoute({
  method: "post",
  path: "/api/browser/scrape",
  request: {
    body: {
      content: {
        "application/json": {
          schema: BrowserScrapeRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Scrape response from life-core",
      content: {
        "application/json": {
          schema: BrowserScrapeResponseSchema,
        },
      },
    },
    500: {
      description: "Error calling life-core scraping endpoint",
      content: {
        "application/json": {
          schema: BrowserErrorSchema,
        },
      },
    },
  },
});

export function registerBrowserRoute(app: OpenAPIHono): void {
  app.openapi(browserScrapeRoute, async (c) => {
    const payload = c.req.valid("json");

    try {
      const response = await fetchCore("/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: payload.url,
          selector: payload.selector,
          timeout_ms: payload.timeoutMs,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`life-core scrape error: ${response.status} - ${error}`);
        return c.json({ error: `life-core API error: ${response.status}` }, 500);
      }

      const data = await response.json();
      return c.json(data, 200);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to call life-core: ${errorMessage}` }, 500);
    }
  });
}
