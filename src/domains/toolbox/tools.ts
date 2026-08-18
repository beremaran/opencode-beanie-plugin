import { tool, type ToolContext } from "@opencode-ai/plugin";
import type { ConnectionManager } from "./connection";
import type { Logger } from "./logger";
import { splitQualified, type ToolRegistry } from "./registry-tools";
import { formatServers, formatTools, schemaPayload, summaryLine } from "./tools-formatting";
import type { ToolboxConfig } from "./types";

const MAX_TOOL_NAME_LEN = 256;

const MAX_LIST_LIMIT = 500;

const MAX_ERROR_LEN = 300;

const serverSchema = tool.schema.string().regex(/^[A-Za-z0-9._-]{1,128}$/);

const toolNameSchema = tool.schema.string().min(1).max(MAX_TOOL_NAME_LEN);

const listDescription =
  "Lists or searches the upstream tools this aggregator can reach. Returns one-line summaries plus per-server status; rows are marked [stale] when the counts come from a not-yet-loaded or stale cache. Each result includes servername__toolname; use get_tool_schema for a full schema and invoke_tool to call a tool. Pass refresh=true to force a reconnect and reload of tool metadata; by default servers with no loaded metadata are auto-connected, pass refresh=false to use only already-loaded metadata.";

const schemaDescription =
  "Returns the full JSON Schema for one upstream tool. Provide server and a bare tool name, or pass servername__toolname as tool.";

const invokeDescription =
  "Invokes one upstream tool and serializes its result faithfully. Upstream content, structuredContent, and isError are returned as JSON.";

function resolve(
  args: { server?: string; tool: string },
  registry: ToolRegistry,
): { error: string } | { server: string; tool: string } {
  const qualified = splitQualified(args.tool);

  if (qualified) {
    return registry.upstream.has(qualified.server)
      ? { server: qualified.server, tool: qualified.tool }
      : { error: `unknown server: ${qualified.server}` };
  }
  if (!args.server) {
    return { error: "server is required when tool is a bare tool name (or pass the qualified servername__toolname)" };
  }
  if (!registry.upstream.has(args.server)) {
    return { error: `unknown server: ${args.server}` };
  }
  if (!registry.validateToolName(args.tool)) {
    return { error: `invalid tool name: ${args.tool}` };
  }
  return { server: args.server, tool: args.tool };
}

async function refreshTools(serverName: string | undefined, registry: ToolRegistry, connection: ConnectionManager) {
  const targets = serverName
    ? registry.upstream.has(serverName) && !registry.upstream.get(serverName)?.config.disabled ? [serverName] : []
    : registry.upstream.enabledNames();
  await Promise.all(targets.map((name) => connection.listToolsFor(name)));
}

async function executeListTools(
  args: { query?: string; server?: string; limit?: number; refresh?: boolean },
  registry: ToolRegistry,
  connection: ConnectionManager,
  config: ToolboxConfig,
): Promise<string> {
  const autoRefresh = args.refresh === undefined && (!config.cacheToolMetadata || registry.needsRefresh(args.server));

  const refresh = args.refresh === true || autoRefresh;

  if (refresh) {await refreshTools(args.server, registry, connection);}

  const result = registry.search({ ...args, refresh });

  const lines = [summaryLine(result)];

  if (result.servers.length > 0) {lines.push(...formatServers(result.servers));}
  if (result.tools.length > 0) {lines.push(...formatTools(result.tools));}
  return lines.join("\n");
}

async function executeGetSchema(
  args: { server?: string; tool: string },
  registry: ToolRegistry,
  connection: ConnectionManager,
): Promise<string> {
  const target = resolve(args, registry);

  if ("error" in target) {return JSON.stringify({ error: target.error });}

  let upstream = registry.getTool(target.server, target.tool);

  if (!upstream) {
    const tools = await connection.listToolsFor(target.server);
    upstream = tools?.find((item) => item.name === target.tool) ?? null;
  }
  if (upstream) {
    return JSON.stringify(schemaPayload(target.server, target.tool, upstream), null, 2);
  }
  return JSON.stringify({ error: `unknown tool: ${target.server}__${target.tool}` }, null, 2);
}

async function executeInvoke(
  args: { server?: string; tool: string; arguments: Record<string, unknown> },
  context: ToolContext,
  registry: ToolRegistry,
  connection: ConnectionManager,
  logger: Logger,
): Promise<string> {
  const target = resolve(args, registry);

  if ("error" in target) {return `[mcp-aggregator] ${args.tool} failed: ${target.error}`;}
  try {
    const result = await connection.callTool(target.server, target.tool, args.arguments, context.abort);

    return JSON.stringify(result);
  } catch (error) {
    logger.warn(`upstream invoke failed for ${target.server}/${target.tool}`);
    const cleanMsg = String(error).replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LEN);

    return `[mcp-aggregator] ${target.server}/${target.tool} failed: ${cleanMsg}`;
  }
}

export function createTools(registry: ToolRegistry, connection: ConnectionManager, config: ToolboxConfig, logger: Logger) {
  return {
    list_tools: tool({
      description: listDescription,
      args: {
        query: tool.schema.string().min(1).optional(),
        server: serverSchema.optional(),
        limit: tool.schema.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
        refresh: tool.schema.boolean().optional(),
      },
      execute: (args) => executeListTools(args, registry, connection, config),
    }),
    get_tool_schema: tool({
      description: schemaDescription,
      args: { server: serverSchema.optional(), tool: toolNameSchema },
      execute: (args) => executeGetSchema(args, registry, connection),
    }),
    invoke_tool: tool({
      description: invokeDescription,
      args: {
        server: serverSchema.optional(),
        tool: toolNameSchema,
        arguments: tool.schema.record(tool.schema.string(), tool.schema.unknown()).default({}),
      },
      execute: (args, context) => executeInvoke(args, context, registry, connection, logger),
    }),
  };
}
