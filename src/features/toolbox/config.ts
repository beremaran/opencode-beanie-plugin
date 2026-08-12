import fs from 'node:fs'
import path from 'node:path'

export const SERVER_NAME_RE = /^[A-Za-z0-9._-]{1,128}$/
const GLOB_RE = /^[A-Za-z0-9._*-]+$/
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
export type Config = {
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
const fail = (where: string, message: string): never => {
  throw new ConfigError(`config error: ${where}: ${message}`)
}
const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const string = (where: string, value: unknown): void => {
  if (typeof value !== 'string') fail(where, `expected a string, got ${value === null ? 'null' : typeof value}`)
}
const bool = (where: string, value: unknown): void => {
  if (typeof value !== 'boolean') fail(where, `expected a boolean, got ${value === null ? 'null' : typeof value}`)
}
const int = (where: string, value: any, min: number, max: number): void => {
  if (!Number.isInteger(value) || value < min || value > max) fail(where, `expected an integer in range ${min}..${max}`)
}
const num = (where: string, value: any, min: number, max: number): void => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max)
    fail(where, `expected a number in range ${min}..${max}`)
}
const strings = (where: string, value: unknown): string[] => {
  if (!Array.isArray(value)) fail(where, 'expected an array of strings')
  ;(value as unknown[]).forEach((v: unknown, i: number) => {
    string(`${where}[${i}]`, v)
  })
  return value as string[]
}
const stringMap = (where: string, value: unknown): Record<string, string> => {
  if (!plain(value)) fail(where, 'expected an object of strings')
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) string(`${where}.${key}`, item)
  return value as Record<string, string>
}
const envRe = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g
export function substituteEnv(value: unknown, env: Record<string, string | undefined>): unknown {
  if (typeof value === 'string')
    return value.replace(envRe, (match, name: string, fallback?: string) => {
      const found = env[name]
      if (found) return found
      if (fallback !== undefined) return fallback
      throw new ConfigError(`config error: missing environment variable ${name} referenced by "${match}"`)
    })
  if (Array.isArray(value)) return value.map((item) => substituteEnv(item, env))
  if (plain(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteEnv(item, env)]))
  return value
}
function normalize(raw: unknown): Config {
  if (!plain(raw)) fail('config', 'expected an object')
  const input = raw as Record<string, any>
  const allowed = new Set([
    'mcpServers',
    'searchTopK',
    'cacheToolMetadata',
    'processPoolSize',
    'timeoutSeconds',
    'idleTimeoutMs',
  ])
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail(key, 'unknown key')
  if (!plain(input.mcpServers)) fail('mcpServers', 'required key missing or expected an object')
  const servers: Record<string, ServerConfig> = {}
  for (const [name, value] of Object.entries(input.mcpServers as Record<string, any>)) {
    const at = `mcpServers.${name}`
    if (!SERVER_NAME_RE.test(name)) fail(at, 'invalid server name')
    if (!plain(value)) fail(at, 'expected an object')
    const hasCommand = 'command' in value,
      hasUrl = 'url' in value
    if (hasCommand === hasUrl) fail(at, 'server must have exactly one of command or url')
    const common = {
      disabled: value.disabled === true,
      timeout: value.timeout as number | undefined,
      toolFilter: value.toolFilter ? strings(`${at}.toolFilter`, value.toolFilter) : [],
      tags: value.tags ? strings(`${at}.tags`, value.tags) : [],
    }
    if (common.timeout !== undefined) num(`${at}.timeout`, common.timeout, Number.EPSILON, Number.MAX_SAFE_INTEGER)
    if (value.disabled !== undefined) bool(`${at}.disabled`, value.disabled)
    for (const pattern of common.toolFilter)
      if (!pattern || !GLOB_RE.test(pattern)) fail(`${at}.toolFilter`, 'invalid glob pattern')
    if (hasCommand) {
      string(`${at}.command`, value.command)
      if (!value.command) fail(`${at}.command`, 'must not be empty')
      servers[name] = {
        ...common,
        type: 'stdio',
        command: value.command,
        args: value.args ? strings(`${at}.args`, value.args) : [],
        env: value.env ? stringMap(`${at}.env`, value.env) : {},
        ...(value.cwd === undefined ? {} : (string(`${at}.cwd`, value.cwd), { cwd: value.cwd })),
      }
    } else {
      string(`${at}.url`, value.url)
      if (!/^https?:\/\//i.test(value.url)) fail(`${at}.url`, 'must start with http:// or https://')
      const transportType = value.transportType ?? 'streamable-http'
      if (transportType !== 'streamable-http' && transportType !== 'sse')
        fail(`${at}.transportType`, 'must be streamable-http or sse')
      servers[name] = {
        ...common,
        type: 'http',
        url: value.url,
        headers: value.headers ? stringMap(`${at}.headers`, value.headers) : {},
        transportType,
      }
    }
  }
  const searchTopK = input.searchTopK ?? 20
  int('searchTopK', searchTopK, 1, 500)
  const processPoolSize = input.processPoolSize ?? 8
  int('processPoolSize', processPoolSize, 1, 64)
  const timeoutSeconds = input.timeoutSeconds ?? 30
  num('timeoutSeconds', timeoutSeconds, 1, 600)
  const idleTimeoutMs = input.idleTimeoutMs ?? 300000
  int('idleTimeoutMs', idleTimeoutMs, 0, 3600000)
  const cacheToolMetadata = input.cacheToolMetadata ?? true
  bool('cacheToolMetadata', cacheToolMetadata)
  return Object.freeze({
    mcpServers: servers,
    searchTopK,
    cacheToolMetadata,
    processPoolSize,
    timeoutSeconds,
    idleTimeoutMs,
  })
}
export function loadConfig(options: {
  config?: unknown
  servers?: unknown
  env?: Record<string, string | undefined>
  cwd?: string
  logger: { info: (message: string) => void; warn: (message: string) => void }
}): Config | null {
  const env = options.env ?? (process.env as Record<string, string | undefined>),
    cwd = options.cwd ?? '.',
    configured =
      typeof options.config === 'string' && options.config.trim() ? options.config : env.MCP_AGGREGATOR_CONFIG
  let raw: unknown
  if (options.servers !== undefined) raw = { mcpServers: options.servers }
  else if (plain(options.config)) raw = options.config
  else {
    const file = configured || path.join(cwd, 'mcp-aggregator.json')
    let stat: any
    try {
      stat = (fs as any).statSync(file)
    } catch {
      options.logger.info(`toolbox disabled: config file not found: ${file}`)
      return null
    }
    if (!stat.isFile()) fail('config', `config file is not a regular file: ${file}`)
    if ((stat.mode & 4) !== 0) options.logger.warn(`config file ${file} is world-readable`)
    try {
      raw = JSON.parse((fs as any).readFileSync(file, 'utf8'))
    } catch (error) {
      fail('config', `failed to parse ${file}: ${String(error)}`)
    }
  }
  const result = normalize(substituteEnv(raw, env))
  if (!Object.values(result.mcpServers).some((server) => !server.disabled))
    options.logger.warn('no enabled upstream servers configured')
  return result
}
