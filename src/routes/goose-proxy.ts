import type { Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { buildForwardHeaders, fetchCore } from "../client/core.js";

/**
 * Proxy routes for Goose agent endpoints.
 * All /goose/* requests are forwarded to life-core /goose/*.
 * SSE streaming responses are passed through transparently.
 */
export function registerGooseProxyRoutes(app: OpenAPIHono): void {
  app.all("/goose/*", async (c: Context) => {
    return proxyGoose(c);
  });
}

async function proxyGoose(c: Context): Promise<Response> {
  const { headers, correlationId } = buildForwardHeaders(
    c.req.raw,
    c.req.raw.headers,
  );

  try {
    const requestUrl = new URL(c.req.url);
    const targetPath = `${c.req.path}${requestUrl.search}`;
    headers.delete("host");

    const init: RequestInit & { duplex?: "half" } = {
      method: c.req.raw.method,
      headers,
    };

    if (!["GET", "HEAD"].includes(c.req.raw.method.toUpperCase())) {
      init.body = c.req.raw.body;
      init.duplex = "half";
    }

    const response = await fetchCore(targetPath, init);

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("X-Correlation-ID", correlationId);

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: `Failed to proxy goose request: ${message}` },
      502,
      { "X-Correlation-ID": correlationId },
    );
  }
}
