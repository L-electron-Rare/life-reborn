import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { fetchCoreHealth } from "../client/core.js";

const HealthResponseSchema = z.object({
  status: z.string().openapi({ example: "ok" }),
  core: z.string().openapi({ example: "ok" }),
  providers: z.array(z.string()).default([]),
  backends: z.array(z.string()).default([]),
  cache_available: z.boolean().default(false),
  router_status: z.record(z.string(), z.boolean()).default({}),
  issues: z.array(z.string()).default([]),
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      description: "Gateway health status",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
    503: {
      description: "Gateway degraded",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

export function registerHealthRoute(app: OpenAPIHono): void {
  app.openapi(healthRoute, async (c) => {
    try {
      const core = await fetchCoreHealth();
      return c.json({
        status: "ok",
        core: core.status,
        providers: core.providers ?? [],
        backends: core.backends ?? [],
        cache_available: core.cache_available ?? false,
        router_status: core.router_status ?? {},
        issues: core.issues ?? [],
      }, 200);
    } catch {
      return c.json({
        status: "degraded",
        core: "unreachable",
        providers: [],
        backends: [],
        cache_available: false,
        router_status: {},
        issues: [],
      }, 503);
    }
  });
}
