import { qualifiedName } from "./registry-tools";
import type { SearchResult, UpstreamTool } from "./types";

const SERVER_NAME_PAD = 14;

const SERVER_STATUS_PAD = 10;

const TOOL_NAME_PAD = 30;

export function schemaPayload(serverName: string, name: string, upstream: UpstreamTool): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    server: serverName,
    tool: name,
    qualifiedName: qualifiedName(serverName, name),
    inputSchema: JSON.parse(JSON.stringify(upstream.inputSchema)),
  };

  if (upstream.title !== undefined) {
    payload.title = upstream.title;
  }
  if (upstream.description !== undefined) {
    payload.description = upstream.description;
  }
  if (upstream.outputSchema !== undefined) {
    payload.outputSchema = JSON.parse(JSON.stringify(upstream.outputSchema));
  }
  return payload;
}

function summarySuffix(result: SearchResult): string {
  if (result.searched.query) {
    return ` (search: "${result.searched.query}", ${String(result.shown)} shown)`;
  }
  if (result.truncated) {
    return ` (${String(result.shown)} shown)`;
  }
  return "";
}

export function summaryLine(result: SearchResult): string {
  return `[mcp-aggregator] ${String(result.servers.length)} servers, ${String(result.total)} tools${summarySuffix(result)}`;
}

export function formatServers(servers: SearchResult["servers"]): string[] {
  const lines = ["SERVERS:"];

  for (const item of servers) {
    const error = item.error ? `  "${item.error}"` : "";

    const stale = item.stale ? " [stale]" : "";
    lines.push(
      `  ${item.name.padEnd(SERVER_NAME_PAD)}  ${item.status.padEnd(SERVER_STATUS_PAD)}  ${String(item.toolCount)} tools${stale}${error}`,
    );
  }
  return lines;
}

export function formatTools(tools: SearchResult["tools"]): string[] {
  const lines = ["TOOLS (qualified name | summary):"];

  for (const item of tools) {
    const stale = item.stale ? " [stale]" : "";
    lines.push(`  ${item.qualifiedName.padEnd(TOOL_NAME_PAD)}  ${item.summary}${stale}`);
  }
  return lines;
}
