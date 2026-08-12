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
export function parseModelResponse(text: string): DiscoveredModel[] | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(json)) {
    return null
  }
  const items = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : undefined
  if (items) {
    return items
      .flatMap((x) =>
        isRecord(x) && typeof x.id === 'string'
          ? [
              {
                id: x.id.trim(),
                ...(typeof x.name === 'string' ? { name: x.name } : {}),
                vendor: x,
                ...(() => {
                  const l = detectLimit(x)
                  return l.context && l.output ? { limit: { context: l.context, output: l.output } } : {}
                })(),
              },
            ]
          : [],
      )
      .slice(0, MAX)
  }
  return Object.entries(json)
    .map(([id, x]) => {
      const item = isRecord(x) ? x : {}
      const l = detectLimit(item)
      return {
        id,
        vendor: isRecord(x) ? x : undefined,
        ...(typeof item.name === 'string' ? { name: item.name } : {}),
        ...(l.context && l.output ? { limit: { context: l.context, output: l.output } } : {}),
      }
    })
    .slice(0, MAX)
}
export async function fetchModels(source: ResolvedProvider, logger: Logger): Promise<DiscoveredModel[] | null> {
  const url = source.modelsURL ?? `${source.baseURL.replace(/\/+$/, '')}/models`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), source.timeoutMs)
  try {
    const headers = {
      Accept: 'application/json',
      ...(source.headers ?? {}),
      ...(source.apiKey ? { Authorization: `Bearer ${source.apiKey}` } : {}),
    }
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      logger('warn', `Model fetch for provider "${source.id}" returned HTTP ${response.status} from "${url}"`)
      return null
    }
    const models = parseModelResponse(await response.text())
    if (!models) {
      logger('warn', `Could not parse model list from "${url}" for provider "${source.id}"`)
    }
    return models
  } catch (error) {
    logger('warn', `Failed to fetch models from "${url}" for provider "${source.id}": ${String(error)}`)
    return null
  } finally {
    clearTimeout(timer)
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
        (source.include === null || source.include.length === 0 || source.include.some((p) => globMatch(p, id))) &&
        !source.exclude?.some((p) => globMatch(p, id)),
    )
    .slice(0, MAX)
  return Object.fromEntries(
    ids.map((id) => {
      const s = staticModels[id]
      const d = discovered.get(id)
      const detected = d?.limit ?? detectLimit(d?.vendor ?? {})
      const context = detected.context ?? source.defaultLimit?.context
      const output = detected.output ?? source.defaultLimit?.output
      const base: Record<string, unknown> = {
        temperature: s?.temperature ?? true,
        tool_call: s?.tool_call ?? true,
        ...((s?.name ?? d?.name) && (s?.name ?? d?.name) !== id ? { name: s?.name ?? d?.name } : {}),
        ...(context && output ? { limit: { context, output } } : {}),
        ...(s?.reasoning === undefined ? {} : { reasoning: s.reasoning }),
        ...(s?.attachment === undefined ? {} : { attachment: s.attachment }),
        ...(s?.options ? { options: s.options } : {}),
        ...(s?.headers ? { headers: s.headers } : {}),
      }
      const o = source.overrides?.[id]
      const overrideLimit = o?.limit
        ? { context: o.limit.context ?? context, output: o.limit.output ?? output }
        : undefined
      return [
        id,
        o
          ? deep(base, { ...o, ...(overrideLimit?.context && overrideLimit.output ? { limit: overrideLimit } : {}) })
          : base,
      ]
    }),
  )
}
