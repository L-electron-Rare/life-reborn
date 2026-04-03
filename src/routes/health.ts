import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { fetchCoreHealth } from "../client/core.js";

const HealthResponseSchema = z.object({
  status: z.string().openapi({ example: "ok" }),
  core: z.string().openapi({ example: "ok" }),
  providers: z.array(z.string()).default([]),
  cache_available: z.boolean().default(false),
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
        cache_available: core.cache_available ?? false,
      }, 200);
    } catch {
      return c.json({
        status: "degraded",
        core: "unreachable",
        providers: [],
        cache_available: false,
      }, 503);
    }
  });
}
