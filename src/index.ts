import type { Plugin } from '@opencode-ai/plugin'
import { composePlugins } from './compose.js'
import Configurator from './features/configurator/index.js'
import Directives from './features/directives/index.js'
import GoalPlugin from './features/goal/index.js'
import OrchestratorPlugin from './features/orchestrator/index.js'
import Providers from './features/providers/index.js'
import Skillbox from './features/skillbox/index.js'
import Throttle from './features/throttle/index.js'
import Toolbox from './features/toolbox/index.js'

const features: Record<string, Plugin> = {
  orchestrator: OrchestratorPlugin,
  throttle: Throttle,
  goal: GoalPlugin,
  providers: Providers,
  skillbox: Skillbox,
  toolbox: Toolbox,
  directives: Directives,
  configurator: Configurator,
}

const BeaniePlugin: Plugin = async (input, options) => composePlugins(input, features, options ?? {})

export default BeaniePlugin
