// biome-ignore-all lint/style/noTernary: compact defensive normalization keeps malformed values branch-local.
// biome-ignore-all lint/style/useExportsLast: derivation helpers are intentionally exported alongside their types.
import type { TuiPluginApi } from '@opencode-ai/plugin/tui'
import type {
  TuiDashboardSnapshot,
  TuiDiffFile,
  TuiDiffSummary,
  TuiHealthRow,
  TuiHealthSummary,
  TuiPermission,
  TuiQuestion,
  TuiTodoCounts,
  TuiTodoItem,
} from './types.js'

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined)
const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const call = (fn: unknown, ...args: unknown[]): unknown => {
  try {
    return typeof fn === 'function' ? (fn as (...values: unknown[]) => unknown)(...args) : undefined
  } catch {
    return undefined
  }
}
const field = (value: unknown, key: string): unknown => {
  try {
    return record(value)[key]
  } catch {
    return undefined
  }
}

export const deriveTodoCounts = (items: readonly TuiTodoItem[]): TuiTodoCounts => ({
  total: items.length,
  pending: items.filter((item) => item.status === 'pending').length,
  inProgress: items.filter((item) => item.status === 'in_progress').length,
  completed: items.filter((item) => item.status === 'completed').length,
  cancelled: items.filter((item) => item.status === 'cancelled').length,
})

export const deriveTodos = (value: unknown): Readonly<{ counts: TuiTodoCounts; items: readonly TuiTodoItem[] }> => {
  const items = array(value).flatMap((item) => {
    const object = record(item)
    const content = text(object.content)
    const status = text(object.status)
    return content && status ? [{ content, status }] : []
  })
  return { counts: deriveTodoCounts(items), items }
}

export const deriveDiff = (value: unknown, fallback?: unknown): TuiDiffSummary => {
  const files = array(value).flatMap((item) => {
    const object = record(item)
    const file = text(object.file)
    return file ? [{ file, additions: number(object.additions), deletions: number(object.deletions) }] : []
  }) as TuiDiffFile[]
  if (files.length > 0 || !fallback) {
    return {
      files,
      count: files.length,
      additions: files.reduce((sum, item) => sum + item.additions, 0),
      deletions: files.reduce((sum, item) => sum + item.deletions, 0),
    }
  }
  const summary = record(fallback)
  return {
    files: [],
    count: number(summary.files),
    additions: number(summary.additions),
    deletions: number(summary.deletions),
  }
}

const deriveHealth = (value: unknown, lsp: boolean): TuiHealthSummary => {
  const rows = array(value).flatMap((item) => {
    const object = record(item)
    const id = text(object.id)
    const status = text(object.status)
    if (!(id && status)) {
      return []
    }
    const root = text(object.root)
    const error = text(object.error)
    return [{ id, status, ...(root ? { root } : {}), ...(error ? { error } : {}) }]
  }) as TuiHealthRow[]
  const healthy = rows.filter((row) => (lsp ? row.status === 'connected' : row.status === 'connected')).length
  return { rows, count: rows.length, healthy, unhealthy: rows.length - healthy }
}

export const deriveMcp = (value: unknown): TuiHealthSummary => deriveHealth(value, false)
export const deriveLsp = (value: unknown): TuiHealthSummary => deriveHealth(value, true)

export const derivePending = (permissions: unknown, questions: unknown): TuiDashboardSnapshot['pending'] => {
  const permissionRows = array(permissions).flatMap((item) => {
    const object = record(item)
    const id = text(object.id)
    const permission = text(object.permission)
    if (!(id && permission)) {
      return []
    }
    return [
      {
        id,
        permission,
        patterns: array(object.patterns).filter((pattern): pattern is string => typeof pattern === 'string'),
      },
    ]
  }) as TuiPermission[]
  const questionRows = array(questions).flatMap((item) => {
    const id = text(field(item, 'id'))
    const providedQuestions = field(item, 'questions')
    const count = Array.isArray(providedQuestions) ? providedQuestions.length : 1
    return id ? [{ id, count }] : []
  }) as TuiQuestion[]
  return {
    permissions: permissionRows,
    questions: questionRows,
    permissionCount: permissionRows.length,
    questionCount: questionRows.reduce((total, question) => total + question.count, 0),
  }
}

export const deriveDashboardSnapshot = (api: TuiPluginApi, sessionId: string): TuiDashboardSnapshot => {
  const state = api?.state
  const session = record(call(field(state, 'session') && field(field(state, 'session'), 'get'), sessionId))
  const sessionApi = record(field(state, 'session'))
  const diff = call(sessionApi.diff, sessionId)
  const todos = call(sessionApi.todo, sessionId)
  const permissions = call(sessionApi.permission, sessionId)
  const questions = call(sessionApi.question, sessionId)
  const providers = array(field(state, 'provider'))
  const config = record(field(state, 'config'))
  const path = text(field(field(state, 'path'), 'directory'))
  return {
    session: { status: text(field(call(sessionApi.status, sessionId), 'type')), title: text(session.title) },
    todos: deriveTodos(todos),
    diff: deriveDiff(diff, session.summary),
    mcp: deriveMcp(call(field(state, 'mcp'))),
    lsp: deriveLsp(call(field(state, 'lsp'))),
    providers: { count: providers.length, defaultModel: text(config.model) },
    vcs: { branch: text(field(field(state, 'vcs'), 'branch')) },
    pending: derivePending(permissions, questions),
    ...(path ? { path } : {}),
  }
}
