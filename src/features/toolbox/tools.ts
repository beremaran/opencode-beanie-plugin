import { tool } from '@opencode-ai/plugin'
import type { Config } from './config.js'
import type { ConnectionManager } from './connection.js'
import type { Logger } from './logger.js'
import { qualifiedName, splitQualified, type ToolRegistry, type UpstreamTool } from './registry.js'

const MAX_TOOL_NAME_LENGTH = 256
const MAX_LIST_LIMIT = 500
const SERVER_NAME_PAD = 14
const SERVER_STATUS_PAD = 10
const TOOL_NAME_PAD = 30
const MAX_ERROR_MESSAGE_LENGTH = 300
const server = tool.schema.string().regex(/^[A-Za-z0-9._-]{1,128}$/)
const toolName = tool.schema.string().min(1).max(MAX_TOOL_NAME_LENGTH)
const resolve = (args: { server?: string; tool: string }, registry: ToolRegistry) => {
  const qualified = splitQualified(args.tool)
  if (qualified) {
    if (registry.upstream.has(qualified.server)) {
      return { server: qualified.server, tool: qualified.tool }
    }
    return { error: `unknown server: ${qualified.server}` }
  }
  if (!args.server) {
    return { error: 'server is required when tool is a bare tool name (or pass the qualified servername__toolname)' }
  }
  if (!registry.upstream.has(args.server)) {
    return { error: `unknown server: ${args.server}` }
  }
  if (!registry.validateToolName(args.tool)) {
    return { error: `invalid tool name: ${args.tool}` }
  }
  return { server: args.server, tool: args.tool }
}
const listDescription =
  'Lists or searches the upstream tools this aggregator can reach. Returns one-line summaries plus per-server status. Each result includes servername__toolname; use get_tool_schema for a full schema and invoke_tool to call a tool.'
const schemaDescription =
  'Returns the full JSON Schema for one upstream tool. Provide server and a bare tool name, or pass servername__toolname as tool.'
const invokeDescription =
  'Invokes one upstream tool and serializes its result faithfully. Upstream content, structuredContent, and isError are returned as JSON.'
function schemaPayload(serverName: string, name: string, upstream: UpstreamTool) {
  const payload: Record<string, unknown> = {
    server: serverName,
    tool: name,
    qualifiedName: qualifiedName(serverName, name),
    inputSchema: JSON.parse(JSON.stringify(upstream.inputSchema)),
  }
  if (upstream.title !== undefined) {
    payload.title = upstream.title
  }
  if (upstream.description !== undefined) {
    payload.description = upstream.description
  }
  if (upstream.outputSchema !== undefined) {
    payload.outputSchema = JSON.parse(JSON.stringify(upstream.outputSchema))
  }
  return payload
}
async function refreshTools(serverName: string | undefined, registry: ToolRegistry, connection: ConnectionManager) {
  let targets: string[]
  if (serverName) {
    if (registry.upstream.has(serverName) && !registry.upstream.get(serverName)?.config.disabled) {
      targets = [serverName]
    } else {
      targets = []
    }
  } else {
    targets = registry.upstream.enabledNames()
  }
  await Promise.all(targets.map((name) => connection.listToolsFor(name)))
}
function summarySuffix(result: ReturnType<ToolRegistry['search']>) {
  if (result.searched.query) {
    return ` (search: "${result.searched.query}", ${result.shown} shown)`
  }
  if (result.truncated) {
    return ` (${result.shown} shown)`
  }
  return ''
}
function summaryLine(result: ReturnType<ToolRegistry['search']>) {
  return `[mcp-aggregator] ${result.servers.length} servers, ${result.total} tools${summarySuffix(result)}`
}
function formatServers(servers: ReturnType<ToolRegistry['search']>['servers']) {
  const lines = ['SERVERS:']
  for (const item of servers) {
    let error = ''
    if (item.error) {
      error = `  "${item.error}"`
    }
    lines.push(
      `  ${item.name.padEnd(SERVER_NAME_PAD)}  ${item.status.padEnd(SERVER_STATUS_PAD)}  ${item.toolCount} tools${error}`,
    )
  }
  return lines
}
function formatTools(tools: ReturnType<ToolRegistry['search']>['tools']) {
  const lines = ['TOOLS (qualified name | summary):']
  for (const item of tools) {
    let stale = ''
    if (item.stale) {
      stale = ' [stale]'
    }
    lines.push(`  ${item.qualifiedName.padEnd(TOOL_NAME_PAD)}  ${item.summary}${stale}`)
  }
  return lines
}
function createListToolsTool(registry: ToolRegistry, connection: ConnectionManager, config: Config) {
  return tool({
    description: listDescription,
    args: {
      query: tool.schema.string().min(1).optional(),
      server: server.optional(),
      limit: tool.schema.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
      refresh: tool.schema.boolean().optional(),
    },
    async execute(args) {
      const refresh = args.refresh === true || !config.cacheToolMetadata
      if (refresh) {
        await refreshTools(args.server, registry, connection)
      }
      const result = registry.search({ ...args, refresh })
      const lines = [summaryLine(result)]
      if (result.servers.length > 0) {
        lines.push(...formatServers(result.servers))
      }
      if (result.tools.length > 0) {
        lines.push(...formatTools(result.tools))
      }
      return lines.join('\n')
    },
  })
}
function createGetSchemaTool(registry: ToolRegistry, connection: ConnectionManager) {
  return tool({
    description: schemaDescription,
    args: { server: server.optional(), tool: toolName },
    async execute(args) {
      const target = resolve(args, registry)
      if ('error' in target) {
        return JSON.stringify({ error: target.error })
      }
      let upstream = registry.getTool(target.server, target.tool)
      if (!upstream) {
        const tools = await connection.listToolsFor(target.server)
        upstream = tools?.find((item) => item.name === target.tool) ?? null
      }
      if (upstream) {
        return JSON.stringify(schemaPayload(target.server, target.tool, upstream), null, 2)
      }
      return JSON.stringify({ error: `unknown tool: ${target.server}__${target.tool}` }, null, 2)
    },
  })
}
function createInvokeTool(registry: ToolRegistry, connection: ConnectionManager, logger: Logger) {
  return tool({
    description: invokeDescription,
    args: {
      server: server.optional(),
      tool: toolName,
      arguments: tool.schema.record(tool.schema.string(), tool.schema.unknown()).default({}),
    },
    async execute(args, context) {
      const target = resolve(args, registry)
      if ('error' in target) {
        return `[mcp-aggregator] ${args.tool} failed: ${target.error}`
      }
      try {
        const result = await connection.callTool(target.server, target.tool, args.arguments, context.abort)
        return JSON.stringify(result)
      } catch (error) {
        logger.warn(`upstream invoke failed for ${target.server}/${target.tool}`)
        return `[mcp-aggregator] ${target.server}/${target.tool} failed: ${String(error).replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)}`
      }
    },
  })
}
export function createTools(registry: ToolRegistry, connection: ConnectionManager, config: Config, logger: Logger) {
  return {
    // biome-ignore lint/style/useNamingConvention: list_tools is the public snake_case tool name exposed to OpenCode agents.
    list_tools: createListToolsTool(registry, connection, config),
    // biome-ignore lint/style/useNamingConvention: get_tool_schema is the public snake_case tool name exposed to OpenCode agents.
    get_tool_schema: createGetSchemaTool(registry, connection),
    // biome-ignore lint/style/useNamingConvention: invoke_tool is the public snake_case tool name exposed to OpenCode agents.
    invoke_tool: createInvokeTool(registry, connection, logger),
  }
}
