export type GoalStatus =
    | "active"
    | "paused"
    | "blocked"
    | "completed"
    | "cancelled"
    | "budget_limited"
    | "turn_limited";

export type CompletionClaim = {
    reason: string
    createdAt: string
};

export type Goal = {
    id: string
    sessionID: string
    version: number
    createdAt: string
    updatedAt: string
    completedAt?: string
    status: GoalStatus
    outcome: string
    constraints: string[]
    verificationCriteria: string[]
    verificationEvidence: string[]
    progress?: string
    nextAction?: string
    blocker?: string
    turns?: number
    tokensUsed?: number
    tokenBudget?: number
    maxTurns?: number
    lastEvaluatedMessageId?: string
    lastReason?: string
    completionClaim?: CompletionClaim
};

export type UpdateArgs = {
    status?: GoalStatus
    progress?: string
    nextAction?: string
    blocker?: string
    verificationEvidence?: string[]
    tokenBudget?: number
    maxTurns?: number
    reason?: string
    completionClaim?: CompletionClaim
};
