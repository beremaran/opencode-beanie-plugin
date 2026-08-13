import type { GoalCommand, GoalPluginOptions, ResolvedGoalPluginOptions } from './types.js'

const DEFAULT_MAX_TRANSCRIPT_CHARS = 48_000
const MIN_TRANSCRIPT_CHARS = 1024

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return undefined
  }
  return value
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return undefined
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed.length > 0) {
    return trimmed
  }
  return undefined
}

export function resolveOptions(raw: Record<string, unknown> | undefined): ResolvedGoalPluginOptions {
  const input = (raw ?? {}) as GoalPluginOptions
  const resolved: ResolvedGoalPluginOptions = {
    maxTranscriptChars: Math.max(
      positiveInteger(input.maxTranscriptChars) ?? DEFAULT_MAX_TRANSCRIPT_CHARS,
      MIN_TRANSCRIPT_CHARS,
    ),
    continuationDelayMs: nonNegativeInteger(input.continuationDelayMs) ?? 0,
    deleteEvaluatorSessions: input.deleteEvaluatorSessions !== false,
  }

  const evaluatorModel = optionalString(input.evaluatorModel)
  const evaluatorAgent = optionalString(input.evaluatorAgent)
  const stateDirectory = optionalString(input.stateDirectory)
  const defaultTokenBudget = positiveInteger(input.defaultTokenBudget)
  const defaultMaxTurns = positiveInteger(input.defaultMaxTurns)

  if (evaluatorModel) {
    resolved.evaluatorModel = evaluatorModel
  }
  if (evaluatorAgent) {
    resolved.evaluatorAgent = evaluatorAgent
  }
  if (stateDirectory) {
    resolved.stateDirectory = stateDirectory
  }
  if (defaultTokenBudget) {
    resolved.defaultTokenBudget = defaultTokenBudget
  }
  if (defaultMaxTurns) {
    resolved.defaultMaxTurns = defaultMaxTurns
  }

  return resolved
}

export function parseTokenCount(raw: string): number | undefined {
  const tokenRegex = /^(\d+(?:\.\d+)?)([kKmM])?$/
  const match = raw.trim().match(tokenRegex)
  if (!match) {
    return undefined
  }

  let value: number
  let suffix: string | undefined
  if (match) {
    value = Number(match[1])
    suffix = match[2]?.toLowerCase()
  } else {
    value = 0
    suffix = undefined
  }

  const K = 1000
  const M = 1_000_000
  let result: number
  switch (suffix) {
    case 'k':
      result = value * K
      break
    case 'm':
      result = value * M
      break
    default:
      result = value
  }

  if (!Number.isSafeInteger(result) || result <= 0) {
    return undefined
  }

  return result
}

type SetDefaults = Pick<ResolvedGoalPluginOptions, 'defaultTokenBudget' | 'defaultMaxTurns'>

export function parseGoalCommand(rawArguments: string, defaults: SetDefaults): GoalCommand {
  let rest = rawArguments.trim()
  if (!rest) {
    return { action: 'status' }
  }

  if (rest === 'help' || rest === '--help' || rest === '-h') {
    return { action: 'help' }
  }

  if (rest === 'clear' || rest === 'cancel') {
    return { action: 'clear' }
  }

  if (rest === 'pause') {
    return { action: 'pause' }
  }

  if (rest === 'resume') {
    return { action: 'resume' }
  }

  let tokenBudget = defaults.defaultTokenBudget
  let maxTurns = defaults.defaultMaxTurns
  const tokenRegex = /^--tokens(?:=|\s+)(\S+)(?:\s+|$)/
  const turnsRegex = /^--max-turns(?:=|\s+)(\S+)(?:\s+|$)/
  const spaceSplit = /\s+/

  while (rest.startsWith('--')) {
    const tokenMatch = rest.match(tokenRegex)
    if (tokenMatch) {
      const parsed = parseTokenCount(tokenMatch[1] ?? '')
      if (!parsed) {
        return { action: 'invalid', message: '`--tokens` must be a positive integer, optionally ending in k or m.' }
      }
      tokenBudget = parsed
      rest = rest.slice(tokenMatch.index!).trim()
    }

    const turnsMatch = rest.match(turnsRegex)
    if (turnsMatch) {
      const parsed = Number(turnsMatch[1])
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        return { action: 'invalid', message: '`--max-turns` must be a positive integer.' }
      }
      maxTurns = parsed
      rest = rest.slice(turnsMatch.index!).trim()
    }

    if (!(tokenMatch || turnsMatch)) {
      const firstToken = rest.split(spaceSplit, 1)[0] ?? rest
      return { action: 'invalid', message: `Unknown goal option: ${firstToken}` }
    }
  }

  if (!rest) {
    return { action: 'invalid', message: 'A goal needs a concrete completion condition.' }
  }

  const result: Extract<GoalCommand, { action: 'set' }> = { action: 'set', objective: rest }
  if (tokenBudget) {
    result.tokenBudget = tokenBudget
  }
  if (maxTurns) {
    result.maxTurns = maxTurns
  }

  return result
}
