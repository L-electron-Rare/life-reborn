/**
 * Chat route v2 - Appelle life-core API
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { fetchCore } from "../client/core.js";

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })).min(1),
  model: z.string().optional().default("claude-3-5-sonnet-20241022"),
  provider: z.string().optional(),
  useRag: z.boolean().optional().default(false),
});

const ChatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  provider: z.string(),
  usage: z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
  }).optional(),
  trace_id: z.string().optional(),
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
      description: "Chat response from life-core",
      content: {
        "application/json": {
          schema: ChatResponseSchema,
        },
      },
    },
    500: {
      description: "Error calling life-core API",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
});

interface LifeCoreResponse {
  content: string;
  model: string;
  provider: string;
  usage?: Record<string, number>;
  trace_id?: string;
}

export function registerChatRouteV2(app: OpenAPIHono): void {
  app.openapi(chatRoute, async (c) => {
    const payload = c.req.valid("json");
    
    try {
      const response = await fetchCore("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: payload.messages,
          model: payload.model,
          provider: payload.provider,
          use_rag: payload.useRag,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`life-core error: ${response.status} - ${error}`);
        return c.json(
          { error: `life-core API error: ${response.status}` },
          500
        );
      }
      
      const data: LifeCoreResponse = await response.json();
      
      return c.json(
        {
          content: data.content,
          model: data.model,
          provider: data.provider,
          usage: data.usage,
          trace_id: data.trace_id,
        },
        200
      );
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json(
        { error: `Failed to call life-core: ${errorMessage}` },
        500
      );
    }
  });
}

/**
 * Chat route v1 (bootstrap/fallback)
 */
const chatRouteV1 = createRoute({
  method: "post",
  path: "/api/v1/chat",
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
      description: "Bootstrap chat response",
      content: {
        "application/json": {
          schema: ChatResponseSchema,
        },
      },
    },
  },
});

export function registerChatRouteV1(app: OpenAPIHono): void {
  app.openapi(chatRouteV1, (c) => {
    const payload = c.req.valid("json");
    return c.json(
      {
        content: `life-reborn bootstrap: ${payload.messages[0]?.content || "empty"}`,
        model: payload.model,
        provider: "bootstrap",
      },
      200
    );
  });
}
