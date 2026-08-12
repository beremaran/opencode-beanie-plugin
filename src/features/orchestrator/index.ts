import type { Config, Plugin } from "@opencode-ai/plugin"

const PLUGIN_ID = "opencode-beanie-plugin"

export interface OrchestratorOptions {
  subagentModel: string
  orchestratorModel?: string
  orchestratorAgent?: string
  orchestratorDepth?: number
  orchestratorModels?: string[]
  agents?: string[]
  agentModels?: Record<string, string>
  instructions?: string
  blockedTools?: string[]
  restrictTask?: boolean
}

type AgentLike = {
  model?: string
  mode?: string
  disable?: boolean
  description?: string
  prompt?: string
  permission?: Record<string, unknown>
}

type NormalizedOptions = {
  subagentModel: string
  orchestratorModel?: string
  orchestratorAgent: string
  orchestratorDepth: number
  orchestratorModels?: string[]
  agents?: string[]
  agentModels: Record<string, string>
  instructions?: string
  blockedTools: string[]
  restrictTask: boolean
}

const DEFAULTS = { orchestratorAgent: "Manager", blockedTools: ["edit", "bash"] } as const
const BUILTIN_SUBAGENTS = ["general", "explore"]
const KNOWN_BUILTINS = ["build", "plan", "compaction", "title", "summary"]
const DIRECTIVE_TOOLS = ["task", "todowrite", "question", "read", "glob", "grep", "webfetch", "websearch"]
const BLOCKED_TOOL_PATTERN = /^[a-z0-9_-]+$/
const MODEL_PATTERN = /^[^\s/]+\/[^\s/]+$/
const LEVEL1_DIRECTIVE_MARKER = "# Orchestrator Mode (enforced by opencode-beanie-plugin)"

const levelDirectiveMarker = (level: number, depth: number): string =>
  level === 1 ? LEVEL1_DIRECTIVE_MARKER : `# Orchestrator Mode (level ${level}/${depth}, enforced by opencode-beanie-plugin)`

const isSubagentLike = (agent: AgentLike | undefined) =>
  !agent || agent.mode === undefined || agent.mode === "subagent" || agent.mode === "all"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const invalidOption = (name: string, expected: string): never => {
  throw new Error(`[${PLUGIN_ID}] The \`${name}\` option must be ${expected}.`)
}

const nonEmptyString = (value: unknown, name: string): string => {
  if (typeof value !== "string") invalidOption(name, "a non-empty string")
  const trimmed = (value as string).trim()
  if (trimmed === "") invalidOption(name, "a non-empty string")
  return trimmed
}

const booleanOption = (value: unknown, name: string): boolean => {
  if (typeof value !== "boolean") invalidOption(name, "a boolean")
  return value as boolean
}

const positiveIntegerOption = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) invalidOption(name, "a positive integer")
  return value as number
}

const optionalString = (value: unknown, name: string): string | undefined => {
  if (value === undefined || (typeof value === "string" && value.trim() === "")) return undefined
  return nonEmptyString(value, name)
}

const stringArray = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value)) invalidOption(name, "an array of non-empty strings")
  return [...new Set((value as unknown[]).map((entry) => nonEmptyString(entry, `${name} entries`)))]
}

const stringRecord = (value: unknown, name: string): Record<string, string> => {
  if (!isRecord(value)) invalidOption(name, "an object with non-empty string values")
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      nonEmptyString(key, `${name} keys`),
      nonEmptyString(entry, `${name} values`),
    ]),
  )
}

const modelString = (value: unknown, name: string): string => {
  const model = nonEmptyString(value, name)
  if (!MODEL_PATTERN.test(model)) invalidOption(name, `a model id like "provider/model" (got \`${model}\`)`)
  return model
}

const normalizeOrchestratorModels = (value: unknown, depth: number): string[] | undefined => {
  if (value === undefined) return undefined
  const models = stringArray(value, "orchestratorModels").map((model) => modelString(model, "orchestratorModels"))
  if (models.length === 0) return undefined
  if (models.length > depth) {
    throw new Error(`[${PLUGIN_ID}] The \`orchestratorModels\` option has ${models.length} entries but \`orchestratorDepth\` is ${depth}.`)
  }
  return models
}

const validateBlockedTools = (names: string[]): string[] => {
  for (const name of names) {
    if (!BLOCKED_TOOL_PATTERN.test(name)) invalidOption("blockedTools entries", `tool names matching /^[a-z0-9_-]+$/ (got \`${name}\`)`)
  }
  return names
}

const defaultAgentOf = (cfg: Config): string => {
  const value = (cfg as Config & { default_agent?: unknown }).default_agent
  return typeof value === "string" && value.trim() !== "" ? value : "(unset)"
}

const subagentDepthOf = (cfg: Config): number => {
  const value = (cfg as Config & { subagent_depth?: unknown }).subagent_depth
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 1
}

const taskRuleFor = (targets: string[]): Record<string, "deny" | "allow"> => {
  const rule: Record<string, "deny" | "allow"> = { "*": "deny" }
  for (const name of targets) rule[name] = "allow"
  return rule
}

const sameTaskRule = (value: unknown, expected: Record<string, "deny" | "allow"> | string): boolean => {
  if (typeof expected === "string") return value === expected
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return keys.length === Object.keys(expected).length && keys.every((key) => value[key] === expected[key])
}

const REQUIRED_MODEL_MESSAGE = `[${PLUGIN_ID}] The \`subagentModel\` option is required, e.g. ["${PLUGIN_ID}", { "subagentModel": "anthropic/claude-sonnet-4-6" }]. Run \`/beanie init\` after installing to configure the plugin interactively.`

export const normalizeOptions = (rawOptions: unknown): NormalizedOptions => {
  const candidate = rawOptions == null ? {} : rawOptions
  if (!isRecord(candidate)) invalidOption("options", "an object")
  const options = candidate as Record<string, unknown>
  if (options.subagentModel === undefined || options.subagentModel === null || (typeof options.subagentModel === "string" && options.subagentModel.trim() === "")) {
    throw new Error(REQUIRED_MODEL_MESSAGE)
  }
  const blockedTools = validateBlockedTools(options.blockedTools === undefined ? [...DEFAULTS.blockedTools] : stringArray(options.blockedTools, "blockedTools"))
  const agents = options.agents === undefined ? undefined : stringArray(options.agents, "agents")
  const restrictTask = options.restrictTask === undefined ? false : booleanOption(options.restrictTask, "restrictTask")
  const orchestratorDepth = options.orchestratorDepth === undefined ? 1 : positiveIntegerOption(options.orchestratorDepth, "orchestratorDepth")
  const orchestratorModels = normalizeOrchestratorModels(options.orchestratorModels, orchestratorDepth)
  const orchestratorModel = options.orchestratorModel === undefined || options.orchestratorModel === null || options.orchestratorModel === "" ? undefined : modelString(options.orchestratorModel, "orchestratorModel")
  const agentModels = options.agentModels === undefined ? {} : stringRecord(options.agentModels, "agentModels")
  for (const model of Object.values(agentModels)) modelString(model, "agentModels values")
  return {
    subagentModel: modelString(options.subagentModel, "subagentModel"),
    orchestratorModel,
    orchestratorAgent: options.orchestratorAgent === undefined ? DEFAULTS.orchestratorAgent : nonEmptyString(options.orchestratorAgent, "orchestratorAgent"),
    orchestratorDepth,
    orchestratorModels,
    agents,
    agentModels,
    instructions: optionalString(options.instructions, "instructions"),
    blockedTools,
    restrictTask,
  }
}

const orchestratorLevels = (opts: NormalizedOptions): string[] => {
  const names = [opts.orchestratorAgent]
  for (let level = 2; level <= opts.orchestratorDepth; level += 1) names.push(`${opts.orchestratorAgent}-${level}`)
  return names
}

const orchestratorDirective = (opts: NormalizedOptions, level: number, depth: number, nextName: string | undefined): string => {
  const blocked = opts.blockedTools.length > 0 ? opts.blockedTools.join(", ") : "none"
  const extra = opts.instructions && level === 1 ? `\n\n${opts.instructions}` : ""
  if (depth === 1) return `${LEVEL1_DIRECTIVE_MARKER}

You are the ORCHESTRATOR. You do not do hands-on work. You plan, decompose, delegate, and review.

## Non-negotiable rules
1. Treat every user request as a project: decompose it into discrete, independently verifiable subtasks before touching anything.
2. Keep subtasks SMALL. A subtask is one concern: one file or a small cluster of related files, one bug, one component, one test area. If a brief needs many steps, spans unrelated areas, or would produce a report as long as the original request, split it further — never hand a monolithic task to a single subagent.
3. Delegate EVERY subtask with the \`task\` tool to a subagent. Never bundle several subtasks into one delegation, and never perform implementation work yourself.
4. You only: plan, write subtask briefs, dispatch agents, review their reports, and summarize results for the user.
5. Fan out: dispatch independent subtasks as several small \`task\` calls in a single message — more, smaller subagents in parallel beats one big delegation. Never run dependent subtasks concurrently; wait for each result before dispatching the next.
6. Give each subagent a complete, self-contained brief: goal, constraints, files involved, verification steps, and exactly what to report back.
7. Review every subagent report. If work is incomplete or wrong, delegate the fix to a subagent — never fix it yourself.
8. Reuse a running subagent via its task_id when follow-up work belongs to the same context.
9. Keep the user informed: report what was delegated to whom, the results, blockers, and the final state.

## Subtask sizing
- Split a request along its seams: separate files, functions, concerns, or verification steps each become their own subtask.
- A subtask is TOO BIG if: it touches many unrelated files, its brief runs more than a few paragraphs, a subagent could not finish and report back in one focused pass, or you cannot verify its result in isolation.
- When in doubt, split again — an extra small subagent costs less than one bloated delegation.

## Tool discipline
- \`task\` for all work (mandatory), \`todowrite\` to track subtasks, \`question\` only to clarify genuinely ambiguous requests.
- \`read\`/\`glob\`/\`grep\`/\`webfetch\`/\`websearch\` only when needed to write a better brief or verify a result.
- Hands-on tools are hard-blocked for you (${blocked}). If a subagent lacks a tool it needs, tell the user instead of doing it yourself.

## Default delegation
- \`explore\` — codebase research, locating code, understanding existing implementations.
- \`general\` — implementation, refactoring, testing, and any task without a more specific subagent.
- Prefer the most specialized subagent for each subtask; fall back to \`general\`.${extra}`
  const header = levelDirectiveMarker(level, depth)
  if (level < depth) return `${header}

You are ORCHESTRATOR level ${level} of ${depth} in a delegation chain. You do not do hands-on work. You plan, decompose, delegate, and review.

## Non-negotiable rules
1. Treat every request from the level above as a project: break it into discrete, independently verifiable subtasks before touching anything.
2. Keep subtasks SMALL. A subtask is one concern: one file or a small cluster of related files, one bug, one component, one test area. If a brief needs many steps, spans unrelated areas, or would produce a report as long as the original request, split it further — never hand a monolithic task to \`${nextName}\`.
3. Delegate EVERY subtask with the \`task\` tool, and ONLY to \`${nextName}\`. Never bundle several subtasks into one delegation, and never perform implementation work yourself.
4. Never delegate to worker subagents — only the FINAL orchestrator level delegates to them. Your only \`task\` target is \`${nextName}\`.
5. Fan out: dispatch independent subtasks as several small \`task\` calls in a single message — more, smaller delegations to \`${nextName}\` in parallel beats one big delegation. Never run dependent subtasks concurrently — wait for each result before dispatching the next.
6. Give \`${nextName}\` a complete, self-contained brief: goal, constraints, files involved, verification steps, and exactly what to report back.
7. Review every report from \`${nextName}\`. If work is incomplete or wrong, delegate the fix back to \`${nextName}\` — never fix it yourself.
8. Reuse a running \`${nextName}\` session via its task_id when follow-up work belongs to the same context.
9. Keep the level above informed: report what was delegated, the results, blockers, and the final state.

## Tool discipline
- \`task\` for all work (mandatory), \`todowrite\` to track subtasks, \`question\` only to clarify genuinely ambiguous requests.
- \`read\`/\`glob\`/\`grep\`/\`webfetch\`/\`websearch\` only when needed to write a better brief or verify a result.
- Hands-on tools are hard-blocked for you (${blocked}). If \`${nextName}\` lacks a tool it needs, tell the level above instead of doing it yourself.${extra}`
  return `${header}

You are ORCHESTRATOR level ${level} of ${depth} in a delegation chain — the FINAL orchestrator level. You do not do hands-on work. You plan, decompose, delegate, and review. Your subagents (\`explore\`, \`general\`) have the hands-on tools; they do the implementation.

## Non-negotiable rules
1. Treat every user request as a project: break it into discrete, independently verifiable subtasks before touching anything.
2. Keep subtasks SMALL. A subtask is one concern: one file or a small cluster of related files, one bug, one component, one test area. If a brief needs many steps, spans unrelated areas, or would produce a report as long as the original request, split it further — never hand a monolithic task to a single subagent.
3. Delegate EVERY subtask with the \`task\` tool to a subagent. Never bundle several subtasks into one delegation, and never perform implementation work yourself.
4. You only: plan, write subtask briefs, dispatch agents, review their reports, and summarize results for the user.
5. Fan out: dispatch independent subtasks as several small \`task\` calls in a single message — more, smaller subagents in parallel beats one big delegation. Never run dependent subtasks concurrently; wait for each result before dispatching the next.
6. Give each subagent a complete, self-contained brief: goal, constraints, files involved, verification steps, and exactly what to report back.
7. Review every subagent report. If work is incomplete or wrong, delegate the fix to a subagent — never fix it yourself.
8. Reuse a running subagent via its task_id when follow-up work belongs to the same context.
9. Keep the user informed: report what was delegated to whom, the results, blockers, and the final state.

## Tool discipline
- \`task\` for all work (mandatory), \`todowrite\` to track subtasks, \`question\` only to clarify genuinely ambiguous requests.
- \`read\`/\`glob\`/\`grep\`/\`webfetch\`/\`websearch\` only when needed to write a better brief or verify a result.
- Hands-on tools are hard-blocked for you (${blocked}). If a subagent lacks a tool it needs, tell the user instead of doing it yourself.

## Default delegation
- \`explore\` — codebase research, locating code, understanding existing implementations.
- \`general\` — implementation, refactoring, testing, and any task without a more specific subagent.
- Prefer the most specialized subagent for each subtask; fall back to \`general\`.${extra}`
}

type LogBody = { service: string; level: "error" | "warn" | "info"; message: string; extra?: Record<string, unknown> }
type LogEntry = { body: LogBody }
type LogFn = (entry: LogEntry) => Promise<void>

const permissionFor = async (entry: AgentLike, name: string, log: LogFn): Promise<Record<string, unknown>> => {
  if (!isRecord(entry.permission)) {
    await log({ body: { service: PLUGIN_ID, level: "warn", message: `Orchestrator agent "${name}" has a non-object permission; replacing it with an empty permission object` } })
    return {}
  }
  return { ...entry.permission }
}

const applyBlockedTools = async (entry: AgentLike, name: string, tools: string[], log: LogFn): Promise<void> => {
  if (tools.length === 0) return
  const permission = await permissionFor(entry, name, log)
  for (const tool of tools) {
    if (permission[tool] !== undefined && permission[tool] !== "deny") {
      await log({ body: { service: PLUGIN_ID, level: "warn", message: isRecord(permission[tool]) ? `Overwriting existing command-scoped rules for tool "${tool}" on agent "${name}" with blanket "deny"` : `Overwriting existing permission for tool "${tool}" on agent "${name}" with "deny"` } })
    }
    permission[tool] = "deny"
  }
  entry.permission = permission
}

const applyTaskRule = async (entry: AgentLike, name: string, rule: Record<string, "deny" | "allow"> | string, log: LogFn, toolName = "task"): Promise<void> => {
  const permission = await permissionFor(entry, name, log)
  const existing = permission[toolName]
  if (existing !== undefined && !sameTaskRule(existing, rule)) {
    await log({ body: { service: PLUGIN_ID, level: "warn", message: isRecord(existing) ? `Overwriting existing command-scoped rules for tool "${toolName}" on agent "${name}" with the delegation rule` : `Overwriting existing permission for tool "${toolName}" on agent "${name}" with the delegation rule` } })
    permission[toolName] = rule
  } else if (existing === undefined) permission[toolName] = rule
  entry.permission = permission
}

const OrchestratorPlugin: Plugin = async ({ client }, options = {}) => {
  let opts: NormalizedOptions
  try {
    opts = normalizeOptions(options)
  } catch (error) {
    const message = error instanceof Error ? error.message : `[${PLUGIN_ID}] Invalid plugin options.`
    await client.app.log({ body: { service: PLUGIN_ID, level: "error", message } })
    throw error
  }
  const log: LogFn = async (entry) => {
    await client.app.log(entry)
  }
  return {
    config: async (cfg) => {
      try {
        if (cfg.agent == null) cfg.agent = {}
        const agent = cfg.agent as Record<string, AgentLike>
        const hasAgent = (name: string) => Object.hasOwn(agent, name)
        const getAgent = (name: string) => (hasAgent(name) ? agent[name] : undefined)
        const ensureAgent = (name: string) => {
          if (!hasAgent(name) || agent[name] == null) Object.defineProperty(agent, name, { configurable: true, enumerable: true, value: {}, writable: true })
          return agent[name]
        }
        const levels = orchestratorLevels(opts)
        const levelNames = new Set(levels)
        const inScope = (name: string, def: AgentLike | undefined) => !KNOWN_BUILTINS.includes(name) && !def?.disable && isSubagentLike(def) && !levelNames.has(name)
        for (const name of levels) {
          if (getAgent(name)?.disable) {
            await log({ body: { service: PLUGIN_ID, level: "error", message: `The orchestrator agent \`${name}\` is disabled; plugin will not apply its configuration.` } })
            return
          }
        }
        const blockedDirectiveTools = DIRECTIVE_TOOLS.filter((tool) => opts.blockedTools.includes(tool))
        if (blockedDirectiveTools.length > 0) await log({ body: { service: PLUGIN_ID, level: "warn", message: `Orchestrator relies on blocked tool(s): ${blockedDirectiveTools.join(", ")}`, extra: { blockedTools: opts.blockedTools } } })
        const subagentDepth = subagentDepthOf(cfg)
        if (opts.orchestratorDepth > subagentDepth) await log({ body: { service: PLUGIN_ID, level: "warn", message: `orchestratorDepth (${opts.orchestratorDepth}) exceeds opencode's subagent_depth (${subagentDepth}); set "subagent_depth": ${opts.orchestratorDepth} in opencode.json or delegation beyond the first hop will fail with "Subagent depth limit reached"`, extra: { orchestratorDepth: opts.orchestratorDepth, subagentDepth } } })
        const candidates = opts.agents ?? [...BUILTIN_SUBAGENTS, ...Object.keys(agent)]
        const targets = [...new Set(candidates)].filter((name) => inScope(name, getAgent(name)))
        if (opts.agents !== undefined && !BUILTIN_SUBAGENTS.some((name) => targets.includes(name))) await log({ body: { service: PLUGIN_ID, level: "warn", message: "Explicit agents list excludes built-in subagents (general, explore); the orchestrator directive still instructs delegation to them.", extra: { agents: opts.agents, targets } } })
        for (const name of targets) {
          const existed = hasAgent(name)
          const def = ensureAgent(name)
          if (!existed && !BUILTIN_SUBAGENTS.includes(name) && !KNOWN_BUILTINS.includes(name)) await log({ body: { service: PLUGIN_ID, level: "warn", message: `Creating agent entry for unknown name "${name}" (typo in agents list?)` } })
          const model = Object.hasOwn(opts.agentModels, name) ? opts.agentModels[name] : opts.subagentModel
          if (!def.model) def.model = model
        }
        let topOrchestrator: AgentLike | undefined
        const effectiveModels: string[] = []
        for (let index = 0; index < levels.length; index += 1) {
          const name = levels[index]
          const level = index + 1
          const isFinal = level === opts.orchestratorDepth
          const levelModel = opts.orchestratorModels?.[level - 1] ?? opts.orchestratorModel
          const existed = hasAgent(name) && getAgent(name) != null
          const entry = ensureAgent(name)
          if (index === 0) topOrchestrator = entry
          if (!existed) await log({ body: { service: PLUGIN_ID, level: "info", message: `Creating orchestrator agent "${name}"` } })
          if (!entry.description) entry.description = level === 1 ? "Orchestrator agent: decomposes every request and delegates to subagents." : isFinal ? `Orchestrator agent (level ${level}/${opts.orchestratorDepth}): decomposes requests from the level above and delegates to the routed subagents.` : `Orchestrator agent (level ${level}/${opts.orchestratorDepth}): decomposes requests from the level above and delegates to the next level.`
          const targetMode = level === 1 ? "primary" : "subagent"
          const previousMode = entry.mode
          if (entry.mode !== targetMode) {
            entry.mode = targetMode
            if (previousMode !== undefined) await log({ body: { service: PLUGIN_ID, level: "warn", message: `Converting agent "${name}" mode "${previousMode}" to "${targetMode}" for orchestrator use` } })
          }
          if (levelModel) entry.model = levelModel
          await applyBlockedTools(entry, name, opts.blockedTools, log)
          if (isFinal) {
            const pinToTargets = opts.restrictTask && targets.length > 0
            if (opts.orchestratorDepth > 1 || pinToTargets) await applyTaskRule(entry, name, pinToTargets ? taskRuleFor(targets) : { "*": "allow" }, log)
          } else {
            await applyTaskRule(entry, name, taskRuleFor([levels[index + 1]]), log)
          }
          if (level > 1) await applyTaskRule(entry, name, "allow", log, "todowrite")
          const marker = levelDirectiveMarker(level, opts.orchestratorDepth)
          if (!entry.prompt?.includes(marker)) {
            const directive = orchestratorDirective(opts, level, opts.orchestratorDepth, isFinal ? undefined : levels[index + 1])
            entry.prompt = entry.prompt ? `${entry.prompt}\n\n${directive}` : directive
          }
          effectiveModels.push(levelModel ?? "(default)")
        }
        await log({ body: { service: PLUGIN_ID, level: "info", message: `Orchestrator "${opts.orchestratorAgent}" enabled; subagents -> ${opts.subagentModel}`, extra: { routedAgents: targets, orchestratorModel: topOrchestrator?.model ?? cfg.model ?? "(default)", orchestratorModels: effectiveModels, blockedTools: [...opts.blockedTools], defaultAgent: defaultAgentOf(cfg), orchestratorDepth: opts.orchestratorDepth, orchestratorLevels: levels } } })
      } catch (error) {
        await client.app.log({ body: { service: PLUGIN_ID, level: "error", message: `[${PLUGIN_ID}] Unexpected error in opencode-beanie-plugin config hook (this is a plugin bug; please report it)`, extra: { error } } })
      }
    },
  }
}

export default OrchestratorPlugin
