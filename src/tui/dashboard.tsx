// biome-ignore-all lint/suspicious/noUnknownAttribute: OpenTUI JSX attributes are non-DOM renderable props.
// biome-ignore-all lint/style/noJsxLiterals: static terminal presentation copy.
// biome-ignore-all lint/style/noTernary: compact rendering branches keep empty states local.
// biome-ignore-all lint/style/useComponentExportOnlyModules: route registration and view share this module.
// biome-ignore-all lint/style/useDestructuring: route API access is clearer at the fallback boundary.
// biome-ignore-all lint/style/useBlockStatements: compact defensive presentation helpers.
// biome-ignore-all lint/complexity/noForEach: lifecycle cleanup intentionally invokes each disposer.
// biome-ignore-all lint/suspicious/useIterableCallbackReturn: lifecycle disposers intentionally return void at runtime.
// biome-ignore-all lint/performance/useSolidForComponent: bounded health rows are static snapshot presentation.
// biome-ignore-all lint/style/noMagicNumbers: compact panel limits and dimensions are presentation constants.
// biome-ignore-all lint/style/noNegationElse: the empty state is intentionally the first branch.
// biome-ignore-all lint/complexity/noExcessiveLinesPerFunction: the dashboard composition is a single compact route view.
// biome-ignore-all lint/correctness/useJsxKeyInIterable: OpenTUI Solid reconciles this bounded snapshot list by position.
import type { TuiPluginApi, TuiRouteDefinition, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import type { JSX } from '@opentui/solid'
import { createSnapshotStore } from './snapshot-store.js'
import type { TuiHealthSummary } from './types.js'

type DashboardColors = Pick<
  TuiThemeCurrent,
  'accent' | 'background' | 'backgroundPanel' | 'borderSubtle' | 'error' | 'success' | 'text' | 'textMuted' | 'warning'
>

const value = (item: string | number | undefined, empty = '—'): string | number => item ?? empty
const sessionIdFrom = (api: TuiPluginApi, params?: Record<string, unknown>): string | undefined => {
  const param = params?.sessionID ?? params?.sessionId
  if (typeof param === 'string' && param.length > 0) {
    return param
  }
  const current = api.route.current
  const currentParam = 'params' in current ? current.params?.sessionID : undefined
  if (typeof currentParam === 'string' && currentParam.length > 0) {
    return currentParam
  }
  return undefined
}
const statusColor = (colors: DashboardColors, status: string): TuiThemeCurrent['accent'] => {
  if (status === 'connected' || status === 'completed') return colors.success
  if (status === 'error' || status === 'failed') return colors.error
  return colors.warning
}

const Empty = (props: { children: string }) => <text fg="#888888">{props.children}</text>

const Panel = (props: { title: string; colors: DashboardColors; children: JSX.Element }) => (
  <box
    border={true}
    borderColor={props.colors.borderSubtle}
    backgroundColor={props.colors.backgroundPanel}
    title={props.title}
    titleColor={props.colors.accent}
    padding={1}
    flexGrow={1}
    minWidth={32}
    minHeight={7}
  >
    {props.children}
  </box>
)

const HealthRows = (props: { summary: TuiHealthSummary; colors: DashboardColors }) =>
  props.summary.rows.length === 0 ? (
    <Empty>Nothing reported</Empty>
  ) : (
    <box
      flexDirection="column"
      gap={0}
    >
      {props.summary.rows.slice(0, 4).map((row) => (
        <text>
          <span style={{ fg: statusColor(props.colors, row.status) }}>●</span> {row.id}{' '}
          <span style={{ fg: props.colors.textMuted }}>{row.status}</span>
        </text>
      ))}
      {props.summary.count > 4 && <text fg={props.colors.textMuted}>+ {props.summary.count - 4} more</text>}
    </box>
  )

const Dashboard = (props: { api: TuiPluginApi; sessionId?: string }) => {
  const colors = props.api.theme.current
  const store = createSnapshotStore(props.api)
  const current = () => (props.sessionId ? store.snapshot(props.sessionId)() : undefined)

  return (
    <box
      flexDirection="column"
      backgroundColor={colors.background}
      flexGrow={1}
      padding={1}
      gap={1}
    >
      <box
        flexDirection="row"
        justifyContent="space-between"
        flexWrap="wrap"
      >
        <text
          fg={colors.text}
          attributes={1}
        >
          Beanie <span style={{ fg: colors.accent }}>/ dashboard</span>
        </text>
        <text fg={colors.textMuted}>{props.sessionId ? `session ${props.sessionId}` : 'No active session'}</text>
      </box>
      {!current() ? (
        <box
          border={true}
          borderColor={colors.borderSubtle}
          padding={1}
          flexGrow={1}
        >
          <text fg={colors.text}>Select a session to inspect its dashboard.</text>
          <Empty>Session-scoped activity, work, health, and environment appear here.</Empty>
        </box>
      ) : (
        <box
          flexDirection="column"
          flexGrow={1}
          gap={1}
        >
          <box
            flexDirection="row"
            flexWrap="wrap"
            gap={1}
          >
            <Panel
              title="ACTIVITY"
              colors={colors}
            >
              <text fg={colors.text}>
                Status:{' '}
                <span style={{ fg: statusColor(colors, current()?.session.status ?? '') }}>
                  {value(current()?.session.status, 'unknown')}
                </span>
              </text>
              <text fg={colors.textMuted}>{value(current()?.session.title, 'Untitled session')}</text>
              <text fg={colors.textMuted}>
                Pending: {current()?.pending.permissionCount ?? 0} permissions · {current()?.pending.questionCount ?? 0}{' '}
                prompts
              </text>
            </Panel>
            <Panel
              title="WORK"
              colors={colors}
            >
              <text fg={colors.text}>
                Todos: {current()?.todos.counts.inProgress} active · {current()?.todos.counts.pending} pending
              </text>
              <text fg={colors.textMuted}>
                Done {current()?.todos.counts.completed} · {current()?.todos.counts.cancelled} cancelled
              </text>
              <text fg={colors.text}>
                Diff: <span style={{ fg: colors.success }}>+{current()?.diff.additions}</span>{' '}
                <span style={{ fg: colors.error }}>-{current()?.diff.deletions}</span> · {current()?.diff.count} files
              </text>
              {current()?.todos.items.length === 0 && <Empty>No todos recorded</Empty>}
            </Panel>
          </box>
          <box
            flexDirection="row"
            flexWrap="wrap"
            gap={1}
          >
            <Panel
              title="HEALTH / MCP"
              colors={colors}
            >
              <text fg={colors.textMuted}>
                {current()?.mcp.healthy}/{current()?.mcp.count} connected
              </text>
              <HealthRows
                summary={current()?.mcp ?? { rows: [], count: 0, healthy: 0, unhealthy: 0 }}
                colors={colors}
              />
            </Panel>
            <Panel
              title="HEALTH / LSP"
              colors={colors}
            >
              <text fg={colors.textMuted}>
                {current()?.lsp.healthy}/{current()?.lsp.count} connected
              </text>
              <HealthRows
                summary={current()?.lsp ?? { rows: [], count: 0, healthy: 0, unhealthy: 0 }}
                colors={colors}
              />
            </Panel>
          </box>
          <Panel
            title="ENVIRONMENT"
            colors={colors}
          >
            <text fg={colors.text}>
              Provider count: {current()?.providers.count ?? 0} · Model:{' '}
              {value(current()?.providers.defaultModel, 'not configured')}
            </text>
            <text fg={colors.textMuted}>
              VCS: {value(current()?.vcs.branch, 'no branch')} · Path: {value(current()?.path, 'unknown')}
            </text>
          </Panel>
        </box>
      )}
    </box>
  )
}

export const registerDashboardRoute = (api: TuiPluginApi): void => {
  const routes: TuiRouteDefinition[] = [
    {
      name: 'beanie.dashboard',
      render: ({ params }) => (
        <Dashboard
          api={api}
          sessionId={sessionIdFrom(api, params)}
        />
      ),
    },
  ]
  const unregister = api.route.register(routes)
  api.lifecycle.onDispose(() => {
    unregister()
  })
}
