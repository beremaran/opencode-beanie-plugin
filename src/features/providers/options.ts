import { interpolate, interpolateHeaders } from './env.js'
import { validateProviderSource } from './store.js'
import type { Logger, PluginOptions, ProviderSource, ResolvedProvider } from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const KINDS = new Set(['auto', 'openai', 'ollama', 'unsloth', 'lmstudio'])
const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined
const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
    : undefined
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

function sanitize(value: ProviderSource): ProviderSource {
  const raw = value as unknown as Record<string, unknown>
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
  if (isRecord(raw.headers)) {
    out.headers = Object.fromEntries(Object.entries(raw.headers).filter(([, v]) => typeof v === 'string')) as Record<
      string,
      string
    >
  }
  if (typeof raw.fetchModels === 'boolean') {
    out.fetchModels = raw.fetchModels
  }
  for (const key of ['include', 'exclude'] as const) {
    const v = strings(raw[key])
    if (v && v.length > 0) {
      out[key] = v
    }
  }
  if (isRecord(raw.defaultLimit)) {
    out.defaultLimit = {
      ...(positive(raw.defaultLimit.context) ? { context: positive(raw.defaultLimit.context) } : {}),
      ...(positive(raw.defaultLimit.output) ? { output: positive(raw.defaultLimit.output) } : {}),
    }
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
  if (positive(raw.timeout)) {
    out.timeout = positive(raw.timeout)
  }
  return out
}

export interface NormalizedOptions {
  sources: ResolvedProvider[]
  model?: string
  smallModel?: string
}
export function normalizeOptions(raw: unknown, logger: Logger): NormalizedOptions {
  const input = (isRecord(raw) ? raw : {}) as PluginOptions
  const timeout = positive(input.timeout) ?? 10_000
  const byId = new Map<string, ProviderSource>()
  const skipped: string[] = []
  for (const [i, entry] of (Array.isArray(input.providers) ? input.providers : []).entries()) {
    validateProviderSource(entry) ? byId.set(entry.id, sanitize(entry)) : skipped.push(`options.providers[${i}]`)
  }
  if (skipped.length > 0) {
    logger('warn', `Skipped ${skipped.length} malformed provider entries`, { skipped })
  }
  const globalEnv = input.env !== false
  const sources = [...byId.values()].map((source) => ({
    ...source,
    npm: source.npm ?? input.npm,
    baseURL: interpolate(source.baseURL, globalEnv && source.env !== false),
    ...(source.apiKey ? { apiKey: interpolate(source.apiKey, globalEnv && source.env !== false) } : {}),
    ...(interpolateHeaders(source.headers, globalEnv && source.env !== false)
      ? { headers: interpolateHeaders(source.headers, globalEnv && source.env !== false) }
      : {}),
    fetchModels: source.fetchModels !== false,
    timeoutMs: source.timeout ?? timeout,
  }))
  return {
    sources,
    ...(optionalString(input.model) ? { model: optionalString(input.model) } : {}),
    ...(optionalString(input.smallModel) ? { smallModel: optionalString(input.smallModel) } : {}),
  }
}
