import type { Config, ServerConfig } from './config.js'
export const TOOL_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/
export type UpstreamTool = {
  name: string
  title?: string
  description?: string
  inputSchema: unknown
  outputSchema?: unknown
}
type Entry = {
  config: ServerConfig
  connState: 'idle' | 'connected' | 'error' | 'disabled'
  session: unknown
  metadataCache: UpstreamTool[] | null
  metadataStale: boolean
  lastError: string | null
  lastUsedAt: number | null
  skippedTools: string[]
  failCount: number
  nextRetryAt: number
}
export class UpstreamRegistry {
  readonly config: Config
  readonly entries = new Map<string, Entry>()
  constructor(config: Config) {
    this.config = config
    for (const [name, serverConfig] of Object.entries(config.mcpServers))
      this.entries.set(name, {
        config: serverConfig,
        connState: serverConfig.disabled ? 'disabled' : 'idle',
        session: null,
        metadataCache: null,
        metadataStale: false,
        lastError: null,
        lastUsedAt: null,
        skippedTools: [],
        failCount: 0,
        nextRetryAt: 0,
      })
  }
  get(name: string) {
    return this.entries.get(name)
  }
  has(name: string) {
    return this.entries.has(name)
  }
  names() {
    return [...this.entries.keys()]
  }
  enabledNames() {
    return [...this.entries].filter(([, entry]) => !entry.config.disabled).map(([name]) => name)
  }
  setSession(name: string, session: unknown) {
    this.get(name)!.session = session
  }
  clearSession(name: string) {
    const entry = this.get(name)
    if (entry) entry.session = null
  }
  touch(name: string) {
    const entry = this.get(name)
    if (entry) entry.lastUsedAt = Date.now()
  }
  setState(name: string, state: Entry['connState']) {
    const entry = this.get(name)
    if (entry) entry.connState = state
  }
  markError(name: string, message: string) {
    const entry = this.get(name)
    if (!entry) return
    entry.connState = 'error'
    entry.lastError = message.replace(/\s+/g, ' ').trim().slice(0, 300)
    entry.failCount++
    entry.nextRetryAt =
      Date.now() + (entry.failCount <= 1 ? 1000 : entry.failCount > 6 ? 30000 : 1000 * 2 ** (entry.failCount - 1))
    entry.session = null
  }
  clearError(name: string) {
    const entry = this.get(name)
    if (!entry) return
    entry.connState = 'connected'
    entry.lastError = null
    entry.failCount = 0
    entry.nextRetryAt = 0
  }
  setCache(name: string, tools: UpstreamTool[]) {
    const entry = this.get(name)
    if (entry) {
      entry.metadataCache = tools
      entry.metadataStale = false
    }
  }
  markCacheStale(name: string) {
    const entry = this.get(name)
    if (entry) entry.metadataStale = true
  }
  evict(name: string) {
    const entry = this.get(name)
    if (entry) {
      entry.metadataCache = null
      entry.metadataStale = false
    }
  }
}
export const qualifiedName = (server: string, tool: string) => `${server}__${tool}`
export function splitQualified(name: string) {
  const index = name.indexOf('__')
  if (index < 0) return null
  const server = name.slice(0, index),
    tool = name.slice(index + 2)
  return /^[A-Za-z0-9._-]{1,128}$/.test(server) && TOOL_NAME_RE.test(tool) ? { server, tool } : null
}
export class ToolRegistry {
  constructor(readonly upstream: UpstreamRegistry) {}
  validateToolName(name: string) {
    return TOOL_NAME_RE.test(name)
  }
  validateServerName(name: string) {
    return /^[A-Za-z0-9._-]{1,128}$/.test(name)
  }
  getTool(server: string, name: string) {
    return this.upstream.get(server)?.metadataCache?.find((tool) => tool.name === name) ?? null
  }
  setCache(server: string, tools: UpstreamTool[]) {
    this.upstream.setCache(server, tools)
  }
  evict(server: string) {
    this.upstream.evict(server)
  }
  search(input: { query?: string | null; server?: string | null; limit?: number; refresh: boolean }) {
    const names = input.server ? (this.upstream.has(input.server) ? [input.server] : []) : this.upstream.enabledNames(),
      query = (input.query ?? '').toLowerCase(),
      limit = Number.isInteger(input.limit) ? Math.min(input.limit!, 500) : this.upstream.config.searchTopK
    const servers = names.map((name) => {
      const entry = this.upstream.get(name)!
      const tools = entry.metadataCache ?? []
      return { entry, name, tools }
    })
    const rows = servers.flatMap(({ entry, name, tools }) =>
      tools
        .map((tool) => ({
          server: name,
          tool: tool.name,
          qualifiedName: qualifiedName(name, tool.name),
          summary: String(tool.description || tool.name).slice(0, 120),
          ...(tool.title ? { title: tool.title } : {}),
          ...(entry.metadataStale ? { stale: true } : {}),
        }))
        .filter(
          (row) =>
            !query ||
            [row.qualifiedName, row.server, row.tool, row.summary, ...(entry.config.tags ?? [])]
              .join('\0')
              .toLowerCase()
              .includes(query),
        ),
    )
    return {
      servers: servers.map(({ entry, name, tools }) => ({
        name,
        status: entry.connState,
        toolCount: tools.length,
        error: entry.lastError,
        skippedTools: [...entry.skippedTools],
      })),
      tools: rows.slice(0, limit),
      total: rows.length,
      shown: Math.min(rows.length, limit),
      truncated: rows.length > limit,
      searched: { query: query || null, server: input.server || null, refresh: input.refresh },
    }
  }
}
