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
    const body: Record<string, unknown> = { service: SERVICE, level, message }
    if (extra !== undefined) {
      body.extra = extra
    }
    try {
      ;(log as (args: object) => Promise<unknown>)({ body }).catch(() => undefined)
    } catch {
      // The host logger must never take the plugin down; swallow all errors.
    }
  }
}
