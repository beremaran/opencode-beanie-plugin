import type { Plugin } from '@opencode-ai/plugin'
import type { LogFn } from './config.js'
import { applyOrchestratorConfig } from './config.js'
import { PLUGIN_ID } from './constants.js'
import type { NormalizedOptions } from './options.js'
import { normalizeOptions as normalizeOrchestratorOptions } from './options.js'

const OrchestratorPlugin: Plugin = async ({ client }, options = {}) => {
  let opts: NormalizedOptions
  try {
    opts = normalizeOrchestratorOptions(options)
  } catch (error) {
    let message: string
    if (error instanceof Error) {
      ;({ message } = error)
    } else {
      message = `[${PLUGIN_ID}] Invalid plugin options.`
    }
    await client.app.log({ body: { service: PLUGIN_ID, level: 'error', message } })
    throw error
  }
  const log: LogFn = async (entry) => {
    await client.app.log(entry)
  }
  return {
    config: async (cfg) => {
      try {
        await applyOrchestratorConfig(cfg, opts, log)
      } catch (error) {
        await client.app.log({
          body: {
            service: PLUGIN_ID,
            level: 'error',
            message: `[${PLUGIN_ID}] Unexpected error in opencode-beanie-plugin config hook (this is a plugin bug; please report it)`,
            extra: { error },
          },
        })
      }
    },
  }
}

export const normalizeOptions = normalizeOrchestratorOptions
export default OrchestratorPlugin
