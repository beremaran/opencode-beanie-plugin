import { randomUUID } from 'node:crypto'
import type { GoalState } from './types.js'

function createGoalState(input: CreateGoalInput): GoalState {
  const now = input.now ?? Date.now()
  const state: GoalState = {
    version: 1,
    goalId: input.goalId ?? randomUUID(),
    sessionId: input.sessionId,
    directory: input.directory,
    objective: input.objective.trim(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    turns: 0,
    tokensUsed: 0,
  }
  if (input.tokenBudget) {
    state.tokenBudget = input.tokenBudget
  }
  if (input.maxTurns) {
    state.maxTurns = input.maxTurns
  }
  return state
}

function remainingTokens(goal: GoalState): number | undefined {
  if (goal.tokenBudget === undefined) {
    return undefined
  }
  return Math.max(goal.tokenBudget - goal.tokensUsed, 0)
}

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_MINUTE = 60

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(Math.floor(milliseconds / MILLISECONDS_PER_SECOND), 0)
  const hours = Math.floor(seconds / SECONDS_PER_HOUR)
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  const rest = seconds % SECONDS_PER_MINUTE
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${rest}s`
  }
  return `${rest}s`
}

function goalSummary(goal: GoalState, now = Date.now()): string {
  let budgetStr: string
  if (goal.tokenBudget === undefined) {
    budgetStr = `${goal.tokensUsed.toLocaleString()} tokens`
  } else {
    budgetStr = `${goal.tokensUsed.toLocaleString()} / ${goal.tokenBudget.toLocaleString()} tokens`
  }
  let turnsStr: string
  if (goal.maxTurns === undefined) {
    turnsStr = `${goal.turns} turns`
  } else {
    turnsStr = `${goal.turns} / ${goal.maxTurns} turns`
  }
  const budget = budgetStr
  const turns = turnsStr
  let reason: string
  if (goal.lastReason) {
    reason = `\nLast evaluation: ${goal.lastReason}`
  } else {
    reason = ''
  }
  return (
    [
      `Goal status: ${goal.status}`,
      `Objective: ${goal.objective}`,
      `Progress: ${turns}; ${budget}; ${formatDuration(now - goal.createdAt)} elapsed`,
    ].join('\n') + reason
  )
}

export interface CreateGoalInput {
  sessionId: string
  directory: string
  objective: string
  tokenBudget?: number
  maxTurns?: number
  now?: number
  goalId?: string
}

export { createGoalState, formatDuration, goalSummary, remainingTokens }
