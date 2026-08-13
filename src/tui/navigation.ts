// biome-ignore-all lint/style/useNamingConvention: OpenCode route and command APIs use sessionID.
import type { TuiPluginApi } from '@opencode-ai/plugin/tui'

const DASHBOARD_ROUTE = 'beanie.dashboard'
const OPEN_COMMAND = 'beanie.dashboard.open'
const REFRESH_COMMAND = 'beanie.dashboard.refresh'
const DASHBOARD_BINDING = '<leader>d'

const currentSessionId = (api: TuiPluginApi): string | undefined => {
  const { current } = api.route
  if (!('params' in current)) {
    return undefined
  }
  const { params } = current
  if (!params || typeof params !== 'object') {
    return undefined
  }
  const sessionId = (params as Record<string, unknown>).sessionID
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return undefined
  }
  return sessionId
}

const openDashboard = (api: TuiPluginApi): void => {
  api.route.navigate(DASHBOARD_ROUTE, { sessionID: currentSessionId(api) })
}

const refreshDashboard = (api: TuiPluginApi): void => {
  const sessionID = currentSessionId(api)
  api.route.navigate(DASHBOARD_ROUTE, { sessionID })
}

export const registerDashboardNavigation = (api: TuiPluginApi): void => {
  if (typeof api.keymap?.registerLayer === 'function') {
    const unregister = api.keymap.registerLayer({
      commands: [
        {
          name: OPEN_COMMAND,
          title: 'Open Beanie dashboard',
          desc: 'Open the Beanie dashboard for the current session',
          category: 'Beanie',
          namespace: 'palette',
          slashName: 'beanie-dashboard',
          run: () => openDashboard(api),
        },
        {
          name: REFRESH_COMMAND,
          title: 'Refresh Beanie dashboard',
          desc: 'Refresh and reopen the Beanie dashboard',
          category: 'Beanie',
          namespace: 'palette',
          slashName: 'beanie-dashboard-refresh',
          run: () => refreshDashboard(api),
        },
      ],
      bindings: [{ key: DASHBOARD_BINDING, cmd: OPEN_COMMAND, desc: 'Open Beanie dashboard' }],
    })
    api.lifecycle.onDispose(unregister)
    return
  }

  const unregister = api.command?.register(() => [
    {
      title: 'Open Beanie dashboard',
      value: OPEN_COMMAND,
      description: 'Open the Beanie dashboard for the current session',
      category: 'Beanie',
      keybind: DASHBOARD_BINDING,
      slash: { name: 'beanie-dashboard' },
      onSelect: () => openDashboard(api),
    },
    {
      title: 'Refresh Beanie dashboard',
      value: REFRESH_COMMAND,
      description: 'Refresh and reopen the Beanie dashboard',
      category: 'Beanie',
      slash: { name: 'beanie-dashboard-refresh' },
      onSelect: () => refreshDashboard(api),
    },
  ])
  if (unregister) {
    api.lifecycle.onDispose(unregister)
  }
}
