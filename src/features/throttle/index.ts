import type { Plugin } from '@opencode-ai/plugin'
import type { QueueEventInfo } from './manager.js'
import { ThrottleManager } from './manager.js'

export interface SubagentThrottleOptions {
  maxParallel?: number
  mode?: 'session' | 'global'
  maxWaitMs?: number
  notifyQueue?: boolean
}

const DEFAULT_MAX_PARALLEL = 2
const DEFAULT_MODE = 'session' as const
const DEFAULT_MAX_WAIT_MS = 3_600_000

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const describeTask = (info: QueueEventInfo): string => info.description ?? info.callID
const queuedLine = (info: QueueEventInfo): string =>
  `⏳ Task queued — position ${info.position ?? '?'} of ${info.running + info.queued} (${info.running} running${info.background ? ', background' : ''}): ${describeTask(info)}`
const startedLine = (info: QueueEventInfo): string =>
  `▶ Task started (was queued at position ${info.position ?? '?'}${info.background ? ', background' : ''}): ${describeTask(info)}`

const Throttle: Plugin = async ({ client }, options = {}) => {
  const warn = (message: string): void => {
    try {
      const result = client.app.log({
        body: { service: 'opencode-beanie-plugin', level: 'warn', message },
      })
      void Promise.resolve(result).catch(() => undefined)
    } catch {
      try {
        console.warn(message)
      } catch {}
    }
  }

  const maxParallel =
    typeof options.maxParallel === 'number' && Number.isInteger(options.maxParallel) && options.maxParallel > 0
      ? options.maxParallel
      : (() => {
          if (options.maxParallel !== undefined) {
            warn('Invalid maxParallel; falling back to 2.')
          }
          return DEFAULT_MAX_PARALLEL
        })()
  const mode =
    options.mode === 'session' || options.mode === 'global'
      ? options.mode
      : (() => {
          if (options.mode !== undefined) {
            warn('Invalid mode; falling back to session.')
          }
          return DEFAULT_MODE
        })()
  const maxWaitMs =
    typeof options.maxWaitMs === 'number' && options.maxWaitMs > 0
      ? options.maxWaitMs
      : (() => {
          if (options.maxWaitMs !== undefined) {
            warn('Invalid maxWaitMs; falling back to 3600000.')
          }
          return DEFAULT_MAX_WAIT_MS
        })()
  const notifyQueue = options.notifyQueue === true
  if (options.notifyQueue !== undefined && typeof options.notifyQueue !== 'boolean') {
    warn('Invalid notifyQueue; falling back to false.')
  }

  const notify = (sessionId: string, text: string): void => {
    try {
      const result = client.session.prompt({
        path: { id: sessionId },
        body: { noReply: true, parts: [{ type: 'text', text, ignored: true }] },
      })
      void Promise.resolve(result).catch(() => undefined)
    } catch {}
  }

  const manager = new ThrottleManager({
    maxParallel,
    mode,
    maxWaitMs,
    onWarn: warn,
    onQueued: notifyQueue ? (info) => notify(info.sessionID, queuedLine(info)) : undefined,
    onStarted: notifyQueue ? (info) => notify(info.sessionID, startedLine(info)) : undefined,
  })

  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'task') {
        return
      }
      const description = typeof output.args?.description === 'string' ? output.args.description : undefined
      await manager.startTask(input.sessionID, input.callID, output.args?.background === true, description)
    },
    'tool.execute.after': async (input, output) => {
      if (input.tool !== 'task') {
        return
      }
      let childSessionId: string | undefined
      const metadata = isRecord(output.metadata) ? output.metadata : undefined
      if (typeof metadata?.sessionId === 'string' && metadata.sessionId.length > 0) {
        childSessionId = metadata.sessionId
      } else {
        childSessionId = /<task id="([^"]+)"/.exec(output.output)?.[1]
      }
      manager.endTask(input.sessionID, input.callID, childSessionId)
    },
    event: async ({ event }) => {
      const legacyEvent = event as unknown as { type: string; properties?: unknown }
      const properties = isRecord(legacyEvent.properties) ? legacyEvent.properties : undefined
      if (legacyEvent.type === 'session.idle') {
        if (typeof properties?.sessionID === 'string') {
          manager.onSessionIdle(properties.sessionID)
        }
        return
      }
      if (legacyEvent.type === 'message.part.updated') {
        const part = properties?.part
        if (
          isRecord(part) &&
          part.type === 'tool' &&
          part.tool === 'task' &&
          isRecord(part.state) &&
          part.state.status === 'error' &&
          typeof properties?.sessionID === 'string' &&
          typeof part.callID === 'string'
        ) {
          manager.onToolError(properties.sessionID, part.callID)
        }
      }
    },
    dispose: async () => {
      manager.dispose()
    },
  }
}

export default Throttle
