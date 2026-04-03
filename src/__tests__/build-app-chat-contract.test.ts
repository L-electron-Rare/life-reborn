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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = buildApp();
    const response = await app.request("/stats/timeseries?points=20");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(`${CORE_URL}/stats/timeseries?points=20`, expect.anything());
  });
});
