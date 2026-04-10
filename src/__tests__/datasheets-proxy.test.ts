import { describe, it, expect, vi, beforeEach } from "vitest";
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
