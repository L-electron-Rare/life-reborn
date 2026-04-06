import type { Context } from "hono";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { buildForwardHeaders, fetchCore } from "../client/core.js";

type ProxyRoute = {
  path: string;
  upstreamPath?: string;
};

const CORE_PROXY_ROUTES: ProxyRoute[] = [
  { path: "/models" },
  { path: "/models/catalog" },
  { path: "/chat/stream" },
  { path: "/api/search", upstreamPath: "/rag/search" },
  { path: "/stats" },
  { path: "/stats/timeseries" },
  { path: "/conversations" },
  { path: "/conversations/:convId" },
  { path: "/conversations/:convId/messages" },
  { path: "/rag/stats" },
  { path: "/rag/search" },
  { path: "/rag/documents" },
  { path: "/rag/documents/:id" },
  { path: "/infra/containers" },
  { path: "/infra/storage" },
  { path: "/infra/network" },
  { path: "/infra/machines" },
  { path: "/infra/gpu" },
  { path: "/infra/activepieces" },
  { path: "/logs/recent" },
  { path: "/traces/services" },
  { path: "/traces/recent" },
  { path: "/api/audit/status", upstreamPath: "/audit/status" },
  { path: "/api/audit/report", upstreamPath: "/audit/report" },
  { path: "/api/chat/stream", upstreamPath: "/chat/stream" },
  { path: "/api/alerts", upstreamPath: "/alerts" },
  { path: "/api/web-search", upstreamPath: "/web-search" },
];

const passthroughErrorSchema = z.object({
  error: z.string(),
});

const upstreamDetailErrorSchema = z.object({
  detail: z.string(),
});

const modelsResponseSchema = z.object({
  models: z.array(z.string()),
});

const modelCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  domain: z.string(),
  description: z.string(),
  size: z.string(),
  location: z.string(),
  context_window: z.string().optional(),
});

const modelCatalogResponseSchema = z.object({
  models: z.array(modelCatalogEntrySchema),
  domains: z.record(z.string(), z.string()),
});

const cacheL1StatsSchema = z.object({
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  max_size: z.number().int().nonnegative(),
});

const cacheL2StatsSchema = z.object({
  hits: z.number().int().nonnegative(),
  misses: z.number().int().nonnegative(),
  available: z.boolean(),
});

const ragRuntimeStatsSchema = z.object({
  documents: z.number().int().nonnegative().optional(),
  chunks: z.number().int().nonnegative().optional(),
  vectors: z.number().int().nonnegative(),
  retrieval_mode: z.string().optional(),
});

const ragStatsResponseSchema = z.object({
  documents: z.number().int().nonnegative(),
  chunks: z.number().int().nonnegative(),
  vectors: z.number().int().nonnegative(),
});

const ragDocumentMetadataSchema = z.record(z.string(), z.unknown());

const ragDocumentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  chunks: z.number().int().nonnegative(),
  metadata: ragDocumentMetadataSchema.default({}),
});

const ragDocumentsResponseSchema = z.object({
  documents: z.array(ragDocumentInfoSchema),
});

const ragDeleteResponseSchema = z.object({
  deleted: z.boolean(),
  id: z.string(),
});

const ragSearchResultSchema = z.object({
  content: z.string(),
  document_id: z.string(),
  chunk_index: z.number().int().nonnegative(),
  metadata: ragDocumentMetadataSchema.optional(),
  score: z.number(),
  dense_score: z.number(),
  sparse_score: z.number(),
});

const ragSearchResponseSchema = z.object({
  query: z.string(),
  mode: z.string(),
  collections: z.array(z.string()),
  results: z.array(ragSearchResultSchema),
});

const chatServiceStatsSchema = z.object({
  requests: z.number().int().nonnegative(),
  cache_hits: z.number().int().nonnegative(),
  cache_stats: z.object({
    l1: cacheL1StatsSchema,
    l2: cacheL2StatsSchema,
  }),
  rag_stats: ragRuntimeStatsSchema.nullable().optional(),
});

const statsResponseSchema = z.object({
  chat_service: chatServiceStatsSchema,
  router: z.object({
    status: z.record(z.string(), z.boolean()),
  }),
});

const logsRecentItemSchema = z.object({
  timestamp: z.string(),
  level: z.string(),
  message: z.string(),
  source: z.string(),
});

const logsRecentResponseSchema = z.object({
  logs: z.array(logsRecentItemSchema),
  total: z.number().int().nonnegative(),
});

const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  provider: z.string(),
  message_count: z.number().int().nonnegative(),
});

const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});

const conversationMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
});

const conversationDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  messages: z.array(conversationMessageSchema),
  created_at: z.string(),
});

const conversationCreateRequestSchema = z.object({
  title: z.string().optional(),
  provider: z.string().optional(),
});

const conversationAddMessageRequestSchema = z.object({
  role: z.string(),
  content: z.string(),
});

const conversationMutationResponseSchema = z.object({
  status: z.string(),
  message_count: z.number().int().nonnegative().optional(),
});

const auditCheckResultSchema = z.object({
  check: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  auto_fixable: z.boolean().optional(),
});

const auditValidationResultSchema = z.object({
  filepath: z.string().optional(),
  file: z.string().optional(),
  status: z.enum(["pass", "warn", "fail"]),
  errors: z.number().int().nonnegative().optional(),
  warnings: z.number().int().nonnegative().optional(),
  score: z.number().optional(),
  last_modified: z.string().optional(),
  details: z.array(auditCheckResultSchema).optional(),
});

const auditCrossAnalysisSchema = z.object({
  contradictions: z.array(z.string()),
  untracked_debts: z.array(z.string()),
  coverage_gaps: z.array(z.string()),
});

const auditStatusNoReportSchema = z.object({
  status: z.literal("no_report"),
  message: z.string(),
});

const auditStatusReadySchema = z.object({
  last_run: z.string(),
  total_audits: z.number().int().nonnegative(),
  pass: z.number().int().nonnegative().optional(),
  warn: z.number().int().nonnegative().optional(),
  fail: z.number().int().nonnegative().optional(),
  avg_score: z.number().optional(),
  ai_score_avg: z.number().optional(),
});

const auditStatusResponseSchema = z.union([
  auditStatusNoReportSchema,
  auditStatusReadySchema,
]);

const auditReportNoReportSchema = z.object({
  status: z.literal("no_report"),
  results: z.array(auditValidationResultSchema),
});

const auditReportReadySchema = z.object({
  timestamp: z.string().optional(),
  total_files: z.number().int().nonnegative().optional(),
  summary: z.object({
    pass: z.number().int().nonnegative().optional(),
    warn: z.number().int().nonnegative().optional(),
    fail: z.number().int().nonnegative().optional(),
  }).optional(),
  results: z.array(auditValidationResultSchema),
  cross_analysis: auditCrossAnalysisSchema.optional(),
});

const auditReportResponseSchema = z.union([
  auditReportNoReportSchema,
  auditReportReadySchema,
]);

const statsTimeseriesPointSchema = z.object({
  time: z.string(),
  timestamp: z.number().int(),
  p50: z.number(),
  p99: z.number(),
  calls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});

const statsTimeseriesSummarySchema = z.object({
  total_calls: z.number().int().nonnegative(),
  total_errors: z.number().int().nonnegative(),
  p50_ms: z.number(),
  p99_ms: z.number(),
  error_rate: z.number(),
});

const statsTimeseriesResponseSchema = z.object({
  series: z.array(statsTimeseriesPointSchema),
  summary: statsTimeseriesSummarySchema,
});

const tracesServicesResponseSchema = z.object({
  data: z.array(z.string()),
  error: z.string().optional(),
});

const tracesRecentItemSchema = z.object({
  traceID: z.string().optional(),
  operationName: z.string().optional(),
  startTime: z.number().optional(),
  duration: z.number().optional(),
  serviceName: z.string().optional(),
  status: z.string().optional(),
  statusCode: z.union([z.string(), z.number()]).optional(),
  spans: z.array(
    z.object({
      traceID: z.string().optional(),
      spanID: z.string().optional(),
      operationName: z.string().optional(),
      startTime: z.number().optional(),
      duration: z.number().optional(),
      processID: z.string().optional(),
    }).catchall(z.unknown()),
  ).optional(),
  processes: z.record(
    z.string(),
    z.object({
      serviceName: z.string().optional(),
    }).catchall(z.unknown()),
  ).optional(),
}).catchall(z.unknown());

const tracesRecentResponseSchema = z.object({
  data: z.array(tracesRecentItemSchema),
  total: z.number().int().nonnegative().optional(),
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

const infraContainerSchema = z.object({
  name: z.string(),
  image: z.string(),
  status: z.string(),
  health: z.string(),
  cpu_percent: z.number(),
  memory_mb: z.number(),
  memory_limit_mb: z.number(),
  uptime_hours: z.number(),
  error: z.string().optional(),
});

const infraContainersResponseSchema = z.object({
  containers: z.array(infraContainerSchema),
});

const infraStorageNodeSchema = z.object({
  status: z.string().optional(),
  used_memory_human: z.string().optional(),
  connected_clients: z.number().int().nonnegative().optional(),
  keys: z.number().int().nonnegative().optional(),
  collections: z.number().int().nonnegative().optional(),
  collection_names: z.array(z.string()).optional(),
  code: z.number().int().optional(),
  error: z.string().optional(),
}).catchall(z.unknown());

const infraStorageResponseSchema = z.object({
  redis: infraStorageNodeSchema,
  qdrant: infraStorageNodeSchema,
});

const infraNetworkCheckSchema = z.object({
  status: z.string(),
  models: z.union([z.number().int().nonnegative(), z.array(z.string())]).optional(),
  url: z.string().optional(),
  error: z.string().optional(),
}).catchall(z.unknown());

const infraNetworkResponseSchema = z.object({
  ollama_local: infraNetworkCheckSchema.optional(),
  ollama_gpu: infraNetworkCheckSchema.optional(),
  vllm_gpu: infraNetworkCheckSchema.optional(),
  jaeger: infraNetworkCheckSchema.optional(),
}).catchall(z.unknown());

const monitoringMachineSchema = z.object({
  name: z.string(),
  ip: z.string(),
  cpu_percent: z.number(),
  ram_used_gb: z.number(),
  ram_total_gb: z.number(),
  disk_used_gb: z.number(),
  disk_total_gb: z.number(),
  uptime_hours: z.number(),
  error: z.string().optional(),
});

const monitoringMachinesResponseSchema = z.object({
  machines: z.array(monitoringMachineSchema),
});

const monitoringGpuResponseSchema = z.object({
  model: z.string(),
  vram_used_gb: z.number(),
  vram_total_gb: z.number(),
  requests_active: z.number().int().nonnegative(),
  tokens_per_sec: z.number(),
  kv_cache_usage_percent: z.number(),
  error: z.string().optional(),
});

const monitoringActivepiecesFlowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  trigger: z.string(),
  last_run_at: z.string(),
  last_run_status: z.string(),
});

const monitoringActivepiecesResponseSchema = z.object({
  flows: z.array(monitoringActivepiecesFlowSchema),
  error: z.string().optional(),
});

const documentedReadRoutes = [
  createRoute({
    method: "get",
    path: "/models",
    responses: {
      200: {
        description: "Available models proxied from life-core",
        content: {
          "application/json": {
            schema: modelsResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/models/catalog",
    responses: {
      200: {
        description: "Curated model catalog proxied from life-core",
        content: {
          "application/json": {
            schema: modelCatalogResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/stats",
    responses: {
      200: {
        description: "Aggregated runtime stats proxied from life-core",
        content: {
          "application/json": {
            schema: statsResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/stats/timeseries",
    request: {
      query: z.object({
        points: z.coerce.number().int().min(1).max(60).optional(),
      }),
    },
    responses: {
      200: {
        description: "Timeseries stats proxied from life-core",
        content: {
          "application/json": {
            schema: statsTimeseriesResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/api/alerts",
    request: {
      query: z.object({
        tail: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "JSONL alerts proxied from life-core",
        content: {
          "application/json": {
            schema: z.unknown(),
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/logs/recent",
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
    responses: {
      200: {
        description: "Recent buffered logs proxied from life-core",
        content: {
          "application/json": {
            schema: logsRecentResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/conversations",
    responses: {
      200: {
        description: "Conversation summaries proxied from life-core",
        content: {
          "application/json": {
            schema: conversationListResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "Conversation store unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "post",
    path: "/conversations",
    request: {
      body: {
        content: {
          "application/json": {
            schema: conversationCreateRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Conversation created via life-core",
        content: {
          "application/json": {
            schema: conversationDetailSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "Conversation store unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/conversations/{convId}",
    request: {
      params: z.object({
        convId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Conversation detail proxied from life-core",
        content: {
          "application/json": {
            schema: conversationDetailSchema,
          },
        },
      },
      404: {
        description: "Conversation not found",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "Conversation store unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/rag/stats",
    responses: {
      200: {
        description: "RAG stats proxied from life-core",
        content: {
          "application/json": {
            schema: ragStatsResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "RAG pipeline unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/rag/search",
    request: {
      query: z.object({
        q: z.string().min(1),
        top_k: z.coerce.number().int().min(1).max(50).optional(),
        mode: z.string().optional(),
        collections: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "RAG search results proxied from life-core",
        content: {
          "application/json": {
            schema: ragSearchResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid RAG search query or mode",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "RAG pipeline unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/api/search",
    request: {
      query: z.object({
        q: z.string().min(1),
        top_k: z.coerce.number().int().min(1).max(50).optional(),
        collections: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Semantic search proxied from life-core RAG",
        content: {
          "application/json": {
            schema: ragSearchResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid semantic search query",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "RAG pipeline unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/rag/documents",
    responses: {
      200: {
        description: "Indexed RAG documents proxied from life-core",
        content: {
          "application/json": {
            schema: ragDocumentsResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "RAG pipeline unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "post",
    path: "/rag/documents",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.string().openapi({
                type: "string",
                format: "binary",
              }),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Uploaded RAG document indexed by life-core",
        content: {
          "application/json": {
            schema: ragDocumentInfoSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "RAG pipeline unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "delete",
    path: "/rag/documents/{id}",
    request: {
      params: z.object({
        id: z.string(),
      }),
    },
    responses: {
      200: {
        description: "RAG document deleted via life-core",
        content: {
          "application/json": {
            schema: ragDeleteResponseSchema,
          },
        },
      },
      404: {
        description: "RAG document not found",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "RAG pipeline unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "post",
    path: "/conversations/{convId}/messages",
    request: {
      params: z.object({
        convId: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: conversationAddMessageRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Message added to a conversation via life-core",
        content: {
          "application/json": {
            schema: conversationMutationResponseSchema,
          },
        },
      },
      404: {
        description: "Conversation not found",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "Conversation store unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "delete",
    path: "/conversations/{convId}",
    request: {
      params: z.object({
        convId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Conversation deleted via life-core",
        content: {
          "application/json": {
            schema: z.object({
              status: z.string(),
            }),
          },
        },
      },
      404: {
        description: "Conversation not found",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
      503: {
        description: "Conversation store unavailable",
        content: {
          "application/json": {
            schema: upstreamDetailErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/api/audit/status",
    responses: {
      200: {
        description: "Governance audit status proxied from life-core",
        content: {
          "application/json": {
            schema: auditStatusResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/api/audit/report",
    responses: {
      200: {
        description: "Governance audit report proxied from life-core",
        content: {
          "application/json": {
            schema: auditReportResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/traces/services",
    responses: {
      200: {
        description: "Available traced services proxied from Jaeger",
        content: {
          "application/json": {
            schema: tracesServicesResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/traces/recent",
    request: {
      query: z.object({
        service: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    },
    responses: {
      200: {
        description: "Recent Jaeger traces proxied from life-core",
        content: {
          "application/json": {
            schema: tracesRecentResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/infra/containers",
    responses: {
      200: {
        description: "Container health and resource usage proxied from life-core",
        content: {
          "application/json": {
            schema: infraContainersResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/infra/storage",
    responses: {
      200: {
        description: "Storage backend status proxied from life-core",
        content: {
          "application/json": {
            schema: infraStorageResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/infra/network",
    responses: {
      200: {
        description: "Network connectivity checks proxied from life-core",
        content: {
          "application/json": {
            schema: infraNetworkResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/infra/machines",
    responses: {
      200: {
        description: "Per-machine monitoring proxied from life-core",
        content: {
          "application/json": {
            schema: monitoringMachinesResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/infra/gpu",
    responses: {
      200: {
        description: "GPU monitoring proxied from life-core",
        content: {
          "application/json": {
            schema: monitoringGpuResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
  createRoute({
    method: "get",
    path: "/infra/activepieces",
    responses: {
      200: {
        description: "Activepieces flow monitoring proxied from life-core",
        content: {
          "application/json": {
            schema: monitoringActivepiecesResponseSchema,
          },
        },
      },
      502: {
        description: "Proxy error while calling life-core",
        content: {
          "application/json": {
            schema: passthroughErrorSchema,
          },
        },
      },
    },
  }),
] as const;

function toHonoPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

async function proxyToCore(c: Context, upstreamPath = c.req.path): Promise<Response> {
  const { headers, correlationId } = buildForwardHeaders(c.req.raw, c.req.raw.headers);
  try {
    const requestUrl = new URL(c.req.url);
    const targetPath = `${upstreamPath}${requestUrl.search}`;
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
      { error: `Failed to call life-core: ${message}` },
      502,
      { "X-Correlation-ID": correlationId },
    );
  }
}

export function registerCoreProxyRoutes(app: OpenAPIHono): void {
  const documentedPaths = new Set<string>(
    documentedReadRoutes.flatMap((route) => [route.path, toHonoPath(route.path)]),
  );

  for (const route of documentedReadRoutes) {
    const proxiedPath = route.path === "/api/audit/status"
      ? "/audit/status"
      : route.path === "/api/audit/report"
        ? "/audit/report"
        : route.path === "/api/search"
          ? "/rag/search"
          : route.path === "/api/alerts"
            ? "/alerts"
            : undefined;

    app.openapi(route, ((c: Context) => proxyToCore(c, proxiedPath)) as never);
  }

  for (const route of CORE_PROXY_ROUTES) {
    if (documentedPaths.has(route.path)) {
      continue;
    }
    app.all(route.path, (c) => proxyToCore(c, route.upstreamPath));
  }
}
