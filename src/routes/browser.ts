import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { buildForwardHeaders, fetchCore } from "../client/core.js";

export const BROWSER_SCRAPE_TIMEOUT_DEFAULT_MS = 15000;
export const BROWSER_SCRAPE_TIMEOUT_MIN_MS = 1;
export const BROWSER_SCRAPE_TIMEOUT_MAX_MS = 120000;

export const BrowserScrapeRequestSchema = z.object({
  url: z.string().url(),
  selector: z.string().nullable().optional(),
  timeoutMs: z
    .number()
    .int()
    .min(BROWSER_SCRAPE_TIMEOUT_MIN_MS)
    .max(BROWSER_SCRAPE_TIMEOUT_MAX_MS)
    .optional()
    .default(BROWSER_SCRAPE_TIMEOUT_DEFAULT_MS),
});

export const BrowserScrapeResponseSchema = z.object({
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

export type BrowserScrapeRequest = z.infer<typeof BrowserScrapeRequestSchema>;

export function toCoreBrowserScrapeRequest(payload: BrowserScrapeRequest) {
  return {
    url: payload.url,
    selector: payload.selector ?? null,
    timeout_ms: payload.timeoutMs,
  };
}

export function registerBrowserRoute(app: OpenAPIHono): void {
  app.openapi(browserScrapeRoute, async (c) => {
    const payload = c.req.valid("json");
    const { headers, correlationId } = buildForwardHeaders(c.req.raw, {
      "Content-Type": "application/json",
    });

    try {
      const response = await fetchCore("/scrape", {
        method: "POST",
        headers,
        body: JSON.stringify(toCoreBrowserScrapeRequest(payload)),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`life-core scrape error: ${response.status} - ${error}`);
        return c.json(
          { error: `life-core API error: ${response.status}` },
          500,
          { "X-Correlation-ID": correlationId },
        );
      }

      const data = await response.json();
      return c.json(data, 200, { "X-Correlation-ID": correlationId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json(
        { error: `Failed to call life-core: ${errorMessage}` },
        500,
        { "X-Correlation-ID": correlationId },
      );
    }
  });
}
