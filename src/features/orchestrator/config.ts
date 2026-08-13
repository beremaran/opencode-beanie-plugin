import type { Config } from '@opencode-ai/plugin'
import type { AgentLike, AgentScope, LogBody } from './agents.js'
import { applyRoutedAgentModels, buildAgentScope, configureOrchestratorLevel } from './agents.js'
import { BUILTIN_SUBAGENTS, DIRECTIVE_TOOLS, PLUGIN_ID } from './constants.js'
import type { NormalizedOptions } from './options.js'

interface LogEntry {
  body: LogBody
}
type LogFn = (entry: LogEntry) => Promise<void>

interface EnabledLogInput {
  cfg: Config
  opts: NormalizedOptions
  scope: AgentScope
  topOrchestrator?: AgentLike
  effectiveModels: string[]
  push: (body: LogBody) => void
}

interface LogBuffer {
  push: (body: LogBody) => void
  flush: (log: LogFn) => Promise<void>
}

const createLogBuffer = (): LogBuffer => {
  const entries: LogBody[] = []
  return {
    push: (body: LogBody) => {
      entries.push(body)
    },
    flush: async (log: LogFn) => {
      await Promise.all(entries.map((body) => log({ body })))
    },
  }
}

const warnAboutBlockedDirectiveTools = (opts: NormalizedOptions, push: (body: LogBody) => void): void => {
  const blockedDirectiveTools = DIRECTIVE_TOOLS.filter((tool) => opts.blockedTools.includes(tool))
  if (blockedDirectiveTools.length > 0) {
    push({
      service: PLUGIN_ID,
      level: 'warn',
      message: `Orchestrator relies on blocked tool(s): ${blockedDirectiveTools.join(', ')}`,
      extra: { blockedTools: opts.blockedTools },
    })
  }
}

const subagentDepthOf = (cfg: Config): number => {
  // biome-ignore lint/style/useNamingConvention: opencode config field is snake_case by contract
  const value = (cfg as Config & { subagent_depth?: unknown }).subagent_depth
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }
  return 1
}

const warnAboutDepth = (cfg: Config, opts: NormalizedOptions, push: (body: LogBody) => void): void => {
  const subagentDepth = subagentDepthOf(cfg)
  if (opts.orchestratorDepth > subagentDepth) {
    push({
      service: PLUGIN_ID,
      level: 'warn',
      message: `orchestratorDepth (${opts.orchestratorDepth}) exceeds opencode's subagent_depth (${subagentDepth}); set "subagent_depth": ${opts.orchestratorDepth} in opencode.json or delegation beyond the first hop will fail with "Subagent depth limit reached"`,
      extra: { orchestratorDepth: opts.orchestratorDepth, subagentDepth },
    })
  }
}

const warnAboutExcludedBuiltins = (opts: NormalizedOptions, scope: AgentScope, push: (body: LogBody) => void): void => {
  if (opts.agents !== undefined && !BUILTIN_SUBAGENTS.some((name) => scope.targets.includes(name))) {
    push({
      service: PLUGIN_ID,
      level: 'warn',
      message:
        'Explicit agents list excludes built-in subagents (general, explore); the orchestrator directive still instructs delegation to them.',
      extra: { agents: opts.agents, targets: scope.targets },
    })
  }
}

const defaultAgentOf = (cfg: Config): string => {
  // biome-ignore lint/style/useNamingConvention: opencode config field is snake_case by contract
  const value = (cfg as Config & { default_agent?: unknown }).default_agent
  if (typeof value === 'string' && value.trim() !== '') {
    return value
  }
  return '(unset)'
}

const pushEnabledLog = (input: EnabledLogInput): void => {
  const { cfg, opts, scope, topOrchestrator, effectiveModels, push } = input
  push({
    service: PLUGIN_ID,
    level: 'info',
    message: `Orchestrator "${opts.orchestratorAgent}" enabled; subagents -> ${opts.subagentModel}`,
    extra: {
      routedAgents: scope.targets,
      orchestratorModel: topOrchestrator?.model ?? cfg.model ?? '(default)',
      orchestratorModels: effectiveModels,
      blockedTools: [...opts.blockedTools],
      defaultAgent: defaultAgentOf(cfg),
      orchestratorDepth: opts.orchestratorDepth,
      orchestratorLevels: scope.levels,
    },
  })
}

const applyOrchestratorConfig = async (cfg: Config, opts: NormalizedOptions, log: LogFn): Promise<void> => {
  const scope = buildAgentScope(cfg, opts)
  const buffer = createLogBuffer()
  const { push } = buffer
  const disabled = scope.levels.find((name) => scope.getAgent(name)?.disable)
  if (disabled) {
    push({
      service: PLUGIN_ID,
      level: 'error',
      message: `The orchestrator agent \`${disabled}\` is disabled; plugin will not apply its configuration.`,
    })
    await buffer.flush(log)
    return
  }
  warnAboutBlockedDirectiveTools(opts, push)
  warnAboutDepth(cfg, opts, push)
  warnAboutExcludedBuiltins(opts, scope, push)
  applyRoutedAgentModels(scope, opts, push)
  const effectiveModels: string[] = []
  let topOrchestrator: AgentLike | undefined
  for (let index = 0; index < scope.levels.length; index += 1) {
    const { topOrchestrator: candidate, model } = configureOrchestratorLevel(scope, opts, index, push)
    if (candidate) {
      topOrchestrator = candidate
    }
    effectiveModels.push(model)
  }
  pushEnabledLog({ cfg, opts, scope, topOrchestrator, effectiveModels, push })
  await buffer.flush(log)
}

export type { LogFn }
export { applyOrchestratorConfig }
