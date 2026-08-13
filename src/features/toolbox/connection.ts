// biome-ignore lint/style/noExcessiveLinesPerFile: cohesive MCP connection-lifecycle module (session pool, transport wiring, retry/backoff, teardown); splitting it would fragment interdependent state.
// biome-ignore lint/style/noExcessiveClassesPerFile: UnknownServerError and DisabledServerError are tiny, single-purpose error types thrown by ConnectionManager; extracting them into separate files would fragment a cohesive module.
import {
  type CallToolRequestOptions,
  Client,
  // biome-ignore lint/suspicious/noDeprecatedImports: SSEClientTransport stays needed for legacy SSE-only MCP servers; the SDK deprecates it in favor of StreamableHTTPClientTransport, which cannot serve those servers.
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type Transport,
} from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { Config, ServerConfig } from './config.js'
import { matchesToolFilter } from './filters.js'
import type { Logger } from './logger.js'
import type { ToolRegistry, UpstreamTool } from './registry.js'

interface Session {
  client: Client
  transport: Transport
  slot: boolean
}

const MS_PER_SECOND = 1000
const MAX_ERROR_MESSAGE_LENGTH = 300
const TIMEOUT_RE = /tim(eo|e)out/i
const WHITESPACE_RE = /\s+/g
const maybeUnref = (timer: number): void => {
  ;(timer as unknown as { unref?: () => void }).unref?.()
}
const killProcess = (pid: number): void => {
  ;(process as unknown as { kill: (pid: number, signal: string) => void }).kill(pid, 'SIGKILL')
}

export class UnknownServerError extends Error {}
export class DisabledServerError extends Error {}
export const buildStdioEnv = (env: Record<string, string> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
export class ConnectionManager {
  private readonly config: Config
  private readonly tools: ToolRegistry
  private readonly logger: Logger
  private readonly version: string
  private readonly sessions = new Map<string, Session>()
  private readonly connecting = new Map<string, Promise<Session>>()
  private readonly children = new Map<string, number>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private closed = false
  private available: number
  private waiters: Array<{
    resolve: () => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []
  constructor(config: Config, tools: ToolRegistry, logger: Logger, version = '0.0.0') {
    this.config = config
    this.tools = tools
    this.logger = logger
    this.version = version
    this.available = config.processPoolSize
  }
  private timeout(cfg: ServerConfig) {
    return Math.max(1, Math.round((cfg.timeout ?? this.config.timeoutSeconds) * MS_PER_SECOND))
  }
  private isClosed() {
    return this.closed
  }
  async getSession(name: string): Promise<Session> {
    const entry = this.tools.upstream.get(name)
    if (!entry) {
      throw new UnknownServerError(`unknown upstream server: ${name}`)
    }
    // biome-ignore lint/suspicious/noUnnecessaryConditions: closed flips to true in closeAll(); biome locks the field to its false initializer, but this guards against post-shutdown calls.
    if (this.isClosed()) {
      throw new Error('aggregator is shutting down')
    }
    if (entry.config.disabled) {
      throw new DisabledServerError(`upstream server is disabled: ${name}`)
    }
    if (entry.connState === 'error' && Date.now() < entry.nextRetryAt) {
      throw new Error(`connect failed: ${entry.lastError ?? 'unknown error'}`)
    }
    const existing = this.sessions.get(name)
    if (existing && entry.connState === 'connected') {
      this.touch(name)
      return existing
    }
    const pending = this.connecting.get(name)
    if (pending) {
      return pending
    }
    const promise = this.connect(name)
    this.connecting.set(name, promise)
    try {
      return await promise
    } finally {
      this.connecting.delete(name)
    }
  }
  private async connect(name: string): Promise<Session> {
    const entry = this.tools.upstream.get(name)
    if (!entry) {
      throw new UnknownServerError(`unknown upstream server: ${name}`)
    }
    const timeout = this.timeout(entry.config)
    let slot = false
    let transport: Transport | undefined
    let client: Client | undefined
    try {
      if (entry.config.type === 'stdio') {
        await this.acquire(timeout)
        slot = true
      }
      transport = this.transport(entry.config)
      client = new Client(
        { name: 'mcp-aggregator', version: this.version },
        {
          versionNegotiation: { mode: 'legacy' },
        },
      )
      try {
        client.setNotificationHandler('notifications/tools/list_changed', () => {
          this.tools.evict(name)
          this.logger.info(`upstream "${name}" changed its tool list`)
        })
      } catch (error) {
        this.logger.warn(`could not wire list_changed handler for "${name}": ${String(error)}`)
      }
      transport.onclose = () => {
        // biome-ignore lint/suspicious/noUnnecessaryConditions: transport callbacks fire asynchronously and can run after closeAll() sets closed=true; genuine race guard.
        if (!this.isClosed()) {
          this.teardown(name, null)
        }
      }
      transport.onerror = (error: unknown) => {
        // biome-ignore lint/suspicious/noUnnecessaryConditions: transport callbacks fire asynchronously and can run after closeAll() sets closed=true; genuine race guard.
        if (!this.isClosed()) {
          this.teardown(name, this.safe(error))
        }
      }
      await client.connect(transport, { timeout })
      const session = { client, transport, slot }
      this.sessions.set(name, session)
      this.tools.upstream.setSession(name, session)
      this.tools.upstream.clearError(name)
      this.tools.upstream.setState(name, 'connected')
      this.touch(name)
      return session
    } catch (error) {
      if (slot) {
        this.release()
      }
      try {
        await client?.close()
      } catch {
        // best-effort client close on failed connect
      }
      try {
        if (!client) {
          await transport?.close()
        }
      } catch {
        // best-effort transport close on failed connect
      }
      let message = this.safe(error)
      if (entry.config.type === 'stdio') {
        message = `spawn ${entry.config.command}: ${message}`
      }
      this.tools.upstream.markError(name, message)
      throw new Error(message, { cause: error })
    }
  }
  private transport(cfg: ServerConfig): Transport {
    if (cfg.type === 'stdio') {
      return new StdioClientTransport({
        command: cfg.command,
        args: cfg.args,
        env: buildStdioEnv(cfg.env),
        cwd: cfg.cwd,
        stderr: 'pipe',
      })
    }
    const url = new URL(cfg.url)
    const options = { requestInit: { headers: { ...cfg.headers } } }
    if (cfg.transportType === 'sse') {
      return new SSEClientTransport(url, options)
    }
    return new StreamableHTTPClientTransport(url, options)
  }
  async listToolsFor(name: string) {
    const entry = this.tools.upstream.get(name)
    if (!entry) {
      throw new UnknownServerError(`unknown upstream server: ${name}`)
    }
    let session: Session
    try {
      session = await this.getSession(name)
    } catch {
      return null
    }
    try {
      const result = await session.client.listTools(undefined, {
        timeout: this.timeout(entry.config),
        cacheMode: 'refresh',
      })
      const filtered = (result.tools as UpstreamTool[]).filter(
        (tool) => this.tools.validateToolName(tool.name) && matchesToolFilter(tool.name, entry.config.toolFilter),
      )
      entry.skippedTools = (result.tools as UpstreamTool[])
        .filter((tool) => !this.tools.validateToolName(tool.name))
        .map((tool) => tool.name)
      this.tools.setCache(name, filtered)
      this.touch(name)
      return filtered
    } catch (error) {
      this.teardown(name, this.safe(error))
      if (entry.metadataCache) {
        entry.metadataStale = true
      }
      return null
    }
  }
  async callTool(server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const entry = this.tools.upstream.get(server)
    if (!entry) {
      throw new UnknownServerError(`unknown upstream server: ${server}`)
    }
    const session = await this.getSession(server)
    const options: CallToolRequestOptions = { timeout: this.timeout(entry.config) }
    if (signal) {
      options.signal = signal
    }
    const result = await session.client.callTool({ name: tool, arguments: args }, options)
    this.touch(server)
    return result
  }
  touch(name: string) {
    this.tools.upstream.touch(name)
    const timer = this.timers.get(name)
    if (timer) {
      clearTimeout(timer)
    }
    if (this.config.idleTimeoutMs) {
      const next = setTimeout(() => this.teardown(name, null), this.config.idleTimeoutMs)
      maybeUnref(next)
      this.timers.set(name, next)
    }
  }
  private teardown(name: string, error: string | null) {
    const timer = this.timers.get(name)
    if (timer) {
      clearTimeout(timer)
    }
    this.timers.delete(name)
    const session = this.sessions.get(name)
    this.sessions.delete(name)
    this.tools.upstream.clearSession(name)
    if (session?.slot) {
      this.release()
    }
    if (session) {
      void session.client.close().catch(() => undefined)
    }
    if (error) {
      this.tools.upstream.markError(name, error)
    } else {
      this.tools.upstream.setState(name, 'idle')
    }
  }
  private acquire(timeout: number): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: closed flips to true in closeAll(); biome locks the field to its false initializer, but this guards against acquiring slots after shutdown.
    if (this.isClosed()) {
      return Promise.reject(new Error('shutdown'))
    }
    if (this.available) {
      this.available -= 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter)
          reject(new Error(`process pool: no slot available within ${Math.round(timeout / MS_PER_SECOND)}s`))
        }, timeout),
      }
      maybeUnref(waiter.timer)
      this.waiters.push(waiter)
    })
  }
  private release() {
    const waiter = this.waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve()
    } else {
      this.available += 1
    }
  }
  private safe(error: unknown) {
    const value = error as { message?: string; status?: number; statusText?: string }
    if (typeof value.status === 'number') {
      let status = `HTTP ${value.status}`
      if (value.statusText) {
        status = `${status} ${value.statusText}`
      }
      return status
    }
    const message = String(value.message ?? error)
      .replace(WHITESPACE_RE, ' ')
      .trim()
      .slice(0, MAX_ERROR_MESSAGE_LENGTH)
    if (TIMEOUT_RE.test(message)) {
      return 'request timed out'
    }
    return message
  }
  async closeAll() {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: closed flips to true in closeAll(); biome locks the field to its false initializer, but this guard keeps closeAll idempotent.
    if (this.isClosed()) {
      return
    }
    this.closed = true
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('shutdown'))
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    await Promise.allSettled([...this.sessions.values()].map((session) => session.client.close()))
    this.sessions.clear()
    for (const name of this.tools.upstream.names()) {
      this.tools.upstream.clearSession(name)
    }
  }
  forceKillStale() {
    for (const [name, pid] of this.children) {
      try {
        killProcess(pid)
      } catch {
        // the process may already be gone
      }
      this.children.delete(name)
    }
  }
}
