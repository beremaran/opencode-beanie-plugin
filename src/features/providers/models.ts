import type { DiscoveredModel, Logger, ResolvedProvider } from './types.js'

const MAX = 500
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const positive = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : undefined
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
export function detectLimit(item: Record<string, unknown>): { context?: number; output?: number } {
  const nested = isRecord(item.limit) ? item.limit : {}
  const first = (keys: string[]) => keys.map((k) => positive(item[k])).find((x) => x !== undefined)
  return {
    ...((first(contextKeys) ?? positive(nested.context))
      ? { context: first(contextKeys) ?? positive(nested.context) }
      : {}),
    ...((first(outputKeys) ?? positive(nested.output)) ? { output: first(outputKeys) ?? positive(nested.output) } : {}),
  }
}
const VISION_MARKERS = ['vision', 'image', 'image_input', 'vision_input', 'multimodal']
export function detectVision(item: Record<string, unknown>): boolean | undefined {
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
  const modalities = isRecord(item.modalities) ? item.modalities : {}
  if (Array.isArray(modalities.input) && modalities.input.some((m) => m === 'image')) {
    return true
  }
  if (Array.isArray(item.input_modalities) && item.input_modalities.some((m) => m === 'image')) {
    return true
  }
  return undefined
}
const FAMILY_CONTEXT: Array<[RegExp, number]> = [
  [/qwen-agentworld/, 262_144],
  [/qwen3\.6/, 262_144],
  [/qwen3\.5/, 262_144],
  [/qwen3/, 131_072],
  [/qwen2\.5/, 131_072],
  [/qwen2\b/, 32_768],
  [/qwen/, 32_768],
  [/deepseek/, 131_072],
  [/llama-?4\b/, 131_072],
  [/(?:llama[- ]?3)\.(?:[123])(?:\.|$|-)/, 131_072],
  [/llama-?3\b/, 8192],
  [/mistral-(?:large|small|medium)/, 131_072],
  [/mistral|mixtral|codestral|mathstral|devstral/, 32_768],
  [/gemma-?3\b/, 131_072],
  [/gemma/, 8192],
  [/phi-?4\b/, 16_384],
  [/phi-?3\b/, 131_072],
  [/glm-4\.6/, 200_000],
  [/glm/, 131_072],
  [/kimi-k2/, 262_144],
  [/kimi|moonshot/, 131_072],
  [/command-r/, 131_072],
  [/gpt-4\.1/, 131_072],
  [/gpt-4o/, 131_072],
  [/gpt-4-turbo/, 131_072],
  [/gpt-3\.5/, 16_385],
  [/gpt-4\b/, 8192],
  [/claude/, 200_000],
]
export function inferContext(id: string): number | undefined {
  const lower = id.toLowerCase()
  return FAMILY_CONTEXT.find(([pattern]) => pattern.test(lower))?.[1]
}
const OUTPUT_CAP = 32_000
const CONTEXT_DEFAULT = 128_000
export function resolveLimit(context?: number, output?: number): { context: number; output: number } | undefined {
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
  return {
    id,
    ...(typeof item.name === 'string' ? { name: item.name } : {}),
    ...(vendor ? { vendor } : {}),
    ...(limit.context || limit.output ? { limit } : {}),
    ...(detectVision(item) ? { attachment: true } : {}),
  }
}
export function parseModelResponse(text: string): DiscoveredModel[] | null {
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
  const items = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : undefined
  if (items) {
    return items
      .flatMap((x) => (isRecord(x) && typeof x.id === 'string' ? [entry(x.id.trim(), x, x)] : []))
      .slice(0, MAX)
  }
  return Object.entries(json)
    .map(([id, x]) => entry(id, isRecord(x) ? x : {}, isRecord(x) ? x : undefined))
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
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(source.headers ?? {}),
        ...(source.apiKey ? { Authorization: `Bearer ${source.apiKey}` } : {}),
      },
      signal: controller.signal,
    })
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
    .flatMap((x) => (isRecord(x) && typeof x.name === 'string' ? [entry(x.name, x, x)] : []))
    .slice(0, MAX)
  return models.length > 0 ? models : null
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
      return {
        ...model,
        ...(context ? { limit: { ...model.limit, context } } : {}),
        ...(vision ? { attachment: true } : {}),
      }
    }),
  )
  return listed.map((model, i) =>
    results[i]?.status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<DiscoveredModel>).value : model,
  )
}
async function fetchLmStudioModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  const url = `${apiRoot(source)}/api/v0/models`
  const models = parseModelJson(await getJson(source, url, logger))
  if (!models) {
    logger('warn', `Could not parse model list from "${url}" for provider "${source.id}"`)
    return null
  }
  const chat = models.filter((model) => model.vendor?.type !== 'embeddings')
  return chat.length > 0 ? chat : models
}
export function fetchModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
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
export function globMatch(pattern: string, value: string): boolean {
  return new RegExp(
    `^${pattern
      .split('*')
      .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  ).test(value)
}
const deep = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries({ ...a, ...b }).map(([k, v]) => [
      k,
      isRecord(v) && isRecord(a[k]) ? deep(a[k] as Record<string, unknown>, v) : v,
    ]),
  )
export function buildModelEntries(models: DiscoveredModel[] | null, source: ResolvedProvider): Record<string, object> {
  const staticModels = source.staticModels ?? {}
  const discovered = new Map((models ?? []).map((m) => [m.id, m]))
  const ids = [...discovered.keys(), ...Object.keys(staticModels).filter((id) => !discovered.has(id))]
    .filter(
      (id) =>
        (!source.include || source.include.length === 0 || source.include.some((p) => globMatch(p, id))) &&
        !source.exclude?.some((p) => globMatch(p, id)),
    )
    .slice(0, MAX)
  return Object.fromEntries(
    ids.map((id) => {
      const s = staticModels[id]
      const d = discovered.get(id)
      const detected = d?.limit ?? detectLimit(d?.vendor ?? {})
      const context = detected.context ?? source.defaultLimit?.context ?? inferContext(id)
      const output = detected.output ?? source.defaultLimit?.output
      const limit = resolveLimit(context, output)
      const o = source.overrides?.[id]
      const attachment = o?.attachment ?? s?.attachment ?? d?.attachment
      const overrideLimit = o?.limit
        ? { context: o.limit.context ?? context, output: o.limit.output ?? output }
        : undefined
      const base: Record<string, unknown> = {
        temperature: s?.temperature ?? true,
        tool_call: s?.tool_call ?? true,
        ...((s?.name ?? d?.name) && (s?.name ?? d?.name) !== id ? { name: s?.name ?? d?.name } : {}),
        ...(limit ? { limit } : {}),
        ...(attachment === undefined ? {} : { attachment }),
        ...(attachment === true ? { modalities: { input: ['text', 'image'] } } : {}),
        ...(s?.modalities ? { modalities: s.modalities } : {}),
        ...(s?.reasoning === undefined ? {} : { reasoning: s.reasoning }),
        ...(s?.options ? { options: s.options } : {}),
        ...(s?.headers ? { headers: s.headers } : {}),
      }
      return [
        id,
        o
          ? deep(base, {
              ...o,
              ...(overrideLimit ? { limit: resolveLimit(overrideLimit.context, overrideLimit.output) } : {}),
            })
          : base,
      ]
    }),
  )
}
