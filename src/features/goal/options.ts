import type { GoalCommand, GoalPluginOptions, ResolvedGoalPluginOptions } from './types.js'

const DEFAULT_MAX_TRANSCRIPT_CHARS = 48_000
const MIN_TRANSCRIPT_CHARS = 1024
const THOUSAND = 1000
const MILLION = 1_000_000
const TOKEN_COUNT_RE = /^(\d+(?:\.\d+)?)([kKmM])?$/
const TOKENS_FLAG_RE = /^--tokens(?:=|\s+)(\S+)(?:\s+|$)/
const MAX_TURNS_FLAG_RE = /^--max-turns(?:=|\s+)(\S+)(?:\s+|$)/
const WHITESPACE_RE = /\s+/

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

type SetDefaults = Pick<ResolvedGoalPluginOptions, 'defaultTokenBudget' | 'defaultMaxTurns'>

type FlagResult =
  | { action: 'invalid'; message: string }
  | { action: 'flags'; rest: string; tokenBudget: number | undefined; maxTurns: number | undefined }

type TokenFlagResult =
  | { invalid: true; message: string }
  | { invalid: false; rest: string; tokenBudget: number | undefined }

type TurnsFlagResult =
  | { invalid: true; message: string }
  | { invalid: false; rest: string; maxTurns: number | undefined }

function applyTokensFlag(remaining: string, tokenBudget: number | undefined): TokenFlagResult {
  const match = remaining.match(TOKENS_FLAG_RE)
  if (!match) {
    return { invalid: false, rest: remaining, tokenBudget }
  }
  const parsed = parseTokenCount(match[1] ?? '')
  if (!parsed) {
    return { invalid: true, message: '`--tokens` must be a positive integer, optionally ending in k or m.' }
  }
  return { invalid: false, rest: remaining.slice((match.index ?? 0) + match[0].length).trim(), tokenBudget: parsed }
}

function applyTurnsFlag(remaining: string, maxTurns: number | undefined): TurnsFlagResult {
  const match = remaining.match(MAX_TURNS_FLAG_RE)
  if (!match) {
    return { invalid: false, rest: remaining, maxTurns }
  }
  const parsed = Number(match[1])
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return { invalid: true, message: '`--max-turns` must be a positive integer.' }
  }
  return { invalid: false, rest: remaining.slice((match.index ?? 0) + match[0].length).trim(), maxTurns: parsed }
}

function parseGoalFlags(rest: string, defaults: SetDefaults): FlagResult {
  let tokenBudget = defaults.defaultTokenBudget
  let maxTurns = defaults.defaultMaxTurns
  let remaining = rest
  while (remaining.startsWith('--')) {
    const before = remaining
    const token = applyTokensFlag(remaining, tokenBudget)
    if (token.invalid) {
      return { action: 'invalid', message: token.message }
    }
    ;({ rest: remaining, tokenBudget } = token)
    const turns = applyTurnsFlag(remaining, maxTurns)
    if (turns.invalid) {
      return { action: 'invalid', message: turns.message }
    }
    ;({ rest: remaining, maxTurns } = turns)
    if (remaining === before) {
      const firstToken = remaining.split(WHITESPACE_RE, 1)[0] ?? remaining
      return { action: 'invalid', message: `Unknown goal option: ${firstToken}` }
    }
  }
  return { action: 'flags', rest: remaining, tokenBudget, maxTurns }
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
  const match = raw.trim().match(TOKEN_COUNT_RE)
  if (!match) {
    return undefined
  }

  const value = Number(match[1])
  const suffix = match[2]?.toLowerCase()
  let result: number
  if (suffix === 'k') {
    result = value * THOUSAND
  } else if (suffix === 'm') {
    result = value * MILLION
  } else {
    result = value
  }

  if (!Number.isSafeInteger(result) || result <= 0) {
    return undefined
  }

  return result
}

export function parseGoalCommand(rawArguments: string, defaults: SetDefaults): GoalCommand {
  const rest = rawArguments.trim()
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

  const flags = parseGoalFlags(rest, defaults)
  if (flags.action === 'invalid') {
    return flags
  }
  if (!flags.rest) {
    return { action: 'invalid', message: 'A goal needs a concrete completion condition.' }
  }

  const result: Extract<GoalCommand, { action: 'set' }> = { action: 'set', objective: flags.rest }
  if (flags.tokenBudget) {
    result.tokenBudget = flags.tokenBudget
  }
  if (flags.maxTurns) {
    result.maxTurns = flags.maxTurns
  }

  return result
}
