import type { CallToolRequestOptions, Client } from "@modelcontextprotocol/client";
import { safeError } from "./connection-helpers";
import { matchesToolFilter } from "./filters";
import type { ToolRegistry } from "./registry-tools";
import type { ServerEntry, UpstreamTool } from "./types";

function recordServerTools(entry: ServerEntry, tools: ToolRegistry, allTools: UpstreamTool[], name: string) {
  const filtered = allTools.filter(
    (t) => tools.validateToolName(t.name) && matchesToolFilter(t.name, entry.config.toolFilter),
  );
  entry.skippedTools = allTools.filter((t) => !tools.validateToolName(t.name)).map((t) => t.name);
  tools.setCache(name, filtered);
  return filtered;
}

export async function listToolsForServer(
  client: Client,
  entry: ServerEntry,
  name: string,
  tools: ToolRegistry,
  timeout: number,
  onTeardown: (name: string, error: string) => void,
): Promise<UpstreamTool[] | null> {
  try {
    const result = await client.listTools(undefined, { timeout, cacheMode: "refresh" });

    return recordServerTools(entry, tools, result.tools, name);
  } catch (error) {
    onTeardown(name, safeError(error));
    if (entry.metadataCache) {entry.metadataStale = true;}
    return null;
  }
}

export async function callToolOnServer(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
  timeout: number,
  signal?: AbortSignal,
) {
  const options: CallToolRequestOptions = { timeout };

  if (signal) {
    options.signal = signal;
  }
  return client.callTool({ name: tool, arguments: args }, options);
}
