import type { Plugin, PluginInput } from '@opencode-ai/plugin'
import type { QueueEventInfo, ThrottleManagerOptions, ThrottleMode } from './manager.js'
import { ThrottleManager } from './manager.js'

const DEFAULT_MAX_PARALLEL = 2
const DEFAULT_MODE = 'session' as const
const DEFAULT_MAX_WAIT_MS = 3_600_000
const BACKGROUND_SUFFIX = ', background'
const TASK_CALL_ID_REGEX = /<task id="([^"]+)"/

type PluginClient = PluginInput['client']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return undefined
}

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value
  }
  return undefined
}

const describeTask = (info: QueueEventInfo): string => info.description ?? info.callId

const backgroundSuffix = (background: boolean): string => {
  if (background) {
    return BACKGROUND_SUFFIX
  }
  return ''
}

const queuedLine = (info: QueueEventInfo): string =>
  `⏳ Task queued — position ${info.position ?? '?'} of ${info.running + info.queued} (${info.running} running${backgroundSuffix(info.background)}): ${describeTask(info)}`

const startedLine = (info: QueueEventInfo): string =>
  `▶ Task started (was queued at position ${info.position ?? '?'}${backgroundSuffix(info.background)}): ${describeTask(info)}`

const warn = (client: PluginClient, message: string): void => {
  try {
    const result = client.app.log({
      body: { service: 'opencode-beanie-plugin', level: 'warn', message },
    })
    void Promise.resolve(result).catch(() => undefined)
  } catch {
    // client.app.log can throw when the server is unavailable; fall back to console.warn.
    try {
      console.warn(message)
    } catch {
      // console.warn is best-effort when stderr is unavailable.
    }
  }
}

const notify = (client: PluginClient, sessionId: string, text: string): void => {
  try {
    const result = client.session.prompt({
      path: { id: sessionId },
      body: { noReply: true, parts: [{ type: 'text', text, ignored: true }] },
    })
    void Promise.resolve(result).catch(() => undefined)
  } catch {
    // session.prompt can throw for stale sessions; drop the notification.
  }
}

const normalizeMaxParallel = (client: PluginClient, value: unknown): number => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (value !== undefined) {
    warn(client, 'Invalid maxParallel; falling back to 2.')
  }
  return DEFAULT_MAX_PARALLEL
}

const normalizeMode = (client: PluginClient, value: unknown): ThrottleMode => {
  if (value === 'session' || value === 'global') {
    return value
  }
  if (value !== undefined) {
    warn(client, 'Invalid mode; falling back to session.')
  }
  return DEFAULT_MODE
}

const normalizeMaxWaitMs = (client: PluginClient, value: unknown): number => {
  if (typeof value === 'number' && value > 0) {
    return value
  }
  if (value !== undefined) {
    warn(client, 'Invalid maxWaitMs; falling back to 3600000.')
  }
  return DEFAULT_MAX_WAIT_MS
}

const normalizeNotifyQueue = (client: PluginClient, value: unknown): boolean => {
  if (value !== undefined && typeof value !== 'boolean') {
    warn(client, 'Invalid notifyQueue; falling back to false.')
  }
  return value === true
}

const normalizeOptions = (client: PluginClient, options: Record<string, unknown>) => ({
  maxParallel: normalizeMaxParallel(client, options.maxParallel),
  mode: normalizeMode(client, options.mode),
  maxWaitMs: normalizeMaxWaitMs(client, options.maxWaitMs),
  notifyQueue: normalizeNotifyQueue(client, options.notifyQueue),
})

const onTaskBefore = async (
  manager: ThrottleManager,
  sessionId: string,
  callId: string,
  args: unknown,
): Promise<void> => {
  const record = asRecord(args)
  const description = asString(record?.description)
  await manager.startTask(sessionId, callId, record?.background === true, description)
}

const onTaskAfter = (
  manager: ThrottleManager,
  sessionId: string,
  callId: string,
  output: { output: string; metadata: unknown },
): void => {
  const record = asRecord(output.metadata)
  let childSessionId: string | undefined
  if (typeof record?.sessionId === 'string' && record.sessionId.length > 0) {
    childSessionId = record.sessionId
  } else {
    childSessionId = TASK_CALL_ID_REGEX.exec(output.output)?.[1]
  }
  manager.endTask(sessionId, callId, childSessionId)
}

const onSessionEvent = (manager: ThrottleManager, event: unknown): void => {
  const legacy = event as unknown as { type: string; properties?: unknown }
  const properties = asRecord(legacy.properties)
  if (legacy.type === 'session.idle') {
    if (typeof properties?.sessionID === 'string') {
      manager.onSessionIdle(properties.sessionID)
    }
    return
  }
  if (legacy.type === 'message.part.updated') {
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
}

// biome-ignore lint/suspicious/useAwait: the Plugin type requires Promise<Hooks>, but this body is synchronous.
const Throttle: Plugin = async ({ client }, options = {}) => {
  const { maxParallel, mode, maxWaitMs, notifyQueue } = normalizeOptions(client, options)

  const managerOptions: ThrottleManagerOptions = {
    maxParallel,
    mode,
    maxWaitMs,
    onWarn: (message) => warn(client, message),
  }
  if (notifyQueue) {
    managerOptions.onQueued = (info) => notify(client, info.sessionId, queuedLine(info))
    managerOptions.onStarted = (info) => notify(client, info.sessionId, startedLine(info))
  }
  const manager = new ThrottleManager(managerOptions)

  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'task') {
        return
      }
      await onTaskBefore(manager, input.sessionID, input.callID, output.args)
    },
    // biome-ignore lint/suspicious/useAwait: Hooks.tool.execute.after must return Promise<void>; the body is synchronous.
    'tool.execute.after': async (input, output) => {
      if (input.tool !== 'task') {
        return
      }
      onTaskAfter(manager, input.sessionID, input.callID, output)
    },
    // biome-ignore lint/suspicious/useAwait: Hooks.event must return Promise<void>; the body is synchronous.
    event: async ({ event }) => {
      onSessionEvent(manager, event)
    },
    // biome-ignore lint/suspicious/useAwait: Hooks.dispose must return Promise<void>; the body is synchronous.
    dispose: async () => {
      manager.dispose()
    },
  }
}

export interface SubagentThrottleOptions {
  maxParallel?: number
  mode?: 'session' | 'global'
  maxWaitMs?: number
  notifyQueue?: boolean
}

export default Throttle
