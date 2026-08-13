import { applyOptionsToFile } from '../configurator/opencode-file.js'
import { fetchModels } from './models.js'
import type { DiscoveredModel, Logger, ProviderSource, ResolvedProvider } from './types.js'

const ID_PATTERN = /^[A-Za-z0-9._-]+$/
const BASE_URL_PATTERN = /^https?:\/\//
const KINDS = new Set(['auto', 'openai', 'ollama', 'unsloth', 'lmstudio'])
const USAGE =
  'Usage: /add-provider <id> <baseURL> [apiKey] [--name "Display Name"] [--kind auto|openai|ollama|unsloth|lmstudio] [--context N] [--output N] [--no-fetch]'
type ParseResult = { ok: true; source: ProviderSource } | { ok: false; error: string }
const modelCountLabel = (models: DiscoveredModel[] | null): string => {
  if (models === null) {
    return 'error'
  }
  return String(models.length)
}
function tokenize(raw: string): string[] {
  const tokens: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g
  for (let match = re.exec(raw); match !== null; match = re.exec(raw)) {
    if (match[1] === undefined) {
      tokens.push(match[2] as string)
    } else {
      tokens.push(match[1].replace(/\\(.)/g, '$1'))
    }
  }
  return tokens
}
interface FlagStep {
  i: number
  error?: string
}
function applyFlag(
  source: ProviderSource,
  limit: { context?: number; output?: number },
  args: { flag: string; tokens: string[]; i: number },
): FlagStep {
  const { flag, tokens, i } = args
  if (flag === '--name') {
    const value = tokens[i + 1]
    if (value === undefined) {
      return { i, error: `--name requires a value.\n${USAGE}` }
    }
    source.name = value
    return { i: i + 1 }
  }
  if (flag === '--context' || flag === '--output') {
    const value = Number(tokens[i + 1])
    if (!Number.isSafeInteger(value) || value <= 0) {
      return { i, error: `${flag} must be a positive integer.` }
    }
    limit[flag.slice(2) as 'context' | 'output'] = value
    return { i: i + 1 }
  }
  if (flag === '--kind') {
    const kind = tokens[i + 1]
    if (!KINDS.has(kind)) {
      return { i, error: `--kind must be one of: ${[...KINDS].join(', ')}.\n${USAGE}` }
    }
    source.kind = kind as ProviderSource['kind']
    return { i: i + 1 }
  }
  if (flag === '--no-fetch') {
    source.fetchModels = false
    return { i }
  }
  return { i, error: `Unknown option: ${flag}\n${USAGE}` }
}
function parseAddProviderArgs(raw: string): ParseResult {
  const tokens = tokenize(raw.trim())
  if (tokens.length < 2) {
    return { ok: false, error: `Missing id or baseURL.\n${USAGE}` }
  }
  const id = tokens[0] as string
  if (!ID_PATTERN.test(id)) {
    return { ok: false, error: `Provider id must match ${ID_PATTERN} (got "${id}").` }
  }
  const baseUrl = tokens[1] as string
  if (!BASE_URL_PATTERN.test(baseUrl)) {
    return { ok: false, error: `baseURL must start with http:// or https:// (got "${baseUrl}").` }
  }
  // biome-ignore lint/style/useNamingConvention: baseURL is the provider-config field name used in opencode.json.
  const source: ProviderSource = { id, baseURL: baseUrl }
  let i = 2
  if (tokens[i] && !tokens[i].startsWith('--')) {
    source.apiKey = tokens[i]
    i += 1
  }
  const limit: { context?: number; output?: number } = {}
  for (; i < tokens.length; i += 1) {
    const { i: next, error } = applyFlag(source, limit, { flag: tokens[i] as string, tokens, i })
    if (error) {
      return { ok: false, error }
    }
    i = next
  }
  if (Object.keys(limit).length > 0) {
    source.defaultLimit = limit
  }
  return { ok: true, source }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
function addProviderCommand(
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
  let feature: Record<string, unknown>
  if (isRecord(options.providers)) {
    feature = { ...options.providers }
  } else {
    feature = {}
  }
  let list: unknown[]
  if (Array.isArray(feature.providers)) {
    list = [...feature.providers]
  } else {
    list = []
  }
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
    let reason: string
    if (error instanceof Error) {
      reason = error.message
    } else {
      reason = String(error)
    }
    return `Failed to write the provider into opencode.json: ${reason}`
  }
  let staticNote = ''
  if (parsed.source.fetchModels === false) {
    staticNote = ' (static models only)'
  }
  return [
    `Added provider "${parsed.source.id}"${staticNote}: ${parsed.source.baseURL}`,
    `Written to: ${result.path}`,
    'Restart opencode for changes to take effect.',
  ].join('\n')
}
async function providersCommand(sources: ResolvedProvider[], logger: Logger): Promise<string> {
  if (sources.length === 0) {
    return 'No OpenAI-compatible providers configured. Add them via the providers.providers plugin option or run /add-provider.'
  }
  const rows = await Promise.all(
    sources.map(async (provider, i) => {
      let namePart = ''
      if (provider.name) {
        namePart = ` (${provider.name})`
      }
      const head = `${i + 1}. ${provider.id}${namePart} — ${provider.baseURL}`
      if (provider.fetchModels === false) {
        return `${head} — fetch: off — models: ${Object.keys(provider.staticModels ?? {}).length} (static)`
      }
      const models = await fetchModels(provider, logger)
      return `${head} — fetch: on — models: ${modelCountLabel(models)}`
    }),
  )
  return ['Configured OpenAI-compatible providers:', ...rows, '', 'Restart opencode for changes to take effect.'].join(
    '\n',
  )
}

export { addProviderCommand, parseAddProviderArgs, providersCommand }
