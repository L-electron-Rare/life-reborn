import type { Context } from "hono";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { fetchCore } from "../client/core.js";

type ProxyRoute = {
  path: string;
  upstreamPath?: string;
};

const CORE_PROXY_ROUTES: ProxyRoute[] = [
  { path: "/models" },
  { path: "/models/catalog" },
  { path: "/stats" },
  { path: "/stats/timeseries" },
  { path: "/conversations" },
  { path: "/conversations/:convId" },
  { path: "/conversations/:convId/messages" },
  { path: "/rag/stats" },
  { path: "/rag/search" },
  { path: "/rag/documents" },
  { path: "/infra/containers" },
  { path: "/infra/storage" },
  { path: "/infra/network" },
  { path: "/logs/recent" },
  { path: "/traces/services" },
  { path: "/traces/recent" },
  { path: "/api/audit/status", upstreamPath: "/audit/status" },
  { path: "/api/audit/report", upstreamPath: "/audit/report" },
];

async function proxyToCore(c: Context, upstreamPath = c.req.path): Promise<Response> {
  try {
    const requestUrl = new URL(c.req.url);
    const targetPath = `${upstreamPath}${requestUrl.search}`;
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

    const response = await fetchCore(targetPath, init);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to call life-core: ${message}` }, 502);
  }
}

export function registerCoreProxyRoutes(app: OpenAPIHono): void {
  for (const route of CORE_PROXY_ROUTES) {
    app.all(route.path, (c) => proxyToCore(c, route.upstreamPath));
  }
}
