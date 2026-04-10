import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCallTool = vi.fn();
const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn().mockImplementation(function () {
    return { connect: mockConnect, callTool: mockCallTool };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: vi.fn(),
}));

// Import after mocks
const { callDatasheetTool, _resetCachedClient } = await import("../client/datasheet-mcp.js");

describe("callDatasheetTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCachedClient();
    process.env.DATASHEET_MCP_URL = "http://datasheet-mcp:8021/sse";
  });

  it("calls the tool with provided args", async () => {
    mockCallTool.mockResolvedValue({ content: [{ type: "text", text: "queued" }] });

    const result = await callDatasheetTool("ingest_datasheet", {
      mpn: "STM32G431",
      url: "",
    });

    expect(mockCallTool).toHaveBeenCalledWith({
      name: "ingest_datasheet",
      arguments: { mpn: "STM32G431", url: "" },
    });
    expect(result).toEqual({ content: [{ type: "text", text: "queued" }] });
  });

  it("caches the client across calls", async () => {
    mockCallTool.mockResolvedValue({ content: [] });

    await callDatasheetTool("ingest_datasheet", { mpn: "A" });
    await callDatasheetTool("compare_components", { mpns: ["A", "B"] });

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });
});
