import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { buildApp } from "../app.js";
import { resetJwtCacheForTests } from "../middleware/jwt.js";

const CORE_URL = "http://life-core:8000";

const canonicalChatResponse = {
  content: "Bonjour depuis life-core",
  model: "openai/qwen-14b-awq",
  provider: "litellm",
  usage: { input_tokens: 12, output_tokens: 34 },
  trace_id: "0123456789abcdef0123456789abcdef",
};

async function createBearerToken(issuer: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";

  const token = await new SignJWT({
    sub: "user-123",
    email: "test@example.com",
    preferred_username: "tester",
    realm_access: { roles: ["user"] },
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience("life-reborn")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  return {
    token,
    jwks: { keys: [publicJwk] },
  };
}

describe("buildApp chat contract", () => {
  beforeEach(() => {
    resetJwtCacheForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.LIFE_REBORN_ALLOW_PUBLIC_API;
    process.env.CORE_URL = CORE_URL;
  });

  afterEach(() => {
    resetJwtCacheForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.LIFE_REBORN_ALLOW_PUBLIC_API;
    delete process.env.CORE_URL;
    delete process.env.KEYCLOAK_JWKS_URL;
    delete process.env.KEYCLOAK_ISSUER;
  });

  it("accepts a valid {messages} payload in public mode and forwards the canonical contract", async () => {
    process.env.LIFE_REBORN_ALLOW_PUBLIC_API = "true";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(`${CORE_URL}/chat`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        messages: [{ role: "user", content: "Salut" }],
        model: "claude-3-5-sonnet-20241022",
        use_rag: false,
      });
      return new Response(JSON.stringify(canonicalChatResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Salut" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(canonicalChatResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("authorizes /api/chat with a valid JWT and proxies the response unchanged", async () => {
    const issuer = "http://issuer.test/realms/finefab";
    const jwksUrl = "http://auth.local/jwks";
    process.env.KEYCLOAK_ISSUER = issuer;
    process.env.KEYCLOAK_JWKS_URL = jwksUrl;

    const { token, jwks } = await createBearerToken(issuer);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === jwksUrl) {
        return new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === `${CORE_URL}/chat`) {
        expect(JSON.parse(String(init?.body))).toEqual({
          messages: [{ role: "user", content: "Bonjour" }],
          model: "claude-3-5-sonnet-20241022",
          use_rag: false,
        });
        return new Response(JSON.stringify(canonicalChatResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const response = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Bonjour" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(canonicalChatResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps /api/v1/chat as bootstrap and removes the legacy schema from /api/chat", async () => {
    process.env.LIFE_REBORN_ALLOW_PUBLIC_API = "true";
    vi.stubGlobal("fetch", vi.fn());

    const app = buildApp();

    const bootstrap = await app.request(
      new Request("http://localhost/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "fallback" }],
        }),
      }),
    );
    expect(bootstrap.status).toBe(200);

    const legacyPayload = await app.request(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "legacy" }),
      }),
    );
    expect(legacyPayload.status).not.toBe(200);
  });

  it("proxies governance audit endpoints through the gateway", async () => {
    process.env.LIFE_REBORN_ALLOW_PUBLIC_API = "true";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${CORE_URL}/audit/status`) {
        return new Response(JSON.stringify({ last_run: "2026-04-03T12:00:00Z", total_audits: 4, pass: 3, warn: 1, fail: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/audit/report`) {
        return new Response(JSON.stringify({ timestamp: "2026-04-03T12:00:00Z", total_files: 4, summary: { pass: 3, warn: 1, fail: 0 }, results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const statusResponse = await app.request("/api/audit/status");
    const reportResponse = await app.request("/api/audit/report");

    expect(statusResponse.status).toBe(200);
    expect(reportResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({
      last_run: "2026-04-03T12:00:00Z",
      total_audits: 4,
      pass: 3,
      warn: 1,
      fail: 0,
    });
    expect(await reportResponse.json()).toEqual({
      timestamp: "2026-04-03T12:00:00Z",
      total_files: 4,
      summary: { pass: 3, warn: 1, fail: 0 },
      results: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the no_report governance audit fallback", async () => {
    process.env.LIFE_REBORN_ALLOW_PUBLIC_API = "true";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${CORE_URL}/audit/status`) {
        return new Response(JSON.stringify({ status: "no_report", message: "Run validator first." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/audit/report`) {
        return new Response(JSON.stringify({ status: "no_report", results: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const statusResponse = await app.request("/api/audit/status");
    const reportResponse = await app.request("/api/audit/report");

    expect(statusResponse.status).toBe(200);
    expect(reportResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({
      status: "no_report",
      message: "Run validator first.",
    });
    expect(await reportResponse.json()).toEqual({
      status: "no_report",
      results: [],
    });
  });

  it("proxies cockpit read routes and preserves query strings", async () => {
    process.env.LIFE_REBORN_ALLOW_PUBLIC_API = "true";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${CORE_URL}/stats/timeseries?points=20`) {
        return new Response(JSON.stringify({
          series: [],
          summary: { total_calls: 0, total_errors: 0, p50_ms: 0, p99_ms: 0, error_rate: 0 },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/rag/stats`) {
        return new Response(JSON.stringify({
          documents: 2,
          chunks: 48,
          vectors: 48,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/rag/search?q=pcb&top_k=3&mode=hybrid`) {
        return new Response(JSON.stringify({
          query: "pcb",
          mode: "hybrid",
          collections: ["life_chunks"],
          results: [
            {
              content: "PCB layout checklist",
              document_id: "doc-1",
              chunk_index: 0,
              metadata: { source: "upload", name: "checklist.md" },
              score: 0.93,
              dense_score: 0.81,
              sparse_score: 0.76,
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/rag/search?q=pcb&top_k=3&collections=life_chunks`) {
        return new Response(JSON.stringify({
          query: "pcb",
          mode: "dense",
          collections: ["life_chunks"],
          results: [
            {
              content: "PCB layout checklist",
              document_id: "doc-1",
              chunk_index: 0,
              metadata: { source: "upload", collection: "life_chunks" },
              score: 0.93,
              dense_score: 0.93,
              sparse_score: 0.0,
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/rag/documents`) {
        return new Response(JSON.stringify({
          documents: [
            {
              id: "doc-1",
              name: "checklist.md",
              chunks: 12,
              metadata: { source: "upload", id: "doc-1" },
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/traces/services`) {
        return new Response(JSON.stringify({ data: ["life-core", "life-reborn"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/traces/recent?service=life-core&limit=20`) {
        return new Response(JSON.stringify({
          data: [
            {
              traceID: "abc123",
              spans: [
                {
                  spanID: "def456",
                  operationName: "llm.call",
                  startTime: 1712275200000000,
                  duration: 42000,
                  processID: "p1",
                },
              ],
              processes: {
                p1: { serviceName: "life-core" },
              },
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/infra/containers`) {
        return new Response(JSON.stringify({
          containers: [
            {
              name: "life-core",
              image: "life-core:latest",
              status: "running",
              health: "healthy",
              cpu_percent: 12.5,
              memory_mb: 256.0,
              memory_limit_mb: 1024.0,
              uptime_hours: 3.5,
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/infra/storage`) {
        return new Response(JSON.stringify({
          redis: {
            status: "connected",
            used_memory_human: "12M",
            connected_clients: 4,
            keys: 128,
          },
          qdrant: {
            status: "connected",
            collections: 2,
            collection_names: ["life_chunks", "eval_runs"],
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/infra/network`) {
        return new Response(JSON.stringify({
          ollama_local: { status: "up", models: 4, url: "http://ollama:11434" },
          ollama_gpu: { status: "down", error: "timeout", url: "http://kxkm-ai:11434" },
          vllm_gpu: { status: "up", models: ["qwen-14b-awq"], url: "http://vllm:8000" },
          jaeger: { status: "up" },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/infra/machines`) {
        return new Response(JSON.stringify({
          machines: [
            {
              name: "Tower",
              ip: "192.168.0.120",
              cpu_percent: 17.5,
              ram_used_gb: 11.2,
              ram_total_gb: 31.0,
              disk_used_gb: 420.0,
              disk_total_gb: 1800.0,
              uptime_hours: 72.5,
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/infra/gpu`) {
        return new Response(JSON.stringify({
          model: "Qwen2.5-32B AWQ",
          vram_used_gb: 18.2,
          vram_total_gb: 24.0,
          requests_active: 2,
          tokens_per_sec: 88.4,
          kv_cache_usage_percent: 76.1,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === `${CORE_URL}/infra/activepieces`) {
        return new Response(JSON.stringify({
          flows: [
            {
              id: "flow-1",
              name: "Sync Docs",
              status: "ENABLED",
              trigger: "SCHEDULE",
              last_run_at: "2026-04-05T08:00:00Z",
              last_run_status: "SUCCEEDED",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const response = await app.request("/stats/timeseries?points=20");
    const ragStatsResponse = await app.request("/rag/stats");
    const ragSearchResponse = await app.request("/rag/search?q=pcb&top_k=3&mode=hybrid");
    const apiSearchResponse = await app.request("/api/search?q=pcb&top_k=3&collections=life_chunks");
    const ragDocumentsResponse = await app.request("/rag/documents");
    const servicesResponse = await app.request("/traces/services");
    const recentResponse = await app.request("/traces/recent?service=life-core&limit=20");
    const containersResponse = await app.request("/infra/containers");
    const storageResponse = await app.request("/infra/storage");
    const networkResponse = await app.request("/infra/network");
    const machinesResponse = await app.request("/infra/machines");
    const gpuResponse = await app.request("/infra/gpu");
    const activepiecesResponse = await app.request("/infra/activepieces");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      series: [],
      summary: { total_calls: 0, total_errors: 0, p50_ms: 0, p99_ms: 0, error_rate: 0 },
    });
    expect(ragStatsResponse.status).toBe(200);
    expect(await ragStatsResponse.json()).toEqual({
      documents: 2,
      chunks: 48,
      vectors: 48,
    });
    expect(ragSearchResponse.status).toBe(200);
    expect(await ragSearchResponse.json()).toEqual({
      query: "pcb",
      mode: "hybrid",
      collections: ["life_chunks"],
      results: [
        {
          content: "PCB layout checklist",
          document_id: "doc-1",
          chunk_index: 0,
          metadata: { source: "upload", name: "checklist.md" },
          score: 0.93,
          dense_score: 0.81,
          sparse_score: 0.76,
        },
      ],
    });
    expect(apiSearchResponse.status).toBe(200);
    expect(await apiSearchResponse.json()).toEqual({
      query: "pcb",
      mode: "dense",
      collections: ["life_chunks"],
      results: [
        {
          content: "PCB layout checklist",
          document_id: "doc-1",
          chunk_index: 0,
          metadata: { source: "upload", collection: "life_chunks" },
          score: 0.93,
          dense_score: 0.93,
          sparse_score: 0.0,
        },
      ],
    });
    expect(ragDocumentsResponse.status).toBe(200);
    expect(await ragDocumentsResponse.json()).toEqual({
      documents: [
        {
          id: "doc-1",
          name: "checklist.md",
          chunks: 12,
          metadata: { source: "upload", id: "doc-1" },
        },
      ],
    });
    expect(servicesResponse.status).toBe(200);
    expect(await servicesResponse.json()).toEqual({ data: ["life-core", "life-reborn"] });
    expect(recentResponse.status).toBe(200);
    expect(await recentResponse.json()).toEqual({
      data: [
        {
          traceID: "abc123",
          spans: [
            {
              spanID: "def456",
              operationName: "llm.call",
              startTime: 1712275200000000,
              duration: 42000,
              processID: "p1",
            },
          ],
          processes: {
            p1: { serviceName: "life-core" },
          },
        },
      ],
    });
    expect(containersResponse.status).toBe(200);
    expect(await containersResponse.json()).toEqual({
      containers: [
        {
          name: "life-core",
          image: "life-core:latest",
          status: "running",
          health: "healthy",
          cpu_percent: 12.5,
          memory_mb: 256.0,
          memory_limit_mb: 1024.0,
          uptime_hours: 3.5,
        },
      ],
    });
    expect(storageResponse.status).toBe(200);
    expect(await storageResponse.json()).toEqual({
      redis: {
        status: "connected",
        used_memory_human: "12M",
        connected_clients: 4,
        keys: 128,
      },
      qdrant: {
        status: "connected",
        collections: 2,
        collection_names: ["life_chunks", "eval_runs"],
      },
    });
    expect(networkResponse.status).toBe(200);
    expect(await networkResponse.json()).toEqual({
      ollama_local: { status: "up", models: 4, url: "http://ollama:11434" },
      ollama_gpu: { status: "down", error: "timeout", url: "http://kxkm-ai:11434" },
      vllm_gpu: { status: "up", models: ["qwen-14b-awq"], url: "http://vllm:8000" },
      jaeger: { status: "up" },
    });
    expect(machinesResponse.status).toBe(200);
    expect(await machinesResponse.json()).toEqual({
      machines: [
        {
          name: "Tower",
          ip: "192.168.0.120",
          cpu_percent: 17.5,
          ram_used_gb: 11.2,
          ram_total_gb: 31.0,
          disk_used_gb: 420.0,
          disk_total_gb: 1800.0,
          uptime_hours: 72.5,
        },
      ],
    });
    expect(gpuResponse.status).toBe(200);
    expect(await gpuResponse.json()).toEqual({
      model: "Qwen2.5-32B AWQ",
      vram_used_gb: 18.2,
      vram_total_gb: 24.0,
      requests_active: 2,
      tokens_per_sec: 88.4,
      kv_cache_usage_percent: 76.1,
    });
    expect(activepiecesResponse.status).toBe(200);
    expect(await activepiecesResponse.json()).toEqual({
      flows: [
        {
          id: "flow-1",
          name: "Sync Docs",
          status: "ENABLED",
          trigger: "SCHEDULE",
          last_run_at: "2026-04-05T08:00:00Z",
          last_run_status: "SUCCEEDED",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/stats/timeseries?points=20`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/rag/stats`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/rag/search?q=pcb&top_k=3&mode=hybrid`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/rag/search?q=pcb&top_k=3&collections=life_chunks`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/rag/documents`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/traces/services`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/traces/recent?service=life-core&limit=20`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/infra/containers`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/infra/storage`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/infra/network`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/infra/machines`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/infra/gpu`, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/infra/activepieces`, expect.anything());
  });

  it("documents governance and cockpit proxy routes in OpenAPI", async () => {
    process.env.LIFE_REBORN_ALLOW_PUBLIC_API = "true";

    const app = buildApp();
    const response = await app.request("/doc");

    expect(response.status).toBe(200);

    const spec = await response.json() as { paths: Record<string, unknown> };
    expect(spec.paths).toHaveProperty("/models");
    expect(spec.paths).toHaveProperty("/models/catalog");
    expect(spec.paths).toHaveProperty("/stats");
    expect(spec.paths).toHaveProperty("/rag/stats");
    expect(spec.paths).toHaveProperty("/rag/search");
    expect(spec.paths).toHaveProperty("/api/search");
    expect(spec.paths).toHaveProperty("/rag/documents");
    expect(spec.paths).toHaveProperty("/rag/documents/{id}");
    expect(spec.paths).toHaveProperty("/api/audit/status");
    expect(spec.paths).toHaveProperty("/api/audit/report");
    expect(spec.paths).toHaveProperty("/logs/recent");
    expect(spec.paths).toHaveProperty("/conversations");
    expect(spec.paths).toHaveProperty("/conversations/{convId}");
    expect(spec.paths).toHaveProperty("/conversations/{convId}/messages");
    expect(spec.paths).toHaveProperty("/stats/timeseries");
    expect(spec.paths).toHaveProperty("/traces/services");
    expect(spec.paths).toHaveProperty("/traces/recent");
    expect(spec.paths).toHaveProperty("/infra/containers");
    expect(spec.paths).toHaveProperty("/infra/storage");
    expect(spec.paths).toHaveProperty("/infra/network");
    expect(spec.paths).toHaveProperty("/infra/machines");
    expect(spec.paths).toHaveProperty("/infra/gpu");
    expect(spec.paths).toHaveProperty("/infra/activepieces");
  });
});
