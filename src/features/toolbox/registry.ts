// biome-ignore lint/style/noExcessiveClassesPerFile: UpstreamRegistry and ToolRegistry are tightly coupled (the registry owns entries, ToolRegistry adds validation/search on top) and are only meaningful together.
import { type Config, SERVER_NAME_RE, type ServerConfig } from './config.js'

interface Entry {
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
interface SearchRow {
  server: string
  tool: string
  qualifiedName: string
  summary: string
  title?: string
  stale?: boolean
}
const TOOL_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/
const WHITESPACE_RE = /\s+/g
const MAX_ERROR_MESSAGE_LENGTH = 300
const SUMMARY_MAX_LENGTH = 120
const MAX_SEARCH_LIMIT = 500
const BASE_RETRY_MS = 1000
const MAX_RETRY_MS = 30_000
const RETRY_BACKOFF_EXPONENT = 2
const RETRY_CAP_FACTOR = 6
const initialConnState = (disabled: boolean): Entry['connState'] => {
  if (disabled) {
    return 'disabled'
  }
  return 'idle'
}
const retryDelay = (failCount: number): number => {
  if (failCount <= 1) {
    return BASE_RETRY_MS
  }
  if (failCount > RETRY_CAP_FACTOR) {
    return MAX_RETRY_MS
  }
  return BASE_RETRY_MS * RETRY_BACKOFF_EXPONENT ** (failCount - 1)
}
const rowFor = (name: string, tool: UpstreamTool, entry: Entry): SearchRow => {
  const row: SearchRow = {
    server: name,
    tool: tool.name,
    qualifiedName: qualifiedName(name, tool.name),
    summary: String(tool.description || tool.name).slice(0, SUMMARY_MAX_LENGTH),
  }
  if (tool.title) {
    row.title = tool.title
  }
  if (entry.metadataCache === null || entry.metadataStale) {
    row.stale = true
  }
  return row
}
export interface UpstreamTool {
  name: string
  title?: string
  description?: string
  inputSchema: unknown
  outputSchema?: unknown
}
export class UpstreamRegistry {
  readonly config: Config
  readonly entries = new Map<string, Entry>()
  constructor(config: Config) {
    this.config = config
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      this.entries.set(name, {
        config: serverConfig,
        connState: initialConnState(serverConfig.disabled),
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
    const entry = this.get(name)
    if (entry) {
      entry.session = session
    }
  }
  clearSession(name: string) {
    const entry = this.get(name)
    if (entry) {
      entry.session = null
    }
  }
  touch(name: string) {
    const entry = this.get(name)
    if (entry) {
      entry.lastUsedAt = Date.now()
    }
  }
  setState(name: string, state: Entry['connState']) {
    const entry = this.get(name)
    if (entry) {
      entry.connState = state
    }
  }
  markError(name: string, message: string) {
    const entry = this.get(name)
    if (!entry) {
      return
    }
    entry.connState = 'error'
    entry.lastError = message.replace(WHITESPACE_RE, ' ').trim().slice(0, MAX_ERROR_MESSAGE_LENGTH)
    entry.failCount += 1
    entry.nextRetryAt = Date.now() + retryDelay(entry.failCount)
    entry.session = null
  }
  clearError(name: string) {
    const entry = this.get(name)
    if (!entry) {
      return
    }
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
    if (entry) {
      entry.metadataStale = true
    }
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
  if (index < 0) {
    return null
  }
  const server = name.slice(0, index)
  const tool = name.slice(index + 2)
  if (SERVER_NAME_RE.test(server) && TOOL_NAME_RE.test(tool)) {
    return { server, tool }
  }
  return null
}
export class ToolRegistry {
  readonly upstream: UpstreamRegistry
  constructor(upstream: UpstreamRegistry) {
    this.upstream = upstream
  }
  validateToolName(name: string) {
    return TOOL_NAME_RE.test(name)
  }
  validateServerName(name: string) {
    return SERVER_NAME_RE.test(name)
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
  needsRefresh(server?: string | null): boolean {
    let names = this.upstream.enabledNames()
    if (server) {
      if (this.upstream.has(server)) {
        names = [server]
      } else {
        names = []
      }
    }
    return names.some((name) => {
      const entry = this.upstream.get(name)
      if (!entry) {
        return false
      }
      return entry.metadataCache === null || entry.metadataStale || entry.connState === 'idle'
    })
  }
  search(input: { query?: string | null; server?: string | null; limit?: number; refresh: boolean }) {
    let names = this.upstream.enabledNames()
    if (input.server) {
      if (this.upstream.has(input.server)) {
        names = [input.server]
      } else {
        names = []
      }
    }
    const query = (input.query ?? '').toLowerCase()
    let limit = this.upstream.config.searchTopK
    if (typeof input.limit === 'number' && Number.isInteger(input.limit)) {
      limit = Math.min(input.limit, MAX_SEARCH_LIMIT)
    }
    const servers: Array<{ entry: Entry; name: string; tools: UpstreamTool[] }> = []
    for (const name of names) {
      const entry = this.upstream.get(name)
      if (entry) {
        servers.push({ entry, name, tools: entry.metadataCache ?? [] })
      }
    }
    const rows = servers.flatMap(({ entry, name, tools }) =>
      tools
        .map((tool) => rowFor(name, tool, entry))
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
        stale: entry.metadataCache === null || entry.metadataStale,
      })),
      tools: rows.slice(0, limit),
      total: rows.length,
      shown: Math.min(rows.length, limit),
      truncated: rows.length > limit,
      searched: { query: query || null, server: input.server || null, refresh: input.refresh },
    }
  }
}
export { TOOL_NAME_RE }
