import { tool } from "@opencode-ai/plugin"
import { ConnectionManager } from "./connection.js"
import { ToolRegistry, splitQualified, qualifiedName, type UpstreamTool } from "./registry.js"
import type { Config } from "./config.js"
import type { Logger } from "./logger.js"
const server = tool.schema.string().regex(/^[A-Za-z0-9._-]{1,128}$/)
const toolName = tool.schema.string().min(1).max(256)
const resolve = (args: { server?: string; tool: string }, registry: ToolRegistry) => { const qualified = splitQualified(args.tool); if (qualified) return registry.upstream.has(qualified.server) ? { server: qualified.server, tool: qualified.tool } : { error: `unknown server: ${qualified.server}` }; if (!args.server) return { error: "server is required when tool is a bare tool name (or pass the qualified servername__toolname)" }; if (!registry.upstream.has(args.server)) return { error: `unknown server: ${args.server}` }; if (!registry.validateToolName(args.tool)) return { error: `invalid tool name: ${args.tool}` }; return { server: args.server, tool: args.tool } }
const listDescription = "Lists or searches the upstream tools this aggregator can reach. Returns one-line summaries plus per-server status. Each result includes servername__toolname; use mcp_aggregator_schema for a full schema and mcp_aggregator_invoke to call a tool."
const schemaDescription = "Returns the full JSON Schema for one upstream tool. Provide server and a bare tool name, or pass servername__toolname as tool."
const invokeDescription = "Invokes one upstream tool and serializes its result faithfully. Upstream content, structuredContent, and isError are returned as JSON."
function schemaPayload(serverName: string, name: string, upstream: UpstreamTool) { return { server: serverName, tool: name, qualifiedName: qualifiedName(serverName, name), ...(upstream.title === undefined ? {} : { title: upstream.title }), ...(upstream.description === undefined ? {} : { description: upstream.description }), inputSchema: JSON.parse(JSON.stringify(upstream.inputSchema)), ...(upstream.outputSchema === undefined ? {} : { outputSchema: JSON.parse(JSON.stringify(upstream.outputSchema)) }) } }
export function createTools(registry: ToolRegistry, connection: ConnectionManager, config: Config, logger: Logger) {
  return {
    mcp_aggregator_list: tool({
      description: listDescription,
      args: { query: tool.schema.string().min(1).optional(), server: server.optional(), limit: tool.schema.number().int().min(1).max(500).optional(), refresh: tool.schema.boolean().optional() },
      async execute(args) {
        const refresh = args.refresh === true || !config.cacheToolMetadata
        if (refresh) for (const name of args.server ? (registry.upstream.has(args.server) && !registry.upstream.get(args.server)!.config.disabled ? [args.server] : []) : registry.upstream.enabledNames()) await connection.listToolsFor(name)
        const result = registry.search({ ...args, refresh })
        const lines = [`[mcp-aggregator] ${result.servers.length} servers, ${result.total} tools${result.searched.query ? ` (search: "${result.searched.query}", ${result.shown} shown)` : result.truncated ? ` (${result.shown} shown)` : ""}`]
        if (result.servers.length) { lines.push("SERVERS:"); for (const item of result.servers) lines.push(`  ${item.name.padEnd(14)}  ${item.status.padEnd(10)}  ${item.toolCount} tools${item.error ? `  "${item.error}"` : ""}`) }
        if (result.tools.length) { lines.push("TOOLS (qualified name | summary):"); for (const item of result.tools) lines.push(`  ${item.qualifiedName.padEnd(30)}  ${item.summary}${item.stale ? " [stale]" : ""}`) }
        return lines.join("\n")
      }
    }),
    mcp_aggregator_schema: tool({
      description: schemaDescription,
      args: { server: server.optional(), tool: toolName },
      async execute(args) {
        const target = resolve(args, registry)
        if ("error" in target) return JSON.stringify({ error: target.error })
        let upstream = registry.getTool(target.server, target.tool)
        if (!upstream) { const tools = await connection.listToolsFor(target.server); upstream = tools?.find(item => item.name === target.tool) ?? null }
        return JSON.stringify(upstream ? schemaPayload(target.server, target.tool, upstream) : { error: `unknown tool: ${target.server}__${target.tool}` }, null, 2)
      }
    }),
    mcp_aggregator_invoke: tool({
      description: invokeDescription,
      args: { server: server.optional(), tool: toolName, arguments: tool.schema.record(tool.schema.string(), tool.schema.unknown()).default({}) },
      async execute(args, context) {
        const target = resolve(args, registry)
        if ("error" in target) return `[mcp-aggregator] ${args.tool} failed: ${target.error}`
        try {
          const result = await connection.callTool(target.server, target.tool, args.arguments, context.abort)
          return JSON.stringify(result)
        } catch (error) {
          logger.warn(`upstream invoke failed for ${target.server}/${target.tool}`)
          return `[mcp-aggregator] ${target.server}/${target.tool} failed: ${String(error).replace(/\s+/g, " ").trim().slice(0, 300)}`
        }
      }
    })
  }
}
