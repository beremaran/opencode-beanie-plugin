export type GoalStatus = "active" | "paused" | "blocked" | "completed" | "cancelled"

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
}

export type UpdateArgs = {
    status?: GoalStatus
    progress?: string
    nextAction?: string
    blocker?: string
    verificationEvidence?: string[]
}
