import { applyOptionsToFile } from '../configurator/opencode-file.js'
import { fetchModels } from './models.js'
import type { Logger, ProviderSource, ResolvedProvider } from './types.js'

const ID_PATTERN = /^[A-Za-z0-9._-]+$/
const KINDS = new Set(['auto', 'openai', 'ollama', 'unsloth', 'lmstudio'])
const USAGE =
  'Usage: /add-provider <id> <baseURL> [apiKey] [--name "Display Name"] [--kind auto|openai|ollama|unsloth|lmstudio] [--context N] [--output N] [--no-fetch]'
type ParseResult = { ok: true; source: ProviderSource } | { ok: false; error: string }
function tokenize(raw: string): string[] {
  const tokens: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g
  for (let match = re.exec(raw); match !== null; match = re.exec(raw)) {
    tokens.push(match[1] === undefined ? (match[2] as string) : match[1].replace(/\\(.)/g, '$1'))
  }
  return tokens
}
export function parseAddProviderArgs(raw: string): ParseResult {
  const tokens = tokenize(raw.trim())
  if (tokens.length < 2) {
    return { ok: false, error: `Missing id or baseURL.\n${USAGE}` }
  }
  const id = tokens[0] as string
  if (!ID_PATTERN.test(id)) {
    return { ok: false, error: `Provider id must match ${ID_PATTERN} (got "${id}").` }
  }
  const baseUrl = tokens[1] as string
  if (!/^https?:\/\//.test(baseUrl)) {
    return { ok: false, error: `baseURL must start with http:// or https:// (got "${baseUrl}").` }
  }
  const source: ProviderSource = { id, baseURL: baseUrl }
  let i = 2
  if (tokens[i] && !tokens[i].startsWith('--')) {
    source.apiKey = tokens[i]
    i += 1
  }
  const limit: { context?: number; output?: number } = {}
  for (; i < tokens.length; i += 1) {
    const flag = tokens[i]
    if (flag === '--name') {
      if (tokens[i + 1] === undefined) {
        return { ok: false, error: `--name requires a value.\n${USAGE}` }
      }
      source.name = tokens[++i]
    } else if (flag === '--context' || flag === '--output') {
      const value = Number(tokens[++i])
      if (!Number.isSafeInteger(value) || value <= 0) {
        return { ok: false, error: `${flag} must be a positive integer.` }
      }
      limit[flag.slice(2) as 'context' | 'output'] = value
    } else if (flag === '--kind') {
      const kind = tokens[++i]
      if (!KINDS.has(kind)) {
        return { ok: false, error: `--kind must be one of: ${[...KINDS].join(', ')}.\n${USAGE}` }
      }
      source.kind = kind as ProviderSource['kind']
    } else if (flag === '--no-fetch') {
      source.fetchModels = false
    } else {
      return { ok: false, error: `Unknown option: ${flag}\n${USAGE}` }
    }
  }
  if (Object.keys(limit).length > 0) {
    source.defaultLimit = limit
  }
  return { ok: true, source }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export function addProviderCommand(
  args: string,
  fullOptions: Record<string, unknown>,
  worktree: string,
  logger: Logger,
): string {
  const parsed = parseAddProviderArgs(args)
  if (!parsed.ok) {
    return parsed.error
  }
  const options = { ...fullOptions }
  const feature = isRecord(options.providers) ? { ...options.providers } : {}
  const list = Array.isArray(feature.providers) ? [...feature.providers] : []
  const existing = list.findIndex((entry) => isRecord(entry) && entry.id === parsed.source.id)
  if (existing === -1) {
    list.push(parsed.source)
  } else {
    list[existing] = parsed.source
  }
  feature.providers = list
  options.providers = feature
  let result: { path: string; created: boolean }
  try {
    result = applyOptionsToFile(worktree, 'auto', options)
  } catch (error) {
    logger('error', `Failed to write provider config: ${String(error)}`, { provider: parsed.source.id, error })
    return `Failed to write the provider into opencode.json: ${error instanceof Error ? error.message : String(error)}`
  }
  return [
    `Added provider "${parsed.source.id}"${parsed.source.fetchModels === false ? ' (static models only)' : ''}: ${parsed.source.baseURL}`,
    `Written to: ${result.path}`,
    'Restart opencode for changes to take effect.',
  ].join('\n')
}
export async function providersCommand(sources: ResolvedProvider[], logger: Logger): Promise<string> {
  if (sources.length === 0) {
    return 'No OpenAI-compatible providers configured. Add them via the providers.providers plugin option or run /add-provider.'
  }
  const rows = await Promise.all(
    sources.map(async (provider, i) => {
      const head = `${i + 1}. ${provider.id}${provider.name ? ` (${provider.name})` : ''} — ${provider.baseURL}`
      if (provider.fetchModels === false) {
        return `${head} — fetch: off — models: ${Object.keys(provider.staticModels ?? {}).length} (static)`
      }
      const models = await fetchModels(provider, logger)
      return `${head} — fetch: on — models: ${models === null ? 'error' : models.length}`
    }),
  )
  return ['Configured OpenAI-compatible providers:', ...rows, '', 'Restart opencode for changes to take effect.'].join(
    '\n',
  )
}
