import type { Config, Plugin } from '@opencode-ai/plugin'
import { isPluginEntryName } from '../configurator/opencode-file.js'
import { addProviderCommand, providersCommand } from './commands.js'
import { createLogger } from './log.js'
import { buildModelEntries, fetchModels } from './models.js'
import type { NormalizedOptions } from './options.js'
import { normalizeOptions } from './options.js'
import type { DiscoveredModel, Logger, ResolvedProvider } from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
function replaceTextPart(parts: Array<{ type: string; text?: string }>, text: string): void {
  const part = parts.find((candidate) => candidate.type === 'text')
  if (part) {
    part.text = text
  } else {
    parts.push({ type: 'text', text })
  }
}
function pluginEntryOptions(config: Config): Record<string, unknown> {
  for (const entry of config.plugin ?? []) {
    if (Array.isArray(entry) && isPluginEntryName(entry[0])) {
      if (isRecord(entry[1])) {
        return entry[1]
      }
      return {}
    }
  }
  return {}
}
interface ProviderResult {
  source: ResolvedProvider
  fetched: DiscoveredModel[] | null
}
function configureProvider(
  providers: Record<string, Record<string, unknown>>,
  result: ProviderResult,
  logger: Logger,
): void {
  const { source, fetched } = result
  const models = buildModelEntries(fetched, source)
  if (Object.keys(models).length === 0) {
    logger('error', `Skipping provider "${source.id}": no models could be determined`, { provider: source.id })
    return
  }
  let existing: Record<string, unknown>
  if (isRecord(providers[source.id])) {
    existing = providers[source.id]
  } else {
    existing = {}
  }
  let userModels: Record<string, unknown>
  if (isRecord(existing.models)) {
    userModels = existing.models
  } else {
    userModels = {}
  }
  const existingNpm = existing.npm
  let npm: string
  if (typeof existingNpm === 'string') {
    npm = existingNpm
  } else {
    npm = source.npm ?? '@ai-sdk/openai-compatible'
  }
  const options: Record<string, unknown> = {}
  options.baseURL = source.baseURL
  if (source.apiKey) {
    options.apiKey = source.apiKey
  }
  if (source.headers) {
    options.headers = source.headers
  }
  if (isRecord(existing.options)) {
    Object.assign(options, existing.options)
  }
  const entry: Record<string, unknown> = {
    ...existing,
    npm,
    options,
    models: { ...userModels, ...models },
  }
  if (typeof existing.name === 'string') {
    entry.name = existing.name
  } else if (source.name) {
    entry.name = source.name
  }
  providers[source.id] = entry
}
async function applyConfig(
  cfg: Config,
  fullOptions: Record<string, unknown>,
  options: NormalizedOptions,
  logger: Logger,
): Promise<void> {
  Object.assign(fullOptions, pluginEntryOptions(cfg))
  cfg.provider ??= {}
  cfg.command ??= {}
  cfg.command['add-provider'] = {
    description: 'Add or update an OpenAI-compatible provider (baseURL, optional apiKey) and auto-configure its models',
    template: '<add-provider-command>$ARGUMENTS</add-provider-command>',
  }
  cfg.command.providers = {
    description: 'List configured OpenAI-compatible providers with live model counts',
    template: '<providers-command>$ARGUMENTS</providers-command>',
  }
  const providers = cfg.provider as Record<string, Record<string, unknown>>
  const results = await Promise.allSettled(
    options.sources.map(async (source) => {
      let fetched: DiscoveredModel[] | null = null
      if (source.fetchModels) {
        fetched = await fetchModels(source, logger)
      }
      return { source, fetched }
    }),
  )
  for (const result of results) {
    if (result.status === 'fulfilled') {
      configureProvider(providers, result.value, logger)
    } else {
      logger('error', `Failed to configure provider: ${String(result.reason)}`, { reason: result.reason })
    }
  }
  if (options.model) {
    cfg.model = options.model
  }
  if (options.smallModel) {
    cfg.small_model = options.smallModel
  }
}

// biome-ignore lint/suspicious/useAwait: The Plugin type requires Promise<Hooks>, so the async modifier is needed even though no await occurs at this level.
const Providers: Plugin = async (input, rawOptions) => {
  const logger: Logger = createLogger(input.client)
  const options = normalizeOptions(rawOptions, logger)
  const fullOptions: Record<string, unknown> = {}
  return {
    config: async (cfg: Config) => {
      try {
        await applyConfig(cfg, fullOptions, options, logger)
      } catch (error) {
        logger('error', `Unexpected error in opencode-beanie-plugin config hook: ${String(error)}`, { error })
      }
    },
    'command.execute.before': async ({ command, arguments: args }, output) => {
      try {
        if (command === 'add-provider') {
          replaceTextPart(output.parts, addProviderCommand(args, fullOptions, input.worktree, logger))
        } else if (command === 'providers') {
          replaceTextPart(output.parts, await providersCommand(options.sources, logger))
        }
      } catch (error) {
        logger('error', `Unexpected error handling "/${command}": ${String(error)}`, { command, error })
      }
    },
  }
}

export default Providers
