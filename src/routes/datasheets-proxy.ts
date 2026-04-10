import type { Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";
import { callDatasheetTool } from "../client/datasheet-mcp.js";

const ingestSchema = z.object({
  mpn: z.string().min(1),
  url: z.string().optional(),
});

const compareSchema = z.object({
  mpns: z.array(z.string()).min(2),
  criteria: z.array(z.string()).default(["voltage", "current", "package", "price"]),
});

function extractText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  const first = r?.content?.[0];
  return first?.text ?? "";
}

export function registerDatasheetsProxyRoutes(app: OpenAPIHono): void {
  app.post("/api/datasheets/ingest", async (c: Context) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
    }
    try {
      const result = await callDatasheetTool("ingest_datasheet", {
        mpn: parsed.data.mpn,
        url: parsed.data.url ?? "",
      });
      return c.json({
        queued: true,
        mpn: parsed.data.mpn,
        message: extractText(result),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return c.json({ error: `Failed to ingest: ${msg}` }, 502);
    }
  });

  app.post("/api/datasheets/compare", async (c: Context) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = compareSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.issues }, 400);
    }
    try {
      const result = await callDatasheetTool("compare_components", {
        mpns: parsed.data.mpns,
        criteria: parsed.data.criteria,
      });
      return c.json({
        table: extractText(result),
        mpns: parsed.data.mpns,
        criteria: parsed.data.criteria,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      return c.json({ error: `Failed to compare: ${msg}` }, 502);
    }
  });
}
