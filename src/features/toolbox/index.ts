import type { Plugin } from '@opencode-ai/plugin'
import { loadConfig } from './config.js'
import { ConnectionManager } from './connection.js'
import { createLogger } from './logger.js'
import { ToolRegistry, UpstreamRegistry } from './registry.js'
import { createTools } from './tools.js'

// biome-ignore lint/suspicious/useAwait: The Plugin type requires Promise<Hooks>, so the async modifier is needed even though no await occurs at this level.
const Toolbox: Plugin = async (input, options) => {
  const logger = createLogger(input.client)
  const config = loadConfig({ config: options?.config, servers: options?.servers, logger })
  if (!config) {
    return { tool: {} }
  }
  const upstream = new UpstreamRegistry(config)
  const registry = new ToolRegistry(upstream)
  const connection = new ConnectionManager(config, registry, logger)
  return {
    tool: createTools(registry, connection, config, logger),
    dispose: async () => {
      await connection.closeAll()
      connection.forceKillStale()
    },
  }
}

export default Toolbox
