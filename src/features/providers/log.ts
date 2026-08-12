import type { PluginInput } from '@opencode-ai/plugin'
import type { Logger } from './types.js'

const SERVICE = 'opencode-beanie-plugin'

export function createLogger(client: PluginInput['client']): Logger {
  const app = (client as { app?: { log?: unknown } } | undefined)?.app
  const log = app?.log
  if (typeof log !== 'function') {
    return () => undefined
  }
  return (level, message, extra) => {
    try {
      ;(log as (args: object) => Promise<unknown>)({
        body: { service: SERVICE, level, message, ...(extra === undefined ? {} : { extra }) },
      }).catch(() => undefined)
    } catch {}
  }
}
