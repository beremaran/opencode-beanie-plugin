import type { Config } from '@opencode-ai/plugin'
import { BUILTIN_SUBAGENTS, KNOWN_BUILTINS, PLUGIN_ID } from './constants.js'
import { levelDirectiveMarker, orchestratorDirective } from './directive.js'
import type { NormalizedOptions } from './options.js'

interface AgentLike {
  model?: string
  mode?: string
  disable?: boolean
  description?: string
  prompt?: string
  permission?: Record<string, unknown>
}

interface LogBody {
  service: string
  level: 'error' | 'warn' | 'info'
  message: string
  extra?: Record<string, unknown>
}

interface AgentScope {
  levels: string[]
  targets: string[]
  hasAgent: (name: string) => boolean
  getAgent: (name: string) => AgentLike | undefined
  ensureAgent: (name: string) => AgentLike
}

interface LevelResult {
  topOrchestrator?: AgentLike
  model: string
}

interface TaskRuleInput {
  entry: AgentLike
  name: string
  rule: Record<string, 'deny' | 'allow'> | string
  push: (body: LogBody) => void
  toolName?: string
}

interface LevelTaskRuleInput {
  scope: AgentScope
  opts: NormalizedOptions
  entry: AgentLike
  name: string
  level: number
  isFinal: boolean
  push: (body: LogBody) => void
}

const isSubagentLike = (agent: AgentLike | undefined) =>
  !agent || agent.mode === undefined || agent.mode === 'subagent' || agent.mode === 'all'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const orchestratorLevels = (opts: NormalizedOptions): string[] => {
  const names = [opts.orchestratorAgent]
  for (let level = 2; level <= opts.orchestratorDepth; level += 1) {
    names.push(`${opts.orchestratorAgent}-${level}`)
  }
  return names
}

const taskRuleFor = (targets: string[]): Record<string, 'deny' | 'allow'> => {
  const rule: Record<string, 'deny' | 'allow'> = { '*': 'deny' }
  for (const name of targets) {
    rule[name] = 'allow'
  }
  return rule
}

const sameTaskRule = (value: unknown, expected: Record<string, 'deny' | 'allow'> | string): boolean => {
  if (typeof expected === 'string') {
    return value === expected
  }
  if (!isRecord(value)) {
    return false
  }
  const keys = Object.keys(value)
  return keys.length === Object.keys(expected).length && keys.every((key) => value[key] === expected[key])
}

const permissionFor = (entry: AgentLike, name: string, push: (body: LogBody) => void): Record<string, unknown> => {
  if (!isRecord(entry.permission)) {
    push({
      service: PLUGIN_ID,
      level: 'warn',
      message: `Orchestrator agent "${name}" has a non-object permission; replacing it with an empty permission object`,
    })
    return {}
  }
  return { ...entry.permission }
}

const applyBlockedTools = (entry: AgentLike, name: string, tools: string[], push: (body: LogBody) => void): void => {
  if (tools.length === 0) {
    return
  }
  const permission = permissionFor(entry, name, push)
  for (const tool of tools) {
    if (permission[tool] !== undefined && permission[tool] !== 'deny') {
      let message: string
      if (isRecord(permission[tool])) {
        message = `Overwriting existing command-scoped rules for tool "${tool}" on agent "${name}" with blanket "deny"`
      } else {
        message = `Overwriting existing permission for tool "${tool}" on agent "${name}" with "deny"`
      }
      push({ service: PLUGIN_ID, level: 'warn', message })
    }
    permission[tool] = 'deny'
  }
  entry.permission = permission
}

const applyTaskRule = ({ entry, name, rule, push, toolName = 'task' }: TaskRuleInput): void => {
  const permission = permissionFor(entry, name, push)
  const existing = permission[toolName]
  if (existing === undefined) {
    permission[toolName] = rule
  } else if (!sameTaskRule(existing, rule)) {
    let message: string
    if (isRecord(existing)) {
      message = `Overwriting existing command-scoped rules for tool "${toolName}" on agent "${name}" with the delegation rule`
    } else {
      message = `Overwriting existing permission for tool "${toolName}" on agent "${name}" with the delegation rule`
    }
    push({ service: PLUGIN_ID, level: 'warn', message })
    permission[toolName] = rule
  }
  entry.permission = permission
}

const applyLevelTaskRule = ({ scope, opts, entry, name, level, isFinal, push }: LevelTaskRuleInput): void => {
  if (isFinal) {
    const pinToTargets = opts.restrictTask && scope.targets.length > 0
    if (opts.orchestratorDepth > 1 || pinToTargets) {
      let rule: Record<string, 'deny' | 'allow'> | string
      if (pinToTargets) {
        rule = taskRuleFor(scope.targets)
      } else {
        rule = { '*': 'allow' }
      }
      applyTaskRule({ entry, name, rule, push })
    }
  } else {
    applyTaskRule({ entry, name, rule: taskRuleFor([scope.levels[level]]), push })
  }
  if (level > 1) {
    applyTaskRule({ entry, name, rule: 'allow', push, toolName: 'todowrite' })
  }
}

const orchestratorDescription = (opts: NormalizedOptions, level: number, isFinal: boolean): string => {
  if (level === 1) {
    return 'Orchestrator agent: decomposes every request and delegates to subagents.'
  }
  if (isFinal) {
    return `Orchestrator agent (level ${level}/${opts.orchestratorDepth}): decomposes requests from the level above and delegates to the routed subagents.`
  }
  return `Orchestrator agent (level ${level}/${opts.orchestratorDepth}): decomposes requests from the level above and delegates to the next level.`
}

const setDescription = (entry: AgentLike, opts: NormalizedOptions, level: number, isFinal: boolean): void => {
  if (entry.description) {
    return
  }
  entry.description = orchestratorDescription(opts, level, isFinal)
}

const ensureMode = (entry: AgentLike, name: string, level: number, push: (body: LogBody) => void): void => {
  let targetMode: 'primary' | 'subagent'
  if (level === 1) {
    targetMode = 'primary'
  } else {
    targetMode = 'subagent'
  }
  const previousMode = entry.mode
  if (entry.mode !== targetMode) {
    entry.mode = targetMode
    if (previousMode !== undefined) {
      push({
        service: PLUGIN_ID,
        level: 'warn',
        message: `Converting agent "${name}" mode "${previousMode}" to "${targetMode}" for orchestrator use`,
      })
    }
  }
}

const setLevelPrompt = (
  entry: AgentLike,
  opts: NormalizedOptions,
  level: number,
  nextName: string | undefined,
): void => {
  const marker = levelDirectiveMarker(level, opts.orchestratorDepth)
  if (entry.prompt?.includes(marker)) {
    return
  }
  const directive = orchestratorDirective(opts, level, opts.orchestratorDepth, nextName)
  if (entry.prompt) {
    entry.prompt = `${entry.prompt}\n\n${directive}`
  } else {
    entry.prompt = directive
  }
}

const configureOrchestratorLevel = (
  scope: AgentScope,
  opts: NormalizedOptions,
  index: number,
  push: (body: LogBody) => void,
): LevelResult => {
  const name = scope.levels[index]
  const level = index + 1
  const isFinal = level === opts.orchestratorDepth
  const levelModel = opts.orchestratorModels?.[level - 1] ?? opts.orchestratorModel
  const existed = scope.hasAgent(name) && scope.getAgent(name) !== null
  const entry = scope.ensureAgent(name)
  let topOrchestrator: AgentLike | undefined
  if (index === 0) {
    topOrchestrator = entry
  }
  if (!existed) {
    push({ service: PLUGIN_ID, level: 'info', message: `Creating orchestrator agent "${name}"` })
  }
  setDescription(entry, opts, level, isFinal)
  ensureMode(entry, name, level, push)
  if (levelModel) {
    entry.model = levelModel
  }
  applyBlockedTools(entry, name, opts.blockedTools, push)
  applyLevelTaskRule({ scope, opts, entry, name, level, isFinal, push })
  let nextName: string | undefined
  if (!isFinal) {
    nextName = scope.levels[index + 1]
  }
  setLevelPrompt(entry, opts, level, nextName)
  return { topOrchestrator, model: levelModel ?? '(default)' }
}

const isKnownAgent = (scope: AgentScope, name: string): boolean =>
  scope.hasAgent(name) || BUILTIN_SUBAGENTS.includes(name) || KNOWN_BUILTINS.includes(name)

const applyRoutedAgentModels = (scope: AgentScope, opts: NormalizedOptions, push: (body: LogBody) => void): void => {
  for (const name of scope.targets) {
    if (!isKnownAgent(scope, name)) {
      push({
        service: PLUGIN_ID,
        level: 'warn',
        message: `Creating agent entry for unknown name "${name}" (typo in agents list?)`,
      })
    }
  }
  for (const name of scope.targets) {
    const def = scope.ensureAgent(name)
    const model = opts.agentModels[name] ?? opts.subagentModel
    if (!def.model) {
      def.model = model
    }
  }
}

const buildAgentScope = (cfg: Config, opts: NormalizedOptions): AgentScope => {
  if (cfg.agent === null) {
    cfg.agent = {}
  }
  const agent = cfg.agent as Record<string, AgentLike>
  const hasAgent = (name: string) => Object.hasOwn(agent, name)
  const getAgent = (name: string): AgentLike | undefined => {
    if (!hasAgent(name)) {
      return undefined
    }
    return agent[name]
  }
  const ensureAgent = (name: string): AgentLike => {
    if (!hasAgent(name) || agent[name] === null) {
      Object.defineProperty(agent, name, { configurable: true, enumerable: true, value: {}, writable: true })
    }
    return agent[name]
  }
  const levels = orchestratorLevels(opts)
  const levelNames = new Set(levels)
  const inScope = (name: string, def: AgentLike | undefined) =>
    !(KNOWN_BUILTINS.includes(name) || def?.disable) && isSubagentLike(def) && !levelNames.has(name)
  const candidates = opts.agents ?? [...BUILTIN_SUBAGENTS, ...Object.keys(agent)]
  const targets = [...new Set(candidates)].filter((name) => inScope(name, getAgent(name)))
  return { levels, targets, hasAgent, getAgent, ensureAgent }
}

export type { AgentLike, AgentScope, LogBody }
export { applyRoutedAgentModels, buildAgentScope, configureOrchestratorLevel }
