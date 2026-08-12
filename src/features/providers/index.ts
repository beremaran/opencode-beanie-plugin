import type { Config, Plugin } from '@opencode-ai/plugin'
import { addProviderCommand, providersCommand } from './commands.js'
import { createLogger } from './log.js'
import { buildModelEntries, fetchModels } from './models.js'
import { defaultStorePath, normalizeOptions, storePathFromRaw } from './options.js'
import { loadStore } from './store.js'
import type { Logger } from './types.js'

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

const Providers: Plugin = async (input, rawOptions) => {
  const logger: Logger = createLogger(input.client)
  const storePath = storePathFromRaw(rawOptions, defaultStorePath())
  const { providers: storedProviders } = loadStore(storePath, logger)
  const options = normalizeOptions(rawOptions, storedProviders, storePath, logger)
  return {
    config: async (cfg: Config) => {
      try {
        cfg.provider ??= {}
        cfg.command ??= {}
        cfg.command['add-provider'] = {
          description:
            'Add or update an OpenAI-compatible provider (baseURL, optional apiKey) and auto-configure its models',
          template: '<add-provider-command>$ARGUMENTS</add-provider-command>',
        }
        cfg.command.providers = {
          description: 'List configured OpenAI-compatible providers with live model counts',
          template: '<providers-command>$ARGUMENTS</providers-command>',
        }
        const results = await Promise.allSettled(
          options.sources.map(async (source) => ({
            source,
            fetched: source.fetchModels ? await fetchModels(source, logger) : null,
          })),
        )
        const providers = cfg.provider as Record<string, Record<string, unknown>>
        for (const result of results) {
          if (result.status === 'rejected') {
            logger('error', `Failed to configure provider: ${String(result.reason)}`, { reason: result.reason })
            continue
          }
          const { source, fetched } = result.value
          const models = buildModelEntries(fetched, source)
          if (Object.keys(models).length === 0) {
            logger('error', `Skipping provider "${source.id}": no models could be determined`, { provider: source.id })
            continue
          }
          const existing = isRecord(providers[source.id]) ? providers[source.id] : {}
          const userModels = isRecord(existing.models) ? existing.models : {}
          providers[source.id] = {
            ...existing,
            npm: typeof existing.npm === 'string' ? existing.npm : (source.npm ?? '@ai-sdk/openai-compatible'),
            ...(typeof existing.name === 'string' || source.name
              ? { name: typeof existing.name === 'string' ? existing.name : source.name }
              : {}),
            options: {
              baseURL: source.baseURL,
              ...(source.apiKey ? { apiKey: source.apiKey } : {}),
              ...(source.headers ? { headers: source.headers } : {}),
              ...(isRecord(existing.options) ? existing.options : {}),
            },
            models: { ...userModels, ...models },
          }
        }
        if (options.model) {
          cfg.model = options.model
        }
        if (options.smallModel) {
          cfg.small_model = options.smallModel
        }
      } catch (error) {
        logger('error', `Unexpected error in opencode-beanie-plugin config hook: ${String(error)}`, { error })
      }
    },
    'command.execute.before': async ({ command, arguments: args }, output) => {
      try {
        if (command === 'add-provider') {
          replaceTextPart(output.parts, addProviderCommand(args, options.storePath, logger))
        } else if (command === 'providers') {
          replaceTextPart(output.parts, await providersCommand(options.storePath, logger))
        }
      } catch (error) {
        logger('error', `Unexpected error handling "/${command}": ${String(error)}`, { command, error })
      }
    },
  }
}

export default Providers
