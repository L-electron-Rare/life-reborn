import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const ProvidersResponseSchema = z.object({
  providers: z.array(z.string()).openapi({ example: ["claude", "openai", "mistral"] }),
});

const providersRoute = createRoute({
  method: "get",
  path: "/api/providers",
  responses: {
    200: {
      description: "Configured provider list",
      content: {
        "application/json": {
          schema: ProvidersResponseSchema,
        },
      },
    },
  },
});

export function registerProvidersRoute(app: OpenAPIHono): void {
  app.openapi(providersRoute, (c) => {
    const configuredProviders = String(process.env.LIFE_REBORN_PROVIDERS || "claude,openai,mistral")
      .split(",")
      .map((provider) => provider.trim())
      .filter(Boolean);
    return c.json({ providers: configuredProviders }, 200);
  });
}