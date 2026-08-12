import { Client, SSEClientTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { Config, ServerConfig } from './config.js'
import { matchesToolFilter } from './filters.js'
import type { Logger } from './logger.js'
import type { ToolRegistry, UpstreamTool } from './registry.js'
export class UnknownServerError extends Error {}
export class DisabledServerError extends Error {}
export const buildStdioEnv = (env: Record<string, string> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
interface Session {
  client: Client
  transport: any
  slot: boolean
}
export class ConnectionManager {
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
  constructor(
    private readonly config: Config,
    private readonly tools: ToolRegistry,
    private readonly logger: Logger,
    private readonly version = '0.0.0',
  ) {
    this.available = config.processPoolSize
  }
  private timeout(cfg: ServerConfig) {
    return Math.max(1, Math.round((cfg.timeout ?? this.config.timeoutSeconds) * 1000))
  }
  async getSession(name: string): Promise<Session> {
    const entry = this.tools.upstream.get(name)
    if (!entry) {
      throw new UnknownServerError(`unknown upstream server: ${name}`)
    }
    if (this.closed) {
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
    const entry = this.tools.upstream.get(name)!
    const timeout = this.timeout(entry.config)
    let slot = false
    let transport: any
    let client: Client | undefined
    try {
      if (entry.config.type === 'stdio') {
        await this.acquire(timeout)
        slot = true
      }
      transport = this.transport(entry.config)
      client = new Client({ name: 'mcp-aggregator', version: this.version }, {
        versionNegotiation: { mode: 'legacy' },
      } as any)
      try {
        client.setNotificationHandler('notifications/tools/list_changed', () => {
          this.tools.evict(name)
          this.logger.info(`upstream "${name}" changed its tool list`)
        })
      } catch (error) {
        this.logger.warn(`could not wire list_changed handler for "${name}": ${String(error)}`)
      }
      transport.onclose = () => {
        if (!this.closed) {
          this.teardown(name, null)
        }
      }
      transport.onerror = (error: unknown) => {
        if (!this.closed) {
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
      } catch {}
      try {
        if (!client) {
          await transport?.close()
        }
      } catch {}
      const message =
        entry.config.type === 'stdio' ? `spawn ${entry.config.command}: ${this.safe(error)}` : this.safe(error)
      this.tools.upstream.markError(name, message)
      throw new Error(message)
    }
  }
  private transport(cfg: ServerConfig) {
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
    return cfg.transportType === 'sse'
      ? new SSEClientTransport(url, options)
      : new StreamableHTTPClientTransport(url, options)
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
      } as any)
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
    const result = await session.client.callTool({ name: tool, arguments: args }, {
      timeout: this.timeout(entry.config),
      ...(signal ? { signal } : {}),
    } as any)
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
      ;(next as any).unref?.()
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
  private acquire(timeout: number) {
    if (this.closed) {
      return Promise.reject(new Error('shutdown'))
    }
    if (this.available) {
      this.available--
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter)
          reject(new Error(`process pool: no slot available within ${Math.round(timeout / 1000)}s`))
        }, timeout),
      }
      ;(waiter.timer as any).unref?.()
      this.waiters.push(waiter)
    })
  }
  private release() {
    const waiter = this.waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve()
    } else {
      this.available++
    }
  }
  private safe(error: unknown) {
    const value = error as { message?: string; status?: number; statusText?: string }
    if (typeof value.status === 'number') {
      return `HTTP ${value.status}${value.statusText ? ` ${value.statusText}` : ''}`
    }
    const message = String(value.message ?? error)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
    return /tim(eo|e)out/i.test(message) ? 'request timed out' : message
  }
  async closeAll() {
    if (this.closed) {
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
        ;(process as any).kill(pid, 'SIGKILL')
      } catch {}
      this.children.delete(name)
    }
  }
}
