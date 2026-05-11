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

  // V1.8 Wave B axes 1+6 — multipart upload passthrough to datasheet-mcp HTTP.
  app.post("/api/datasheets/upload", async (c: Context) => {
    const upstream = process.env.DATASHEET_MCP_HTTP_URL
      ?? "http://datasheet-mcp:8023";
    const bearer = process.env.DATASHEET_BEARER ?? "";

    const incoming = await c.req.formData();
    const forwarded = new FormData();
    const file = incoming.get("file");
    const mpn = incoming.get("mpn");
    if (!(file instanceof Blob) || typeof mpn !== "string") {
      return c.json({ error: "missing file or mpn" }, 400);
    }
    const filename = (file as File).name ?? "upload.pdf";
    forwarded.append("file", file, filename);
    forwarded.append("mpn", mpn);

    const headers: Record<string, string> = {};
    if (bearer) headers["authorization"] = `Bearer ${bearer}`;

    const res = await fetch(`${upstream}/datasheets/upload`, {
      method: "POST",
      headers,
      body: forwarded,
    });
    const body = await res.json();
    return c.json(body, res.status as 200 | 400 | 401 | 415 | 422 | 500);
  });

  // V1.8 Wave B axes 1+6 — list passthrough so the cockpit can render
  // the sidebar without going direct to the MCP host.
  app.get("/api/datasheets/list", async (c: Context) => {
    const upstream = process.env.DATASHEET_MCP_HTTP_URL
      ?? "http://datasheet-mcp:8023";
    const bearer = process.env.DATASHEET_BEARER ?? "";
    const res = await fetch(`${upstream}/datasheets`, {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    });
    return c.json(await res.json(), res.status as 200 | 401 | 500);
  });

  // V1.8 Wave B axes 1+6 — keyword search passthrough.
  app.get("/api/datasheets/search", async (c: Context) => {
    const upstream = process.env.DATASHEET_MCP_HTTP_URL
      ?? "http://datasheet-mcp:8023";
    const bearer = process.env.DATASHEET_BEARER ?? "";
    const q = c.req.query("q") ?? "";
    const limit = c.req.query("limit") ?? "20";
    const res = await fetch(
      `${upstream}/datasheets/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} },
    );
    return c.json(await res.json(), res.status as 200 | 401 | 500);
  });
}
