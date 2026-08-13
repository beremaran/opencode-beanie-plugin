// biome-ignore lint/style/noExcessiveLinesPerFile: this module is the cohesive model-discovery core for the providers feature; splitting it would fragment tightly-coupled parsing/build logic across files.
import type { DiscoveredModel, Logger, ModelOverride, ResolvedProvider } from './types.js'

const MAX = 500
const CTX_8K = 8192
const CTX_16K = 16_384
const CTX_16_385 = 16_385
const CTX_32K = 32_768
const CTX_131K = 131_072
const CTX_200K = 200_000
const CTX_262K = 262_144
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const record = (v: unknown): Record<string, unknown> | undefined => {
  if (isRecord(v)) {
    return v
  }
  return undefined
}
const positive = (v: unknown): number | undefined => {
  let n: unknown = v
  if (typeof v === 'string') {
    n = Number(v)
  }
  if (typeof n === 'number' && Number.isSafeInteger(n) && n > 0) {
    return n
  }
  return undefined
}
const contextKeys = [
  'context_length',
  'max_context_length',
  'max_context',
  'context_window',
  'contextWindow',
  'ctx_len',
  'n_ctx',
  'context_size',
  'input_token_limit',
  'max_input_tokens',
  'max_input',
]
const outputKeys = ['max_output_tokens', 'output_token_limit', 'max_tokens', 'max_output']
function detectLimit(item: Record<string, unknown>): { context?: number; output?: number } {
  const nested = record(item.limit) ?? {}
  const first = (keys: string[]) => keys.map((k) => positive(item[k])).find((x) => x !== undefined)
  const out: { context?: number; output?: number } = {}
  const context = first(contextKeys) ?? positive(nested.context)
  if (context !== undefined) {
    out.context = context
  }
  const output = first(outputKeys) ?? positive(nested.output)
  if (output !== undefined) {
    out.output = output
  }
  return out
}
const VISION_MARKERS = ['vision', 'image', 'image_input', 'vision_input', 'multimodal']
function detectVision(item: Record<string, unknown>): boolean | undefined {
  if (typeof item.has_vision === 'boolean') {
    return item.has_vision
  }
  if (typeof item.vision === 'boolean') {
    return item.vision
  }
  if (typeof item.multimodal === 'boolean') {
    return item.multimodal
  }
  if (item.type === 'vlm') {
    return true
  }
  if (
    Array.isArray(item.capabilities) &&
    item.capabilities.some((c) => typeof c === 'string' && VISION_MARKERS.includes(c.toLowerCase()))
  ) {
    return true
  }
  const modalities = record(item.modalities) ?? {}
  if (Array.isArray(modalities.input) && modalities.input.some((m) => m === 'image')) {
    return true
  }
  if (Array.isArray(item.input_modalities) && item.input_modalities.some((m) => m === 'image')) {
    return true
  }
  return undefined
}
const FAMILY_CONTEXT: [RegExp, number][] = [
  [/qwen-agentworld/, CTX_262K],
  [/qwen3\.6/, CTX_262K],
  [/qwen3\.5/, CTX_262K],
  [/qwen3/, CTX_131K],
  [/qwen2\.5/, CTX_131K],
  [/qwen2\b/, CTX_32K],
  [/qwen/, CTX_32K],
  [/deepseek/, CTX_131K],
  [/llama-?4\b/, CTX_131K],
  [/(?:llama[- ]?3)\.(?:[123])(?:\.|$|-)/, CTX_131K],
  [/llama-?3\b/, CTX_8K],
  [/mistral-(?:large|small|medium)/, CTX_131K],
  [/mistral|mixtral|codestral|mathstral|devstral/, CTX_32K],
  [/gemma-?3\b/, CTX_131K],
  [/gemma/, CTX_8K],
  [/phi-?4\b/, CTX_16K],
  [/phi-?3\b/, CTX_131K],
  [/glm-4\.6/, CTX_200K],
  [/glm/, CTX_131K],
  [/kimi-k2/, CTX_262K],
  [/kimi|moonshot/, CTX_131K],
  [/command-r/, CTX_131K],
  [/gpt-4\.1/, CTX_131K],
  [/gpt-4o/, CTX_131K],
  [/gpt-4-turbo/, CTX_131K],
  [/gpt-3\.5/, CTX_16_385],
  [/gpt-4\b/, CTX_8K],
  [/claude/, CTX_200K],
]
function inferContext(id: string): number | undefined {
  const lower = id.toLowerCase()
  return FAMILY_CONTEXT.find(([pattern]) => pattern.test(lower))?.[1]
}
const OUTPUT_CAP = 32_000
const CONTEXT_DEFAULT = 128_000
function resolveLimit(context?: number, output?: number): { context: number; output: number } | undefined {
  if (context === undefined && output === undefined) {
    return undefined
  }
  return {
    context: context ?? CONTEXT_DEFAULT,
    output: output ?? Math.min(OUTPUT_CAP, Math.floor((context ?? CONTEXT_DEFAULT) / 2)),
  }
}
const entry = (
  id: string,
  item: Record<string, unknown>,
  vendor: Record<string, unknown> | undefined,
): DiscoveredModel => {
  const limit = detectLimit(item)
  const out: DiscoveredModel = { id }
  if (typeof item.name === 'string') {
    out.name = item.name
  }
  if (vendor) {
    out.vendor = vendor
  }
  if (limit.context || limit.output) {
    out.limit = limit
  }
  if (detectVision(item)) {
    out.attachment = true
  }
  return out
}
function parseModelResponse(text: string): DiscoveredModel[] | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  return parseModelJson(json)
}
function parseModelJson(json: unknown): DiscoveredModel[] | null {
  if (!isRecord(json)) {
    return null
  }
  let items: unknown[] | undefined
  if (Array.isArray(json.data)) {
    items = json.data
  } else if (Array.isArray(json.models)) {
    items = json.models
  }
  if (items) {
    return items
      .flatMap((x) => {
        if (isRecord(x) && typeof x.id === 'string') {
          return [entry(x.id.trim(), x, x)]
        }
        return []
      })
      .slice(0, MAX)
  }
  return Object.entries(json)
    .map(([id, x]) => entry(id, record(x) ?? {}, record(x)))
    .slice(0, MAX)
}
const TRAILING_SLASH = /\/+$/
const TRAILING_V1 = /\/v1\/?$/i
const apiRoot = (source: ResolvedProvider): string =>
  source.baseURL.replace(TRAILING_SLASH, '').replace(TRAILING_V1, '')
async function getJson(source: ResolvedProvider, url: string, logger: Logger): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), source.timeoutMs)
  try {
    const headers: Record<string, string> = { ...(source.headers ?? {}) }
    headers.Accept = 'application/json'
    if (source.apiKey) {
      headers.Authorization = `Bearer ${source.apiKey}`
    }
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      logger('warn', `Model fetch for provider "${source.id}" returned HTTP ${response.status} from "${url}"`)
      return null
    }
    return await response.json()
  } catch (error) {
    logger('warn', `Failed to fetch models from "${url}" for provider "${source.id}": ${String(error)}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}
async function fetchOpenaiModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  const url = source.modelsURL ?? `${source.baseURL.replace(TRAILING_SLASH, '')}/models`
  const models = parseModelJson(await getJson(source, url, logger))
  if (!models) {
    logger('warn', `Could not parse model list from "${url}" for provider "${source.id}"`)
  }
  return models
}
async function fetchOllamaModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  const url = `${apiRoot(source)}/api/tags`
  const json = await getJson(source, url, logger)
  if (!(isRecord(json) && Array.isArray(json.models))) {
    return null
  }
  const models = json.models
    .flatMap((x) => {
      if (isRecord(x) && typeof x.name === 'string') {
        return [entry(x.name, x, x)]
      }
      return []
    })
    .slice(0, MAX)
  if (models.length > 0) {
    return models
  }
  return null
}
const UNSULOTH_ENRICH = 50
async function fetchUnslothModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  const root = apiRoot(source)
  const listed = await fetchOpenaiModels(source, logger)
  if (!listed) {
    return null
  }
  const results = await Promise.allSettled(
    listed.slice(0, UNSULOTH_ENRICH).map(async (model) => {
      const url = `${root}/api/models/gguf-variants?repo_id=${encodeURIComponent(model.id)}`
      const json = await getJson(source, url, logger)
      if (!isRecord(json)) {
        return model
      }
      const context = positive(json.context_length)
      const vision = json.has_vision === true
      if (!(context || vision)) {
        return model
      }
      const enriched: DiscoveredModel = { ...model }
      if (context) {
        enriched.limit = { ...model.limit, context }
      }
      if (vision) {
        enriched.attachment = true
      }
      return enriched
    }),
  )
  return listed.map((model, i) => {
    const result = results[i]
    if (result?.status === 'fulfilled') {
      return result.value
    }
    return model
  })
}
async function fetchLmStudioModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  const url = `${apiRoot(source)}/api/v0/models`
  const models = parseModelJson(await getJson(source, url, logger))
  if (!models) {
    logger('warn', `Could not parse model list from "${url}" for provider "${source.id}"`)
    return null
  }
  const chat = models.filter((model) => model.vendor?.type !== 'embeddings')
  if (chat.length > 0) {
    return chat
  }
  return models
}
function fetchModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  switch (source.kind ?? 'auto') {
    case 'ollama':
      return fetchOllamaModels(source, logger)
    case 'unsloth':
      return fetchUnslothModels(source, logger)
    case 'lmstudio':
      return fetchLmStudioModels(source, logger)
    default:
      return fetchOpenaiModels(source, logger)
  }
}
function globMatch(pattern: string, value: string): boolean {
  return new RegExp(
    `^${pattern
      .split('*')
      .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  ).test(value)
}
const deep = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries({ ...a, ...b }).map(([k, v]) => {
      if (isRecord(v) && isRecord(a[k])) {
        return [k, deep(a[k] as Record<string, unknown>, v)]
      }
      return [k, v]
    }),
  )
const modelBase = (
  id: string,
  s: ModelOverride | undefined,
  d: DiscoveredModel | undefined,
  extras: { limit: { context: number; output: number } | undefined; attachment: boolean | undefined },
): Record<string, unknown> => {
  const { limit, attachment } = extras
  const base: Record<string, unknown> = {
    temperature: s?.temperature ?? true,
  }
  base.tool_call = s?.tool_call ?? true
  const name = s?.name ?? d?.name
  if (name && name !== id) {
    base.name = name
  }
  if (limit) {
    base.limit = limit
  }
  if (attachment !== undefined) {
    base.attachment = attachment
  }
  if (attachment === true) {
    base.modalities = { input: ['text', 'image'] }
  }
  if (s?.modalities) {
    base.modalities = s.modalities
  }
  if (s?.reasoning !== undefined) {
    base.reasoning = s.reasoning
  }
  if (s?.options) {
    base.options = s.options
  }
  if (s?.headers) {
    base.headers = s.headers
  }
  return base
}
const buildModelEntry = (
  id: string,
  s: ModelOverride | undefined,
  d: DiscoveredModel | undefined,
  source: ResolvedProvider,
): [string, object] => {
  const detected = d?.limit ?? detectLimit(record(d?.vendor) ?? {})
  const context = detected.context ?? source.defaultLimit?.context ?? inferContext(id)
  const output = detected.output ?? source.defaultLimit?.output
  const limit = resolveLimit(context, output)
  const o = source.overrides?.[id]
  const attachment = o?.attachment ?? s?.attachment ?? d?.attachment
  const base = modelBase(id, s, d, { limit, attachment })
  if (!o) {
    return [id, base]
  }
  const patch: Record<string, unknown> = { ...o }
  if (o.limit) {
    patch.limit = resolveLimit(o.limit.context ?? context, o.limit.output ?? output)
  }
  return [id, deep(base, patch)]
}
function buildModelEntries(models: DiscoveredModel[] | null, source: ResolvedProvider): Record<string, object> {
  const staticModels = source.staticModels ?? {}
  const discovered = new Map((models ?? []).map((m) => [m.id, m]))
  const ids = [...discovered.keys(), ...Object.keys(staticModels).filter((id) => !discovered.has(id))]
    .filter(
      (id) =>
        (!source.include || source.include.length === 0 || source.include.some((p) => globMatch(p, id))) &&
        !source.exclude?.some((p) => globMatch(p, id)),
    )
    .slice(0, MAX)
  return Object.fromEntries(ids.map((id) => buildModelEntry(id, staticModels[id], discovered.get(id), source)))
}

export {
  buildModelEntries,
  detectLimit,
  detectVision,
  fetchModels,
  globMatch,
  inferContext,
  parseModelResponse,
  resolveLimit,
}
