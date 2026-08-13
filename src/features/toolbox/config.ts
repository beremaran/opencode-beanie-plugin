// biome-ignore lint/style/noExcessiveLinesPerFile: cohesive config normalization/validation module; its helpers (fail, plain, typeName, primitive, string, bool, int, num, strings, stringMap) are interdependent and shared across every normalizer, so splitting would fragment tightly-coupled logic.
const GLOB_RE = /^[A-Za-z0-9._*-]+$/
const HTTP_URL_RE = /^https?:\/\//i
const envRe = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g
const DEFAULT_SEARCH_TOP_K = 20
const MIN_SEARCH_TOP_K = 1
const MAX_SEARCH_TOP_K = 500
const DEFAULT_PROCESS_POOL_SIZE = 8
const MIN_PROCESS_POOL_SIZE = 1
const MAX_PROCESS_POOL_SIZE = 64
const DEFAULT_TIMEOUT_SECONDS = 30
const MIN_TIMEOUT_SECONDS = 1
const MAX_TIMEOUT_SECONDS = 600
const DEFAULT_IDLE_TIMEOUT_MS = 300_000
const MIN_IDLE_TIMEOUT_MS = 0
const MAX_IDLE_TIMEOUT_MS = 3_600_000
const typeName = (value: unknown): string => {
  if (value === null) {
    return 'null'
  }
  return typeof value
}
const fail = (where: string, message: string): never => {
  throw new ConfigError(`config error: ${where}: ${message}`)
}
const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const primitive = (where: string, value: unknown, expected: 'string' | 'boolean'): void => {
  if (typeof value !== expected) {
    fail(where, `expected a ${expected}, got ${typeName(value)}`)
  }
}
const string = (where: string, value: unknown): void => primitive(where, value, 'string')
const bool = (where: string, value: unknown): void => primitive(where, value, 'boolean')
const int = (where: string, value: unknown, min: number, max: number): void => {
  const n = value as number
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(where, `expected an integer in range ${min}..${max}`)
  }
}
const num = (where: string, value: unknown, min: number, max: number): void => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    fail(where, `expected a number in range ${min}..${max}`)
  }
}
const strings = (where: string, value: unknown): string[] => {
  if (!Array.isArray(value)) {
    fail(where, 'expected an array of strings')
  }
  const list = value as unknown[]
  for (const [index, item] of list.entries()) {
    string(`${where}[${index}]`, item)
  }
  return value as string[]
}
const stringMap = (where: string, value: unknown): Record<string, string> => {
  if (!plain(value)) {
    fail(where, 'expected an object of strings')
  }
  const map = value as Record<string, unknown>
  for (const [key, item] of Object.entries(map)) {
    string(`${where}.${key}`, item)
  }
  return value as Record<string, string>
}
interface ServerCommon {
  disabled: boolean
  timeout: number | undefined
  toolFilter: string[]
  tags: string[]
}
const validateKeys = (input: Record<string, unknown>): void => {
  const allowed = new Set([
    'mcpServers',
    'searchTopK',
    'cacheToolMetadata',
    'processPoolSize',
    'timeoutSeconds',
    'idleTimeoutMs',
  ])
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      fail(key, 'unknown key')
    }
  }
}
const buildCommon = (at: string, value: Record<string, unknown>): ServerCommon => {
  let toolFilter: string[] = []
  if (value.toolFilter) {
    toolFilter = strings(`${at}.toolFilter`, value.toolFilter)
  }
  for (const pattern of toolFilter) {
    if (!(pattern && GLOB_RE.test(pattern))) {
      fail(`${at}.toolFilter`, 'invalid glob pattern')
    }
  }
  let tags: string[] = []
  if (value.tags) {
    tags = strings(`${at}.tags`, value.tags)
  }
  const timeout = value.timeout as number | undefined
  if (timeout !== undefined) {
    num(`${at}.timeout`, timeout, Number.EPSILON, Number.MAX_SAFE_INTEGER)
  }
  if (value.disabled !== undefined) {
    bool(`${at}.disabled`, value.disabled)
  }
  return { disabled: value.disabled === true, timeout, toolFilter, tags }
}
const buildStdioServer = (at: string, value: Record<string, unknown>, common: ServerCommon): ServerConfig => {
  const command = value.command as string
  string(`${at}.command`, command)
  if (!command) {
    fail(`${at}.command`, 'must not be empty')
  }
  let args: string[] = []
  if (value.args) {
    args = strings(`${at}.args`, value.args)
  }
  let env: Record<string, string> = {}
  if (value.env) {
    env = stringMap(`${at}.env`, value.env)
  }
  const config: ServerConfig = {
    ...common,
    type: 'stdio',
    command,
    args,
    env,
  }
  if (value.cwd === undefined) {
    return config
  }
  const cwd = value.cwd as string
  string(`${at}.cwd`, cwd)
  return { ...config, cwd }
}
const buildHttpServer = (at: string, value: Record<string, unknown>, common: ServerCommon): ServerConfig => {
  const url = value.url as string
  string(`${at}.url`, url)
  if (!HTTP_URL_RE.test(url)) {
    fail(`${at}.url`, 'must start with http:// or https://')
  }
  const rawTransportType = value.transportType ?? 'streamable-http'
  if (rawTransportType !== 'streamable-http' && rawTransportType !== 'sse') {
    fail(`${at}.transportType`, 'must be streamable-http or sse')
  }
  const transportType = rawTransportType as 'streamable-http' | 'sse'
  let headers: Record<string, string> = {}
  if (value.headers) {
    headers = stringMap(`${at}.headers`, value.headers)
  }
  return {
    ...common,
    type: 'http',
    url,
    headers,
    transportType,
  }
}
const normalizeServerConfig = (at: string, value: unknown): ServerConfig => {
  if (!plain(value)) {
    fail(at, 'expected an object')
  }
  const input = value as Record<string, unknown>
  const hasCommand = 'command' in input
  const hasUrl = 'url' in input
  if (hasCommand === hasUrl) {
    fail(at, 'server must have exactly one of command or url')
  }
  const common = buildCommon(at, input)
  if (hasCommand) {
    return buildStdioServer(at, input, common)
  }
  return buildHttpServer(at, input, common)
}
const normalizeServers = (input: Record<string, unknown>): Record<string, ServerConfig> => {
  const { mcpServers } = input
  if (!plain(mcpServers)) {
    fail('mcpServers', 'required key missing or expected an object')
  }
  const map = mcpServers as Record<string, unknown>
  const servers: Record<string, ServerConfig> = {}
  for (const [name, value] of Object.entries(map)) {
    const at = `mcpServers.${name}`
    if (!SERVER_NAME_RE.test(name)) {
      fail(at, 'invalid server name')
    }
    servers[name] = normalizeServerConfig(at, value)
  }
  return servers
}
const normalizeScalars = (
  input: Record<string, unknown>,
): Pick<Config, 'searchTopK' | 'processPoolSize' | 'timeoutSeconds' | 'idleTimeoutMs' | 'cacheToolMetadata'> => {
  const searchTopK = (input.searchTopK ?? DEFAULT_SEARCH_TOP_K) as number
  int('searchTopK', searchTopK, MIN_SEARCH_TOP_K, MAX_SEARCH_TOP_K)
  const processPoolSize = (input.processPoolSize ?? DEFAULT_PROCESS_POOL_SIZE) as number
  int('processPoolSize', processPoolSize, MIN_PROCESS_POOL_SIZE, MAX_PROCESS_POOL_SIZE)
  const timeoutSeconds = (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) as number
  num('timeoutSeconds', timeoutSeconds, MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
  const idleTimeoutMs = (input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS) as number
  int('idleTimeoutMs', idleTimeoutMs, MIN_IDLE_TIMEOUT_MS, MAX_IDLE_TIMEOUT_MS)
  const cacheToolMetadata = (input.cacheToolMetadata ?? true) as boolean
  bool('cacheToolMetadata', cacheToolMetadata)
  return { searchTopK, processPoolSize, timeoutSeconds, idleTimeoutMs, cacheToolMetadata }
}
const normalize = (raw: unknown): Config => {
  if (!plain(raw)) {
    fail('config', 'expected an object')
  }
  const input = raw as Record<string, unknown>
  validateKeys(input)
  const mcpServers = normalizeServers(input)
  const scalars = normalizeScalars(input)
  return Object.freeze({
    mcpServers,
    searchTopK: scalars.searchTopK,
    processPoolSize: scalars.processPoolSize,
    timeoutSeconds: scalars.timeoutSeconds,
    idleTimeoutMs: scalars.idleTimeoutMs,
    cacheToolMetadata: scalars.cacheToolMetadata,
  })
}
export const SERVER_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/
export type ServerConfig =
  | {
      type: 'stdio'
      command: string
      args: string[]
      env: Record<string, string>
      cwd?: string
      disabled: boolean
      timeout?: number
      toolFilter: string[]
      tags: string[]
    }
  | {
      type: 'http'
      url: string
      headers: Record<string, string>
      transportType: 'streamable-http' | 'sse'
      disabled: boolean
      timeout?: number
      toolFilter: string[]
      tags: string[]
    }
export interface Config {
  mcpServers: Record<string, ServerConfig>
  searchTopK: number
  cacheToolMetadata: boolean
  processPoolSize: number
  timeoutSeconds: number
  idleTimeoutMs: number
}
export class ConfigError extends Error {
  name = 'ConfigError'
}
export function substituteEnv(value: unknown, env: Record<string, string | undefined>): unknown {
  if (typeof value === 'string') {
    return value.replace(envRe, (match, name: string, fallback?: string) => {
      const found = env[name]
      if (found) {
        return found
      }
      if (fallback !== undefined) {
        return fallback
      }
      throw new ConfigError(`config error: missing environment variable ${name} referenced by "${match}"`)
    })
  }
  if (Array.isArray(value)) {
    return value.map((item) => substituteEnv(item, env))
  }
  if (plain(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteEnv(item, env)]))
  }
  return value
}
export function loadConfig(options: {
  config?: unknown
  servers?: unknown
  env?: Record<string, string | undefined>
  logger: { info: (message: string) => void; warn: (message: string) => void }
}): Config | null {
  const env = options.env ?? (process.env as Record<string, string | undefined>)
  let raw: unknown
  if (options.servers !== undefined) {
    raw = { mcpServers: options.servers }
  } else if (plain(options.config)) {
    raw = options.config
  } else if (options.config === undefined) {
    options.logger.info('toolbox disabled: no inline mcpServers configured')
    return null
  } else {
    fail('config', 'config must be an inline object with mcpServers; external JSON config files are not supported')
  }
  const result = normalize(substituteEnv(raw, env))
  if (!Object.values(result.mcpServers).some((server) => !server.disabled)) {
    options.logger.warn('no enabled upstream servers configured')
  }
  return result
}
