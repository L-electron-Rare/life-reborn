import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

let cachedClient: Client | null = null;

async function getClient(): Promise<Client> {
  if (cachedClient) return cachedClient;
  const url = process.env.DATASHEET_MCP_URL ?? "http://datasheet-mcp:8021/sse";
  const transport = new SSEClientTransport(new URL(url));
  const client = new Client(
    { name: "life-reborn", version: "0.1.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  cachedClient = client;
  return client;
}

export async function callDatasheetTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const client = await getClient();
  return client.callTool({ name, arguments: args });
}

// Test-only helper to reset state between tests
export function _resetCachedClient(): void {
  cachedClient = null;
}
