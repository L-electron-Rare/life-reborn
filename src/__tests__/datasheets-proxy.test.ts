import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

vi.mock("../client/datasheet-mcp.js", () => ({
  callDatasheetTool: vi.fn(),
}));

const { callDatasheetTool } = await import("../client/datasheet-mcp.js");
const { registerDatasheetsProxyRoutes } = await import("../routes/datasheets-proxy.js");

describe("datasheets-proxy", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    registerDatasheetsProxyRoutes(app as any);
    vi.clearAllMocks();
  });

  it("POST /api/datasheets/ingest queues an MPN", async () => {
    (callDatasheetTool as any).mockResolvedValue({
      content: [{ type: "text", text: "Datasheet for STM32G431 queued." }],
    });

    const res = await app.request("/api/datasheets/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpn: "STM32G431" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.queued).toBe(true);
    expect(body.mpn).toBe("STM32G431");
    expect(callDatasheetTool).toHaveBeenCalledWith("ingest_datasheet", {
      mpn: "STM32G431",
      url: "",
    });
  });

  it("POST /api/datasheets/compare returns a markdown table", async () => {
    (callDatasheetTool as any).mockResolvedValue({
      content: [{ type: "text", text: "| a | b |\n|---|---|" }],
    });

    const res = await app.request("/api/datasheets/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mpns: ["STM32G431", "STM32F411"],
        criteria: ["voltage", "clock"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.table).toContain("|---|");
    expect(callDatasheetTool).toHaveBeenCalledWith("compare_components", {
      mpns: ["STM32G431", "STM32F411"],
      criteria: ["voltage", "clock"],
    });
  });

  it("POST /api/datasheets/ingest rejects missing mpn", async () => {
    const res = await app.request("/api/datasheets/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("POST /api/datasheets/compare rejects fewer than 2 MPNs", async () => {
    const res = await app.request("/api/datasheets/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpns: ["only_one"] }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 502 on MCP failure", async () => {
    (callDatasheetTool as any).mockRejectedValue(new Error("Connection refused"));

    const res = await app.request("/api/datasheets/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpn: "STM32G431" }),
    });

    expect(res.status).toBe(502);
  });
});

describe("datasheets-proxy — V1.8 HTTP passthrough", () => {
  let app: Hono;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    app = new Hono();
    registerDatasheetsProxyRoutes(app as any);
    vi.clearAllMocks();
    process.env.DATASHEET_MCP_HTTP_URL = "http://datasheet-mcp:8022";
    process.env.DATASHEET_BEARER = "";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POST /api/datasheets/upload proxies multipart to datasheet-mcp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "abc123",
          mpn: "KXKM-18650-3500",
          page_count: 1,
          stored_path: "/tmp/abc123.pdf",
          fields: { voltage_v: 3.7 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const form = new FormData();
    form.append("mpn", "KXKM-18650-3500");
    form.append(
      "file",
      new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
        type: "application/pdf",
      }),
      "kxkm.pdf",
    );

    const res = await app.request("/api/datasheets/upload", {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mpn).toBe("KXKM-18650-3500");
    expect(body.id).toBe("abc123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toMatch(/\/datasheets\/upload$/);
  });

  it("POST /api/datasheets/upload returns 400 when mpn missing", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array([0x25])], { type: "application/pdf" }),
      "x.pdf",
    );
    const res = await app.request("/api/datasheets/upload", {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("GET /api/datasheets/list proxies to datasheet-mcp /datasheets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request("/api/datasheets/list");
    expect(res.status).toBe(200);
    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toMatch(/\/datasheets$/);
  });

  it("GET /api/datasheets/search forwards q and limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ query: "kxkm", results: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.request("/api/datasheets/search?q=kxkm&limit=5");
    expect(res.status).toBe(200);
    const callUrl = fetchMock.mock.calls[0][0] as string;
    expect(callUrl).toContain("/datasheets/search?q=kxkm&limit=5");
  });

  it("attaches bearer header when DATASHEET_BEARER set", async () => {
    process.env.DATASHEET_BEARER = "secret-token";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await app.request("/api/datasheets/list");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-token");
  });
});
