import type { ServerConfig, ServerEntry, ToolboxConfig, UpstreamTool } from "./types";

const BASE_RETRY_MS = 1000;

const MAX_RETRY_MS = 30_000;

const RETRY_BACKOFF_EXPONENT = 2;

const RETRY_CAP_FACTOR = 6;

const MAX_ERROR_MESSAGE_LENGTH = 300;

const WHITESPACE_RE = /\s+/g;

function initialConnState(disabled: boolean): ServerEntry["connState"] {
  return disabled ? "disabled" : "idle";
}

function calculateRetryDelay(failCount: number): number {
  if (failCount <= 1) {
    return BASE_RETRY_MS;
  }
  if (failCount > RETRY_CAP_FACTOR) {
    return MAX_RETRY_MS;
  }
  return BASE_RETRY_MS * RETRY_BACKOFF_EXPONENT ** (failCount - 1);
}

function createInitialEntry(config: ServerConfig): ServerEntry {
  return {
    config,
    connState: initialConnState(config.disabled),
    session: null,
    metadataCache: null,
    metadataStale: false,
    lastError: null,
    lastUsedAt: null,
    skippedTools: [],
    failCount: 0,
    nextRetryAt: 0,
  };
}

export class UpstreamRegistry {
  readonly config: ToolboxConfig;
  readonly entries = new Map<string, ServerEntry>();

  constructor(config: ToolboxConfig) {
    this.config = config;
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      this.entries.set(name, createInitialEntry(serverConfig));
    }
  }

  get(name: string): ServerEntry | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  enabledNames(): string[] {
    return [...this.entries].filter(([, entry]) => !entry.config.disabled).map(([name]) => name);
  }

  setSession(name: string, session: unknown): void {
    const entry = this.get(name);

    if (entry) {
      entry.session = session;
    }
  }

  clearSession(name: string): void {
    const entry = this.get(name);

    if (entry) {
      entry.session = null;
    }
  }

  touch(name: string): void {
    const entry = this.get(name);

    if (entry) {
      entry.lastUsedAt = Date.now();
    }
  }

  setState(name: string, state: ServerEntry["connState"]): void {
    const entry = this.get(name);

    if (entry) {
      entry.connState = state;
    }
  }

  markError(name: string, message: string): void {
    const entry = this.get(name);

    if (!entry) {
      return;
    }
    entry.connState = "error";
    entry.lastError = message.replace(WHITESPACE_RE, " ").trim().slice(0, MAX_ERROR_MESSAGE_LENGTH);
    entry.failCount += 1;
    entry.nextRetryAt = Date.now() + calculateRetryDelay(entry.failCount);
    entry.session = null;
  }

  clearError(name: string): void {
    const entry = this.get(name);

    if (!entry) {
      return;
    }
    entry.connState = "connected";
    entry.lastError = null;
    entry.failCount = 0;
    entry.nextRetryAt = 0;
  }

  setCache(name: string, tools: UpstreamTool[]): void {
    const entry = this.get(name);

    if (entry) {
      entry.metadataCache = tools;
      entry.metadataStale = false;
    }
  }

  markCacheStale(name: string): void {
    const entry = this.get(name);

    if (entry) {
      entry.metadataStale = true;
    }
  }

  evict(name: string): void {
    const entry = this.get(name);

    if (entry) {
      entry.metadataCache = null;
      entry.metadataStale = false;
    }
  }
}
