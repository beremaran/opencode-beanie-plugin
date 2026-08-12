import type { Plugin } from '@opencode-ai/plugin'

const SERVICE = 'opencode-beanie-plugin'
export const MECHANISMS = [
  'goal',
  'orchestrator',
  'throttle',
  'skillbox',
  'toolbox',
  'providers',
  'configurator',
] as const
const TOOL_PATTERN = /^[a-z0-9_-]+$/
const DEFAULT_TOOL_GUIDANCE: Record<string, string> = {
  get_goal:
    'Use to check the active goal, its budgets, and the latest evaluation before starting or resuming goal-driven work in this session.',
  update_goal:
    'Use to claim the goal complete for independent verification, or to mark it blocked after the same external blocker has recurred for at least three goal turns.',
  list_skills: 'Use to browse available agent skills before hand-writing common, reusable logic.',
  search_skills:
    'Use to find a matching agent skill before implementing a well-known pattern; prefer loading a found skill over writing from scratch.',
  load_skill: 'Use to read the full SKILL.md and optional supporting files for a skill you intend to follow.',
  configure_plugin:
    "Use to inspect, validate, or write the plugin's own configuration in opencode.json (status/schema/validate/apply).",
}
const DEFAULT_MECHANISM_NOTES: Record<string, string> = {
  goal: '- Persistent goals: set an objective with /goal; the plugin evaluates progress on every idle turn, may auto-continue, and get_goal/update_goal expose live status.',
  orchestrator:
    '- Orchestration: decompose requests into small, independently verifiable subtasks and delegate each via the `task` tool to a subagent (explore/general); never do hands-on work you can delegate.',
  throttle:
    '- Concurrency: `task` invocations are throttled (default maxParallel 2) and may queue; keep delegation briefs small and self-contained, and fan out independent subtasks.',
  skillbox:
    '- Skill discovery: before implementing a common pattern, run search_skills, then load_skill to reuse an existing agent skill.',
  toolbox:
    '- Tool aggregation: tools from configured MCP servers are aggregated and available alongside built-ins; prefer them when they match the task.',
  providers:
    '- Providers: manage OpenAI-compatible providers with /add-provider and /providers; the plugin auto-configures their models.',
  configurator:
    "- Configuration: run /beanie status, /beanie validate, or /beanie apply to inspect or write the plugin's options, or /beanie init for a guided setup; the configure_plugin tool does the same programmatically.",
}

type Resolved = {
  defaults: boolean
  system: string[]
  tools: Record<string, string>
  mechanisms: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const booleanOption = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        .map((entry) => entry.trim())
    : []
const stringMap = (value: unknown): Record<string, string> => {
  const result: Record<string, string> = {}
  if (!isRecord(value)) return result
  for (const [key, entry] of Object.entries(value))
    if (typeof entry === 'string' && entry.trim() !== '' && TOOL_PATTERN.test(key)) result[key] = entry.trim()
  return result
}
export const resolveOptions = (raw: Record<string, unknown> | undefined): Resolved => {
  const source = raw ?? {}
  const mechanisms = stringList(source.mechanisms).filter((entry): entry is string =>
    (MECHANISMS as readonly string[]).includes(entry),
  )
  return {
    defaults: booleanOption(source.defaults, true),
    system: stringList(source.system),
    tools: stringMap(source.tools),
    mechanisms,
  }
}
const mechanismNotes = (options: Resolved): string[] => {
  const keys = options.mechanisms.length > 0 ? options.mechanisms : [...MECHANISMS]
  return keys.map((key) => DEFAULT_MECHANISM_NOTES[key])
}
const systemDirective = (options: Resolved): string => `# Plugin capabilities (${SERVICE})
This plugin adds tools and background mechanisms. Prefer them over manual work when the mechanism applies.

## Mechanisms
${mechanismNotes(options).join('\n')}

## Tool usage
- The plugin appends "when to use" guidance to the descriptions of its tools; read it before calling them.
- Track multi-turn objectives with the /goal command and consult get_goal/update_goal as you progress.
- Delegate decomposition-ready work to a subagent with the \`task\` tool instead of doing it inline.
- Before writing boilerplate, run search_skills then load_skill to reuse an existing agent skill.`
const toolGuidance = (options: Resolved, toolID: string): string | undefined => {
  const parts: string[] = []
  if (options.defaults && DEFAULT_TOOL_GUIDANCE[toolID]) parts.push(DEFAULT_TOOL_GUIDANCE[toolID])
  if (options.tools[toolID]) parts.push(options.tools[toolID])
  return parts.length > 0 ? parts.join(' ') : undefined
}

const Directives: Plugin = async ({ client }, rawOptions) => {
  const options = resolveOptions(rawOptions)
  if (options.system.length === 0 && options.tools && Object.keys(options.tools).length === 0) return {}
  await client.app
    .log({
      body: {
        service: SERVICE,
        level: 'info',
        message: 'Directives feature enabled',
        extra: {
          defaults: options.defaults,
          mechanisms: options.mechanisms,
          customSystem: options.system.length,
          customTools: Object.keys(options.tools).length,
        },
      },
    })
    .catch(() => undefined)
  return {
    'tool.definition': async ({ toolID }, output) => {
      const guidance = toolGuidance(options, toolID)
      if (guidance)
        output.description = output.description
          ? `${output.description}\n\n[${SERVICE}] ${guidance}`
          : `[${SERVICE}] ${guidance}`
    },
    'experimental.chat.system.transform': async (_input, output) => {
      if (options.defaults) output.system.push(systemDirective(options))
      for (const line of options.system) output.system.push(line)
    },
  }
}

export default Directives
