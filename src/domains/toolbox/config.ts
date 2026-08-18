import { bool, fail, int, num, plain, substituteEnv } from "./config-helpers";
import { normalizeServers } from "./config-servers";
import type { Logger } from "./logger";
import type { ToolboxConfig } from "./types";

export { GLOB_RE, HTTP_URL_RE, normalizeServerConfig, SERVER_NAME_RE } from "./config-servers";

const DEFAULT_SEARCH_TOP_K = 20;

const MIN_SEARCH_TOP_K = 1;

const MAX_SEARCH_TOP_K = 500;

const DEFAULT_PROCESS_POOL_SIZE = 8;

const MIN_PROCESS_POOL_SIZE = 1;

const MAX_PROCESS_POOL_SIZE = 64;

const DEFAULT_TIMEOUT_SECONDS = 30;

const MIN_TIMEOUT_SECONDS = 1;

const MAX_TIMEOUT_SECONDS = 600;

const DEFAULT_IDLE_TIMEOUT_MS = 300_000;

const MIN_IDLE_TIMEOUT_MS = 0;

const MAX_IDLE_TIMEOUT_MS = 3_600_000;

const ALLOWED_KEYS = new Set([
  "mcpServers",
  "searchTopK",
  "cacheToolMetadata",
  "processPoolSize",
  "timeoutSeconds",
  "idleTimeoutMs",
]);

function validateKeys(input: Record<string, unknown>): void {
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(key, "unknown key");
    }
  }
}

function normalizeScalars(input: Record<string, unknown>) {
  const searchTopK = (input.searchTopK ?? DEFAULT_SEARCH_TOP_K) as number;
  int("searchTopK", searchTopK, MIN_SEARCH_TOP_K, MAX_SEARCH_TOP_K);
  const processPoolSize = (input.processPoolSize ?? DEFAULT_PROCESS_POOL_SIZE) as number;
  int("processPoolSize", processPoolSize, MIN_PROCESS_POOL_SIZE, MAX_PROCESS_POOL_SIZE);
  const timeoutSeconds = (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) as number;
  num("timeoutSeconds", timeoutSeconds, MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
  const idleTimeoutMs = (input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS) as number;
  int("idleTimeoutMs", idleTimeoutMs, MIN_IDLE_TIMEOUT_MS, MAX_IDLE_TIMEOUT_MS);
  const cacheToolMetadata = (input.cacheToolMetadata ?? true) as boolean;
  bool("cacheToolMetadata", cacheToolMetadata);
  return { searchTopK, processPoolSize, timeoutSeconds, idleTimeoutMs, cacheToolMetadata };
}

export function normalizeConfig(raw: unknown): ToolboxConfig {
  if (!plain(raw)) {
    fail("config", "expected an object");
  }

  const input = raw as Record<string, unknown>;
  validateKeys(input);
  const mcpServers = normalizeServers(input);

  const scalars = normalizeScalars(input);

  return Object.freeze({ mcpServers, ...scalars });
}

export function loadConfig(options: {
  config?: unknown;
  servers?: unknown;
  env?: Record<string, string | undefined>;
  logger?: Logger;
}): ToolboxConfig | null {
  const env = options.env ?? (Bun.env);

  let raw: unknown;

  if (options.servers !== undefined) {
    raw = { mcpServers: options.servers };
  } else if (plain(options.config)) {
    raw = options.config;
  } else if (options.config === undefined) {
    options.logger?.info("toolbox disabled: no inline mcpServers configured");
    return null;
  } else {
    fail("config", "config must be an inline object with mcpServers; external JSON config files are not supported");
  }

  const result = normalizeConfig(substituteEnv(raw, env));

  if (!Object.values(result.mcpServers).some((s) => !s.disabled)) {
    options.logger?.warn("no enabled upstream servers configured");
  }
  return result;
}
