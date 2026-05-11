import type { Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";

const DESIGN_URL = process.env.DESIGN_URL || "http://localhost:9310";

/**
 * Proxy /design/* to the hardware-coagent FastAPI service.
 *
 * Upstream is the multi-agent hardware co-design service exposed by
 * `apps/design` (or running on electron-server:9310). Mirrors the
 * shape of registerEdaProxyRoutes for consistency. SSE streams pass
 * through transparently because we re-use the upstream body stream.
 */
export function registerDesignProxyRoutes(app: OpenAPIHono): void {
  app.all("/design/*", async (c: Context) => {
    try {
      const requestUrl = new URL(c.req.url);
      const upstreamPath = c.req.path; // keep /design/... prefix as-is
      const targetUrl = `${DESIGN_URL}${upstreamPath}${requestUrl.search}`;

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
      return c.json({ error: `Design proxy failed: ${message}` }, 502);
    }
  });
}
