import { interpolate, interpolateHeaders } from './env.js'
import { validateProviderSource } from './store.js'
import type { Logger, PluginOptions, ProviderSource, ResolvedProvider } from './types.js'

const DEFAULT_TIMEOUT = 10_000
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const KINDS = new Set(['auto', 'openai', 'ollama', 'unsloth', 'lmstudio'])
const optionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return undefined
}
const positive = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value
  }
  return undefined
}
const strings = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
}
const records = (value: unknown): Record<string, Record<string, unknown>> | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const out: Record<string, Record<string, unknown>> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isRecord(entry)) {
      out[key] = entry
    }
  }
  return out
}
const sanitizeHeaders = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<string, string>
}
const sanitizeLimit = (value: unknown): { context?: number; output?: number } | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const limit: { context?: number; output?: number } = {}
  const context = positive(value.context)
  if (context !== undefined) {
    limit.context = context
  }
  const output = positive(value.output)
  if (output !== undefined) {
    limit.output = output
  }
  return limit
}
const sanitizeLists = (raw: Record<string, unknown>): { include?: string[]; exclude?: string[] } => {
  const out: { include?: string[]; exclude?: string[] } = {}
  for (const key of ['include', 'exclude'] as const) {
    const v = strings(raw[key])
    if (v && v.length > 0) {
      out[key] = v
    }
  }
  return out
}

function sanitize(value: ProviderSource): ProviderSource {
  const raw = value as unknown as Record<string, unknown>
  // biome-ignore lint/style/useNamingConvention: baseURL is the provider-config field name used in opencode.json.
  const out: ProviderSource = { id: value.id.trim(), baseURL: value.baseURL.trim() }
  for (const key of ['name', 'apiKey', 'npm', 'modelsURL'] as const) {
    const v = optionalString(raw[key])
    if (v) {
      out[key] = v
    }
  }
  if (typeof raw.kind === 'string' && KINDS.has(raw.kind)) {
    out.kind = raw.kind as ProviderSource['kind']
  }
  const headers = sanitizeHeaders(raw.headers)
  if (headers) {
    out.headers = headers
  }
  if (typeof raw.fetchModels === 'boolean') {
    out.fetchModels = raw.fetchModels
  }
  Object.assign(out, sanitizeLists(raw))
  const defaultLimit = sanitizeLimit(raw.defaultLimit)
  if (defaultLimit) {
    out.defaultLimit = defaultLimit
  }
  const overrides = records(raw.overrides)
  if (overrides) {
    out.overrides = overrides as ProviderSource['overrides']
  }
  const staticModels = records(raw.staticModels)
  if (staticModels) {
    out.staticModels = staticModels as ProviderSource['staticModels']
  }
  if (typeof raw.env === 'boolean') {
    out.env = raw.env
  }
  const timeout = positive(raw.timeout)
  if (timeout !== undefined) {
    out.timeout = timeout
  }
  return out
}

export interface NormalizedOptions {
  sources: ResolvedProvider[]
  model?: string
  smallModel?: string
}
export function normalizeOptions(raw: unknown, logger: Logger): NormalizedOptions {
  let inputRaw: Record<string, unknown>
  if (isRecord(raw)) {
    inputRaw = raw
  } else {
    inputRaw = {}
  }
  const input = inputRaw as PluginOptions
  const timeout = positive(input.timeout) ?? DEFAULT_TIMEOUT
  const byId = new Map<string, ProviderSource>()
  const skipped: string[] = []
  let providerEntries: unknown[]
  if (Array.isArray(input.providers)) {
    providerEntries = input.providers
  } else {
    providerEntries = []
  }
  for (const [i, entry] of providerEntries.entries()) {
    if (validateProviderSource(entry)) {
      byId.set(entry.id, sanitize(entry))
    } else {
      skipped.push(`options.providers[${i}]`)
    }
  }
  if (skipped.length > 0) {
    logger('warn', `Skipped ${skipped.length} malformed provider entries`, { skipped })
  }
  const globalEnv = input.env !== false
  const sources = [...byId.values()].map((source) => {
    const useEnv = globalEnv && source.env !== false
    const resolved: ResolvedProvider = {
      ...source,
      npm: source.npm ?? input.npm,
      fetchModels: source.fetchModels !== false,
      timeoutMs: source.timeout ?? timeout,
    }
    resolved.baseURL = interpolate(source.baseURL, useEnv)
    if (source.apiKey) {
      resolved.apiKey = interpolate(source.apiKey, useEnv)
    }
    const headers = interpolateHeaders(source.headers, useEnv)
    if (headers) {
      resolved.headers = headers
    }
    return resolved
  })
  const out: NormalizedOptions = { sources }
  const model = optionalString(input.model)
  if (model) {
    out.model = model
  }
  const smallModel = optionalString(input.smallModel)
  if (smallModel) {
    out.smallModel = smallModel
  }
  return out
}
