/**
 * OpenAPI Schema Generator
 * 
 * Generates OpenAPI 3.0.0 schema for life-reborn API using Hono routes
 * Usage: npm run openapi:generate
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

// Manually define OpenAPI schema based on implemented routes
const openAPISchema = {
  openapi: "3.0.0",
  info: {
    title: "life-reborn API",
    version: "1.0.0",
    description:
      "Gateway API for life-reborn service, bridging to life-core backend",
    contact: {
      name: "Factory 4 Life",
      url: "https://github.com/factory4life",
    },
    license: {
      name: "MIT",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Development server",
    },
    {
      url: "https://api.factory4life.com",
      description: "Production server",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        operationId: "getHealth",
        tags: ["System"],
        responses: {
          200: {
            description: "Gateway health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    core: { type: "string", example: "ok" },
                  },
                  required: ["status", "core"],
                },
              },
            },
          },
          503: {
            description: "Gateway degraded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "degraded" },
                    core: { type: "string", example: "unreachable" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/version": {
      get: {
        summary: "Get API version",
        operationId: "getVersion",
        tags: ["System"],
        responses: {
          200: {
            description: "API version information",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    version: { type: "string", example: "1.0.0" },
                    name: { type: "string", example: "life-reborn" },
                  },
                  required: ["version", "name"],
                },
              },
            },
          },
        },
      },
    },
    "/api/providers": {
      get: {
        summary: "Get available LLM providers",
        operationId: "getProviders",
        tags: ["Models"],
        responses: {
          200: {
            description: "List of available LLM providers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    providers: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          available: { type: "boolean" },
                          models: { type: "array", items: { type: "string" } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/chat": {
      post: {
        summary: "Send message via life-core LLM router",
        operationId: "chat",
        tags: ["Chat"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  messages: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      properties: {
                        role: {
                          type: "string",
                          enum: ["user", "assistant", "system"],
                        },
                        content: { type: "string" },
                      },
                      required: ["role", "content"],
                    },
                  },
                  model: {
                    type: "string",
                    default: "claude-3-5-sonnet-20241022",
                  },
                  provider: { type: "string" },
                  useRag: { type: "boolean", default: false },
                },
                required: ["messages"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Chat response from life-core",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    model: { type: "string" },
                    provider: { type: "string" },
                    usage: {
                      type: "object",
                      properties: {
                        inputTokens: { type: "number" },
                        outputTokens: { type: "number" },
                      },
                    },
                  },
                  required: ["content", "model", "provider"],
                },
              },
            },
          },
          500: {
            description: "Error calling life-core API",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/chat": {
      post: {
        summary: "Bootstrap chat endpoint (fallback when life-core unavailable)",
        operationId: "chatV1",
        tags: ["Chat"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  messages: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      properties: {
                        role: {
                          type: "string",
                          enum: ["user", "assistant", "system"],
                        },
                        content: { type: "string" },
                      },
                      required: ["role", "content"],
                    },
                  },
                  model: {
                    type: "string",
                    default: "claude-3-5-sonnet-20241022",
                  },
                },
                required: ["messages"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Bootstrap chat response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    model: { type: "string" },
                    provider: { type: "string", default: "bootstrap" },
                  },
                  required: ["content", "model", "provider"],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Message: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["user", "assistant", "system"],
          },
          content: { type: "string" },
        },
        required: ["role", "content"],
      },
      ChatRequest: {
        type: "object",
        properties: {
          messages: {
            type: "array",
            items: { $ref: "#/components/schemas/Message" },
            minItems: 1,
          },
          model: { type: "string" },
          provider: { type: "string" },
          useRag: { type: "boolean" },
        },
        required: ["messages"],
      },
      ChatResponse: {
        type: "object",
        properties: {
          content: { type: "string" },
          model: { type: "string" },
          provider: { type: "string" },
          usage: {
            type: "object",
            properties: {
              inputTokens: { type: "number" },
              outputTokens: { type: "number" },
            },
          },
        },
        required: ["content", "model", "provider"],
      },
    },
  },
};

function generateOpenAPI() {
  try {
    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), "openapi");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write OpenAPI spec as JSON
    const jsonPath = path.join(outputDir, "openapi.json");
    fs.writeFileSync(jsonPath, JSON.stringify(openAPISchema, null, 2));
    console.log(`✅ OpenAPI JSON schema written to: ${jsonPath}`);

    // Write OpenAPI spec as YAML
    const yamlPath = path.join(outputDir, "openapi.yaml");
    fs.writeFileSync(yamlPath, yaml.dump(openAPISchema, { lineWidth: -1 }));
    console.log(`✅ OpenAPI YAML schema written to: ${yamlPath}`);

    // Generate summary
    const paths = Object.keys(openAPISchema.paths) as Array<keyof typeof openAPISchema.paths>;
    const methodCount = paths.reduce((count, pathKey) => {
      return count + Object.keys(openAPISchema.paths[pathKey]).length;
    }, 0);

    console.log("\n📋 OpenAPI Schema Summary:");
    console.log(`  • Paths: ${paths.length}`);
    console.log(`  • Methods: ${methodCount}`);
    console.log(`  • Endpoints: ${paths.join(", ")}`);
    console.log("\n✨ Schema ready for Orval client generation!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error generating OpenAPI schema:", error);
    process.exit(1);
  }
}

generateOpenAPI();
