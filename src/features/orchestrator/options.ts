import { BLOCKED_TOOL_PATTERN, DEFAULTS, MODEL_PATTERN, PLUGIN_ID } from './constants.js'

interface OrchestratorOptions {
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

interface NormalizedOptions {
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

const REQUIRED_MODEL_MESSAGE = `[${PLUGIN_ID}] The \`subagentModel\` option is required, e.g. ["${PLUGIN_ID}", { "subagentModel": "anthropic/claude-sonnet-4-6" }]. Run \`/beanie init\` after installing to configure the plugin interactively.`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const invalidOption = (name: string, expected: string): never => {
  throw new Error(`[${PLUGIN_ID}] The \`${name}\` option must be ${expected}.`)
}

const nonEmptyString = (value: unknown, name: string): string => {
  if (typeof value !== 'string') {
    invalidOption(name, 'a non-empty string')
  }
  const trimmed = (value as string).trim()
  if (trimmed === '') {
    invalidOption(name, 'a non-empty string')
  }
  return trimmed
}

const booleanOption = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') {
    invalidOption(name, 'a boolean')
  }
  return value as boolean
}

const positiveIntegerOption = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    invalidOption(name, 'a positive integer')
  }
  return value as number
}

const optionalString = (value: unknown, name: string): string | undefined => {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return undefined
  }
  return nonEmptyString(value, name)
}

const stringArray = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value)) {
    invalidOption(name, 'an array of non-empty strings')
  }
  return [...new Set((value as unknown[]).map((entry) => nonEmptyString(entry, `${name} entries`)))]
}

const stringRecord = (value: unknown, name: string): Record<string, string> => {
  if (!isRecord(value)) {
    invalidOption(name, 'an object with non-empty string values')
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      nonEmptyString(key, `${name} keys`),
      nonEmptyString(entry, `${name} values`),
    ]),
  )
}

const modelString = (value: unknown, name: string): string => {
  const model = nonEmptyString(value, name)
  if (!MODEL_PATTERN.test(model)) {
    invalidOption(name, `a model id like "provider/model" (got \`${model}\`)`)
  }
  return model
}

const normalizeOrchestratorModels = (value: unknown, depth: number): string[] | undefined => {
  if (value === undefined) {
    return undefined
  }
  const models = stringArray(value, 'orchestratorModels').map((model) => modelString(model, 'orchestratorModels'))
  if (models.length === 0) {
    return undefined
  }
  if (models.length > depth) {
    throw new Error(
      `[${PLUGIN_ID}] The \`orchestratorModels\` option has ${models.length} entries but \`orchestratorDepth\` is ${depth}.`,
    )
  }
  return models
}

const validateBlockedTools = (names: string[]): string[] => {
  for (const name of names) {
    if (!BLOCKED_TOOL_PATTERN.test(name)) {
      invalidOption('blockedTools entries', `tool names matching /^[a-z0-9_-]+$/ (got \`${name}\`)`)
    }
  }
  return names
}

const requiredModel = (options: Record<string, unknown>): string => {
  if (
    options.subagentModel === undefined ||
    options.subagentModel === null ||
    (typeof options.subagentModel === 'string' && options.subagentModel.trim() === '')
  ) {
    throw new Error(REQUIRED_MODEL_MESSAGE)
  }
  return modelString(options.subagentModel, 'subagentModel')
}

const stringListOption = (options: Record<string, unknown>, name: string): string[] | undefined => {
  if (options[name] === undefined) {
    return undefined
  }
  return stringArray(options[name], name)
}

const boolOption = (options: Record<string, unknown>, name: string, fallback: boolean): boolean => {
  if (options[name] === undefined) {
    return fallback
  }
  return booleanOption(options[name], name)
}

const intOption = (options: Record<string, unknown>, name: string, fallback: number): number => {
  if (options[name] === undefined) {
    return fallback
  }
  return positiveIntegerOption(options[name], name)
}

const stringOption = (options: Record<string, unknown>, name: string, fallback: string): string => {
  if (options[name] === undefined) {
    return fallback
  }
  return nonEmptyString(options[name], name)
}

const recordOption = (
  options: Record<string, unknown>,
  name: string,
  fallback: Record<string, string>,
): Record<string, string> => {
  if (options[name] === undefined) {
    return fallback
  }
  return stringRecord(options[name], name)
}

const optionalModel = (options: Record<string, unknown>, name: string): string | undefined => {
  const value = options[name]
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  return modelString(value, name)
}

const normalizeOptions = (rawOptions: unknown): NormalizedOptions => {
  let candidate: unknown = rawOptions
  if (candidate === null) {
    candidate = {}
  }
  if (!isRecord(candidate)) {
    invalidOption('options', 'an object')
  }
  const options = candidate as Record<string, unknown>
  const subagentModel = requiredModel(options)
  let blockedTools: string[]
  if (options.blockedTools === undefined) {
    blockedTools = validateBlockedTools([...DEFAULTS.blockedTools])
  } else {
    blockedTools = validateBlockedTools(stringArray(options.blockedTools, 'blockedTools'))
  }
  const agents = stringListOption(options, 'agents')
  const restrictTask = boolOption(options, 'restrictTask', false)
  const orchestratorDepth = intOption(options, 'orchestratorDepth', 1)
  const orchestratorModels = normalizeOrchestratorModels(options.orchestratorModels, orchestratorDepth)
  const orchestratorModel = optionalModel(options, 'orchestratorModel')
  const agentModels = recordOption(options, 'agentModels', {})
  for (const model of Object.values(agentModels)) {
    modelString(model, 'agentModels values')
  }
  const orchestratorAgent = stringOption(options, 'orchestratorAgent', DEFAULTS.orchestratorAgent)
  return {
    subagentModel,
    orchestratorModel,
    orchestratorAgent,
    orchestratorDepth,
    orchestratorModels,
    agents,
    agentModels,
    instructions: optionalString(options.instructions, 'instructions'),
    blockedTools,
    restrictTask,
  }
}

export type { NormalizedOptions, OrchestratorOptions }
export { normalizeOptions }
