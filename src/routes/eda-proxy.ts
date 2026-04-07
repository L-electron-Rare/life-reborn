import type { Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";

const CAD_URL = process.env.CAD_URL || "http://makelife-cad:8001";

export function registerEdaProxyRoutes(app: OpenAPIHono): void {
  app.all("/eda/*", async (c: Context) => {
    try {
      const requestUrl = new URL(c.req.url);
      const upstreamPath = c.req.path.replace(/^\/eda/, "") || "/";
      const targetUrl = `${CAD_URL}${upstreamPath}${requestUrl.search}`;

      const headers = new Headers(c.req.raw.headers);
      headers.delete("host");

      const init: RequestInit & { duplex?: "half" } = {
        method: c.req.raw.method,
        headers,
      };

      if (!["GET", "HEAD"].includes(c.req.raw.method.toUpperCase())) {
        init.body = c.req.raw.body;
        init.duplex = "half";
      }

      const response = await fetch(targetUrl, init);
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `EDA proxy failed: ${message}` }, 502);
    }
  });
}
