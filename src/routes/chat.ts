import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const ChatRequestSchema = z.object({
  prompt: z.string().min(1).openapi({ example: "Bonjour" }),
});

const ChatResponseSchema = z.object({
  reply: z.string().openapi({ example: "life-reborn bootstrap: Bonjour" }),
});

const chatRoute = createRoute({
  method: "post",
  path: "/api/chat",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ChatRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Minimal chat bootstrap endpoint",
      content: {
        "application/json": {
          schema: ChatResponseSchema,
        },
      },
    },
  },
});

export function registerChatRoute(app: OpenAPIHono): void {
  app.openapi(chatRoute, (c) => {
    const payload = c.req.valid("json");
    return c.json({ reply: `life-reborn bootstrap: ${payload.prompt}` }, 200);
  });
}