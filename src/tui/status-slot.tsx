// biome-ignore-all lint/suspicious/noUnknownAttribute: OpenTUI JSX attributes are non-DOM renderable props.
// biome-ignore-all lint/style/noJsxLiterals: compact terminal presentation copy.
// biome-ignore-all lint/style/noTernary: compact optional colors and severity styling.
// biome-ignore-all lint/style/useBlockStatements: compact metric branches.
// biome-ignore-all lint/style/useDestructuring: snapshot fields stay grouped by metric.
// biome-ignore-all lint/style/useComponentExportOnlyModules: slot registration and view share this module.
// biome-ignore-all lint/style/useNamingConvention: OpenTUI host slot names are snake_case.
import type { TuiPluginApi, TuiSlotPlugin, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import type { JSX } from '@opentui/solid'
import { createSnapshotStore } from './snapshot-store.js'
import type { TuiDashboardSnapshot } from './types.js'

const metric = (label: string, value: string | number, color?: TuiThemeCurrent['accent']) => (
  <span style={color ? { fg: color } : undefined}>
    {label}
    {value}
  </span>
)

const Status = (props: { api: TuiPluginApi; sessionId: string }) => {
  const snapshot = createSnapshotStore(props.api).snapshot(props.sessionId)
  const colors = props.api.theme.current
  return (
    <box
      flexDirection="row"
      flexShrink={1}
    >
      <text fg={colors.textMuted}>
        <span style={{ fg: colors.accent }}>Beanie</span>
        {(() => {
          const current = snapshot()
          if (!current) return ''
          return renderMetrics(current, colors)
        })()}
      </text>
    </box>
  )
}

const renderMetrics = (snapshot: TuiDashboardSnapshot, colors: TuiThemeCurrent) => {
  const parts: JSX.Element[] = []
  const status = snapshot.session.status
  if (status)
    parts.push(
      <> · {metric('● ', status, status === 'error' || status === 'failed' ? colors.error : colors.success)}</>,
    )
  const todos = snapshot.todos.counts
  if (todos.total > 0) parts.push(<> · {metric('todo ', `${todos.completed}/${todos.total}`, colors.info)}</>)
  if (snapshot.diff.additions > 0 || snapshot.diff.deletions > 0) {
    parts.push(
      <>
        {' '}
        · {snapshot.diff.additions > 0 && metric('+', snapshot.diff.additions, colors.success)}
        {snapshot.diff.deletions > 0 && metric(' -', snapshot.diff.deletions, colors.error)}
      </>,
    )
  }
  const unhealthy = snapshot.mcp.unhealthy + snapshot.lsp.unhealthy
  if (unhealthy > 0) parts.push(<> · {metric('health ', unhealthy, colors.warning)}</>)
  const pending = snapshot.pending.permissionCount + snapshot.pending.questionCount
  if (pending > 0) parts.push(<> · {metric('pending ', pending, colors.warning)}</>)
  return parts
}

export const registerStatusSlot = (api: TuiPluginApi): void => {
  const store = createSnapshotStore(api)
  const slot: TuiSlotPlugin = {
    dispose: () => store.dispose(),
    slots: {
      session_prompt_right: (_, { session_id }) => (
        <Status
          api={api}
          sessionId={session_id}
        />
      ),
    },
  }
  // The host owns slot registration and invokes the plugin dispose hook on removal.
  api.slots.register(slot)
}
