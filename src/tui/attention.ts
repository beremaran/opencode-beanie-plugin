// biome-ignore-all lint/style/noTernary: compact optional values keep notification payloads minimal.
// biome-ignore-all lint/style/useBlockStatements: the policy is intentionally compact and branch-local.
// biome-ignore-all lint/style/useDestructuring: public TUI fields are clearer at their call sites.
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: transition checks are kept together as one policy.
// biome-ignore-all lint/style/noContinue: early transition exits keep refresh handling flat.
// biome-ignore-all lint/complexity/useSimplifiedLogicExpression: route narrowing mirrors the public API union.
// biome-ignore-all lint/style/useNamingConvention: OpenCode event properties use sessionID.
import type { TuiPluginApi } from '@opencode-ai/plugin/tui'

const MAX_CACHE_ENTRIES = 256
const HEALTHY = 'connected'
type HealthKind = 'MCP' | 'LSP'

const boundedSet = (limit: number) => {
  const entries = new Set<string>()
  return {
    add(value: string): boolean {
      if (entries.has(value)) return false
      entries.add(value)
      if (entries.size > limit) entries.delete(entries.values().next().value as string)
      return true
    },
    delete(value: string): void {
      entries.delete(value)
    },
    clear(): void {
      entries.clear()
    },
  }
}

const notify = (api: TuiPluginApi, title: string, message: string, sound?: 'error' | 'subagent_done'): void => {
  void api.attention.notify({ title, message, sound: sound ? { name: sound } : undefined }).catch(() => undefined)
}

const currentSessionId = (api: TuiPluginApi): string | undefined => {
  const route = api.route.current
  if (!('params' in route) || !route.params) return undefined
  const sessionID = route.params.sessionID
  return typeof sessionID === 'string' && sessionID.length > 0 ? sessionID : undefined
}

const createHealthTracker = (
  api: TuiPluginApi,
  kind: HealthKind,
  rows: () => readonly { id: string; status: string }[],
) => {
  const states = new Map<string, string>()
  const transitions = boundedSet(MAX_CACHE_ENTRIES)
  for (const row of rows()) states.set(row.id, row.status)
  return () => {
    const seen = new Set<string>()
    for (const row of rows()) {
      seen.add(row.id)
      const previous = states.get(row.id)
      states.set(row.id, row.status)
      if (row.status === HEALTHY) {
        transitions.delete(`${kind}:${row.id}:${previous}`)
        continue
      }
      if (previous === undefined || previous === row.status || previous !== HEALTHY) continue
      if (transitions.add(`${kind}:${row.id}:${row.status}`)) {
        notify(api, `${kind} unhealthy`, `${kind} server ${row.id} is ${row.status}.`)
      }
    }
    for (const id of states.keys()) if (!seen.has(id)) states.delete(id)
  }
}

export const registerAttentionPolicy = (api: TuiPluginApi): void => {
  const mcp = createHealthTracker(api, 'MCP', () =>
    api.state.mcp().map((row) => ({ id: row.name, status: row.status })),
  )
  const lsp = createHealthTracker(api, 'LSP', () => api.state.lsp().map((row) => ({ id: row.id, status: row.status })))
  const events = [api.event.on('mcp.tools.changed', mcp), api.event.on('lsp.updated', lsp)]
  const errors = boundedSet(MAX_CACHE_ENTRIES)
  const childIdle = boundedSet(MAX_CACHE_ENTRIES)
  events.push(
    api.event.on('session.error', (event) => {
      const sessionID = event.properties.sessionID
      if (!sessionID) return
      const error = event.properties.error as unknown as Record<string, unknown> | undefined
      const name = error?.name ?? 'unknown'
      const message = typeof error?.message === 'string' ? error.message : String(name)
      if (errors.add(`${sessionID}:${name}:${message}`)) notify(api, 'Session error', message, 'error')
    }),
    api.event.on('session.idle', (event) => {
      const sessionID = event.properties.sessionID
      const current = currentSessionId(api)
      if (!current || current === sessionID) return
      const session = api.state.session.get(sessionID)
      if (!session?.parentID || session.parentID !== current) return
      if (childIdle.add(sessionID))
        notify(api, 'Subagent done', `${session.slug || sessionID} is idle.`, 'subagent_done')
    }),
    api.event.on('session.status', (event) => {
      if (event.properties.status.type !== 'idle') childIdle.delete(event.properties.sessionID)
    }),
  )
  api.lifecycle.onDispose(() => {
    for (const unsubscribe of events) unsubscribe()
    errors.clear()
    childIdle.clear()
  })
}
