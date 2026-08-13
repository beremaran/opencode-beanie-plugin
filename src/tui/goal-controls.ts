// biome-ignore-all lint/style/useNamingConvention: OpenCode session command APIs use sessionID.
import type { TuiPluginApi } from '@opencode-ai/plugin/tui'

const GOAL_COMMANDS = {
  status: 'beanie.goal.status',
  pause: 'beanie.goal.pause',
  resume: 'beanie.goal.resume',
  clear: 'beanie.goal.clear',
} as const
type GoalAction = keyof typeof GOAL_COMMANDS

const currentSessionId = (api: TuiPluginApi): string | undefined => {
  const { current } = api.route
  if (!('params' in current && current.params)) {
    return undefined
  }
  const { sessionID } = current.params
  if (typeof sessionID !== 'string' || sessionID.length === 0) {
    return undefined
  }
  return sessionID
}
const toast = (api: TuiPluginApi, message: string, variant: 'success' | 'error'): void => {
  api.ui.toast({ title: 'Goal', message, variant })
}
const executeGoal = async (api: TuiPluginApi, action: GoalAction): Promise<void> => {
  const sessionID = currentSessionId(api)
  if (!sessionID) {
    toast(api, 'No active session', 'error')
    return
  }
  try {
    const response = await api.client.session.command({
      sessionID,
      command: 'goal',
      arguments: action,
    })
    if (response.error) {
      toast(api, 'Goal command failed', 'error')
      return
    }
    if (action === 'status') {
      toast(api, 'Goal status requested', 'success')
    } else {
      toast(api, `Goal ${action} requested`, 'success')
    }
  } catch {
    toast(api, 'Goal command failed', 'error')
  }
}
const confirmClear = (api: TuiPluginApi): void => {
  let open = true
  const close = (): void => {
    open = false
    api.ui.dialog.clear()
  }
  api.ui.dialog.replace(
    () =>
      api.ui.DialogConfirm({
        title: 'Clear goal?',
        message: 'This removes the goal for the current session.',
        onConfirm: () => {
          close()
          void executeGoal(api, 'clear')
        },
        onCancel: close,
      }),
    close,
  )
  api.lifecycle.onDispose(() => {
    if (open) {
      api.ui.dialog.clear()
    }
  })
}
export const registerGoalControls = (api: TuiPluginApi): void => {
  const unregister = api.keymap.registerLayer({
    commands: (Object.keys(GOAL_COMMANDS) as GoalAction[]).map((action) => ({
      name: GOAL_COMMANDS[action],
      title: `${action[0].toUpperCase()}${action.slice(1)} goal`,
      desc: `${action[0].toUpperCase()}${action.slice(1)} the goal for the current session`,
      category: 'Beanie',
      namespace: 'palette',
      run: () => {
        if (action === 'clear') {
          confirmClear(api)
          return
        }
        void executeGoal(api, action)
      },
    })),
  })
  api.lifecycle.onDispose(unregister)
}
