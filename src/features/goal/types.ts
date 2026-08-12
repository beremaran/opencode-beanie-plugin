export const GOAL_STATUSES = ['active', 'paused', 'complete', 'blocked', 'budget_limited', 'turn_limited'] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]
export type CompletionClaim = { reason: string; createdAt: number }
export type GoalState = {
  version: 1
  goalId: string
  sessionID: string
  directory: string
  objective: string
  status: GoalStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  turns: number
  tokensUsed: number
  tokenBudget?: number
  maxTurns?: number
  lastEvaluatedMessageID?: string
  lastReason?: string
  completionClaim?: CompletionClaim
}
export type EvaluationDecision = { complete: boolean; reason: string; error?: boolean }
export type GoalPluginOptions = {
  evaluatorModel?: string
  evaluatorAgent?: string
  stateDirectory?: string
  maxTranscriptChars?: number
  defaultTokenBudget?: number
  defaultMaxTurns?: number
  continuationDelayMs?: number
  deleteEvaluatorSessions?: boolean
}
export type ResolvedGoalPluginOptions = {
  evaluatorModel?: string
  evaluatorAgent?: string
  stateDirectory?: string
  maxTranscriptChars: number
  defaultTokenBudget?: number
  defaultMaxTurns?: number
  continuationDelayMs: number
  deleteEvaluatorSessions: boolean
}
export type GoalCommand =
  | { action: 'status' }
  | { action: 'help' }
  | { action: 'clear' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'set'; objective: string; tokenBudget?: number; maxTurns?: number }
  | { action: 'invalid'; message: string }
export type ModelRef = { providerID: string; modelID: string }
export type TranscriptPart = {
  type: string
  text?: string
  tool?: string
  state?: { status?: string; title?: string; output?: string; error?: string }
  files?: string[]
}
export type TranscriptMessage = {
  info: {
    id: string
    role: 'user' | 'assistant'
    time: { created: number }
    agent?: string
    model?: ModelRef
    tokens?: { input: number; output: number; reasoning: number; cache?: { read: number; write: number } }
  }
  parts: TranscriptPart[]
}
