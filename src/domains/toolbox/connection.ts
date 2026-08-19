import { DisabledServerError, MS_PER_SECOND, UnknownServerError } from "./connection-helpers";
import { connectServerSession } from "./connection-connect";
import { callToolOnServer, listToolsForServer } from "./connection-invoker";
import { ProcessPool } from "./connection-pool";
import type { Session } from "./connection-types";
import type { Logger } from "./logger";
import type { ToolRegistry } from "./registry-tools";
import type { ServerConfig, ToolboxConfig, UpstreamTool } from "./types";

export { buildStdioEnv, DisabledServerError, UnknownServerError } from "./connection-helpers";
export type { Session } from "./connection-types";

export class ConnectionManager {
  private readonly config: ToolboxConfig;
  private readonly tools: ToolRegistry;
  private readonly logger: Logger;
  private readonly version: string;
  private readonly pool: ProcessPool;
  private readonly sessions = new Map<string, Session>();
  private readonly connecting = new Map<string, Promise<Session>>();
  private readonly children = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(config: ToolboxConfig, tools: ToolRegistry, logger: Logger, version = "0.0.0") {
    this.config = config;
    this.tools = tools;
    this.logger = logger;
    this.version = version;
    this.pool = new ProcessPool(config.processPoolSize);
  }

  private timeout(cfg: ServerConfig): number {
    return Math.max(1, Math.round((cfg.timeout ?? this.config.timeoutSeconds) * MS_PER_SECOND));
  }

  private validateSessionEntry(name: string) {
    const entry = this.tools.upstream.get(name);

    if (!entry) {throw new UnknownServerError(`unknown upstream server: ${name}`);}
    if (this.pool.isClosed()) {throw new Error("aggregator is shutting down");}
    if (entry.config.disabled) {throw new DisabledServerError(`upstream server is disabled: ${name}`);}
    if (entry.connState === "error" && Date.now() < entry.nextRetryAt) {
      throw new Error(`connect failed: ${entry.lastError ?? "unknown error"}`);
    }
    return entry;
  }

  async getSession(name: string): Promise<Session> {
    const entry = this.validateSessionEntry(name);

    const existing = this.sessions.get(name);

    if (existing && entry.connState === "connected") {
      this.touch(name);
      return existing;
    }

    const pending = this.connecting.get(name);

    if (pending) {return pending;}

    const promise = this.connect(name);
    this.connecting.set(name, promise);
    try {
      return await promise;
    } finally {
      this.connecting.delete(name);
    }
  }

  private createConnectCallbacks() {
    return {
      teardown: (n: string, err: string | null) => { this.teardown(n, err); },
      setSession: (n: string, s: Session) => {
        this.sessions.set(n, s);
        this.tools.upstream.setSession(n, s);
      },
      clearError: (n: string) => { this.tools.upstream.clearError(n); },
      markError: (n: string, msg: string) => { this.tools.upstream.markError(n, msg); },
      touch: (n: string) => { this.touch(n); },
    };
  }

  private async connect(name: string): Promise<Session> {
    const entry = this.tools.upstream.get(name);

    if (!entry) {throw new UnknownServerError(`unknown upstream server: ${name}`);}

    return connectServerSession(
      name,
      entry,
      this.pool,
      this.timeout(entry.config),
      this.version,
      this.createConnectCallbacks(),
    );
  }

  async listToolsFor(name: string): Promise<UpstreamTool[] | null> {
    const entry = this.tools.upstream.get(name);

    if (!entry) {throw new UnknownServerError(`unknown upstream server: ${name}`);}

    let session: Session;

    try {
      session = await this.getSession(name);
    } catch {
      return null;
    }

    const res = await listToolsForServer(
      session.client,
      entry,
      name,
      this.tools,
      this.timeout(entry.config),
      (n, err) => { this.teardown(n, err); },
    );

    if (res) {this.touch(name);}
    return res;
  }

  async callTool(server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const entry = this.tools.upstream.get(server);

    if (!entry) {throw new UnknownServerError(`unknown upstream server: ${server}`);}

    const session = await this.getSession(server);

    const result = await callToolOnServer(session.client, tool, args, this.timeout(entry.config), signal);
    this.touch(server);
    return result;
  }

  touch(name: string): void {
    this.tools.upstream.touch(name);
    const timer = this.timers.get(name);

    if (timer) {clearTimeout(timer);}
    if (this.config.idleTimeoutMs) {
      const next = setTimeout(() => { this.teardown(name, null); }, this.config.idleTimeoutMs);
      (next as unknown as { unref?: () => void }).unref?.();
      this.timers.set(name, next);
    }
  }

  private teardown(name: string, error: string | null): void {
    const timer = this.timers.get(name);

    if (timer) {clearTimeout(timer);}
    this.timers.delete(name);
    const session = this.sessions.get(name);
    this.sessions.delete(name);
    this.tools.upstream.clearSession(name);
    if (session?.slot) {this.pool.release();}
    if (session) {void session.client.close().catch(() => undefined);}
    if (error) {
      this.tools.upstream.markError(name, error);
    } else {
      this.tools.upstream.setState(name, "idle");
    }
  }

  async closeAll(): Promise<void> {
    if (this.pool.isClosed()) {return;}
    this.pool.close();
    for (const timer of this.timers.values()) {clearTimeout(timer);}
    this.timers.clear();
    await Promise.allSettled([...this.sessions.values()].map((s) => s.client.close()));
    this.sessions.clear();
    for (const name of this.tools.upstream.names()) {this.tools.upstream.clearSession(name);}
  }

  forceKillStale(): void {
    for (const [name, pid] of this.children) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // process may already be gone
      }
      this.children.delete(name);
    }
  }
}
