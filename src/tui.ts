import type { TuiPluginModule } from '@opencode-ai/plugin/tui'
import { registerAttentionPolicy } from './tui/attention.js'
import { registerDashboardRoute } from './tui/dashboard.js'
import { registerGoalControls } from './tui/goal-controls.js'
import { registerDashboardNavigation } from './tui/navigation.js'
import { registerStatusSlot } from './tui/status-slot.js'

const BeanieTuiPlugin: TuiPluginModule = {
  // biome-ignore lint/suspicious/useAwait: TuiPluginModule.tui is async by contract.
  tui: async (api) => {
    registerAttentionPolicy(api)
    registerDashboardRoute(api)
    registerDashboardNavigation(api)
    registerGoalControls(api)
    registerStatusSlot(api)
  },
}

export default BeanieTuiPlugin
