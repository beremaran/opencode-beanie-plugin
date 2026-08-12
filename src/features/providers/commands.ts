import { fetchModels } from './models.js'
import { loadStore, saveStore } from './store.js'
import type { Logger, ProviderSource } from './types.js'

const ID_PATTERN = /^[A-Za-z0-9._-]+$/
const USAGE =
  'Usage: /add-provider <id> <baseURL> [apiKey] [--name "Display Name"] [--context N] [--output N] [--no-fetch]'
type ParseResult = { ok: true; source: ProviderSource } | { ok: false; error: string }
function tokenize(raw: string): string[] {
  const tokens: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g
  for (let match = re.exec(raw); match !== null; match = re.exec(raw))
    tokens.push(match[1] !== undefined ? match[1].replace(/\\(.)/g, '$1') : (match[2] as string))
  return tokens
}
export function parseAddProviderArgs(raw: string): ParseResult {
  const tokens = tokenize(raw.trim())
  if (tokens.length < 2) return { ok: false, error: `Missing id or baseURL.\n${USAGE}` }
  const id = tokens[0] as string
  if (!ID_PATTERN.test(id)) return { ok: false, error: `Provider id must match ${ID_PATTERN} (got "${id}").` }
  const baseURL = tokens[1] as string
  if (!/^https?:\/\//.test(baseURL))
    return { ok: false, error: `baseURL must start with http:// or https:// (got "${baseURL}").` }
  const source: ProviderSource = { id, baseURL }
  let i = 2
  if (tokens[i] && !tokens[i].startsWith('--')) {
    source.apiKey = tokens[i]
    i += 1
  }
  const limit: { context?: number; output?: number } = {}
  for (; i < tokens.length; i += 1) {
    const flag = tokens[i]
    if (flag === '--name') {
      if (tokens[i + 1] === undefined) return { ok: false, error: `--name requires a value.\n${USAGE}` }
      source.name = tokens[++i]
    } else if (flag === '--context' || flag === '--output') {
      const value = Number(tokens[++i])
      if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, error: `${flag} must be a positive integer.` }
      limit[flag.slice(2) as 'context' | 'output'] = value
    } else if (flag === '--no-fetch') source.fetchModels = false
    else return { ok: false, error: `Unknown option: ${flag}\n${USAGE}` }
  }
  if (Object.keys(limit).length) source.defaultLimit = limit
  return { ok: true, source }
}
export function addProviderCommand(args: string, storePath: string, logger: Logger): string {
  const parsed = parseAddProviderArgs(args)
  if (!parsed.ok) return parsed.error
  const { providers } = loadStore(storePath, logger)
  saveStore(
    storePath,
    { version: 1, providers: [...providers.filter((p) => p.id !== parsed.source.id), parsed.source] },
    logger,
  )
  return [
    `Added provider "${parsed.source.id}"${parsed.source.fetchModels === false ? ' (static models only)' : ''}: ${parsed.source.baseURL}`,
    `Store: ${storePath}`,
    'Restart opencode for changes to take effect.',
  ].join('\n')
}
export async function providersCommand(storePath: string, logger: Logger): Promise<string> {
  const { providers } = loadStore(storePath, logger)
  if (!providers.length) return 'No OpenAI-compatible providers configured yet. Use /add-provider to add one.'
  const rows = await Promise.all(
    providers.map(async (provider, i) => {
      const head = `${i + 1}. ${provider.id}${provider.name ? ` (${provider.name})` : ''} — ${provider.baseURL}`
      if (provider.fetchModels === false)
        return `${head} — fetch: off — models: ${Object.keys(provider.staticModels ?? {}).length} (static)`
      const models = await fetchModels({ ...provider, fetchModels: true, timeoutMs: 3_000 }, logger)
      return `${head} — fetch: on — models: ${models === null ? 'error' : models.length}`
    }),
  )
  return [
    'Configured OpenAI-compatible providers:',
    ...rows,
    '',
    `Store: ${storePath}`,
    'Restart opencode for changes to take effect.',
  ].join('\n')
}
