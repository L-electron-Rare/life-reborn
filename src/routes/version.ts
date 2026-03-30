import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const VersionResponseSchema = z.object({
  service: z.string().openapi({ example: "life-reborn" }),
  version: z.string().openapi({ example: "0.1.0" }),
});

const versionRoute = createRoute({
  method: "get",
  path: "/api/version",
  responses: {
    200: {
      description: "Gateway version",
      content: {
        "application/json": {
          schema: VersionResponseSchema,
        },
      },
    },
  },
});

export function registerVersionRoute(app: OpenAPIHono): void {
  app.openapi(versionRoute, (c) => c.json({ service: "life-reborn", version: "0.1.0" }, 200));
}