export type TuiTodoItem = Readonly<{ content: string; status: string }>
export type TuiTodoCounts = Readonly<{
  total: number
  pending: number
  inProgress: number
  completed: number
  cancelled: number
}>
export type TuiDiffFile = Readonly<{ file: string; additions: number; deletions: number }>
export type TuiDiffSummary = Readonly<{
  files: readonly TuiDiffFile[]
  count: number
  additions: number
  deletions: number
}>
export type TuiHealthRow = Readonly<{ id: string; status: string; error?: string; root?: string }>
export type TuiHealthSummary = Readonly<{
  rows: readonly TuiHealthRow[]
  count: number
  healthy: number
  unhealthy: number
}>
export type TuiPermission = Readonly<{ id: string; permission: string; patterns: readonly string[] }>
export type TuiQuestion = Readonly<{ id: string; count: number }>
export type TuiSession = Readonly<{ status?: string; title?: string }>
export type TuiProviderSummary = Readonly<{ count: number; defaultModel?: string }>
export type TuiDashboardSnapshot = Readonly<{
  session: TuiSession
  todos: Readonly<{ counts: TuiTodoCounts; items: readonly TuiTodoItem[] }>
  diff: TuiDiffSummary
  mcp: TuiHealthSummary
  lsp: TuiHealthSummary
  providers: TuiProviderSummary
  vcs: Readonly<{ branch?: string }>
  pending: Readonly<{
    permissions: readonly TuiPermission[]
    questions: readonly TuiQuestion[]
    permissionCount: number
    questionCount: number
  }>
  path?: string
}>
