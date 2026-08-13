import { goalSummary } from './lifecycle.js'
import type { GoalState } from './types.js'

export const activeGoalContext = (goal: GoalState): string => {
  return `<active-goal>\n<objective>${escapeXmlText(goal.objective)}</objective>\n<progress>${budgetContext(goal)}</progress>\n</active-goal>\n\nKeep working toward this objective while it is active. Do not claim completion without concrete evidence. Use update_goal with status "complete" when the objective is genuinely achieved, or "blocked" only after the same external blocker has recurred for at least three goal turns.`
}

export function startingPrompt(goal: GoalState): string {
  return `<goal>\n<objective>${escapeXmlText(goal.objective)}</objective>\n<progress>${budgetContext(goal)}</progress>\n</goal>\n\nWork toward this completion condition now. Continue making concrete progress until it is genuinely satisfied. Verify the result with the strongest practical evidence available, and surface that evidence in your response so an independent evaluator can judge it.\n\nDo not stop merely because the work is difficult, lengthy, or would benefit from another turn. If you believe the objective is complete, call update_goal with status "complete" and a concise evidence-based reason before ending your turn. Mark it "blocked" only after the same external blocker has prevented progress for at least three goal turns.`
}

export function continuationPrompt(goal: GoalState): string {
  return `<goal-continuation>\n<objective>${escapeXmlText(goal.objective)}</objective>\n<progress>${budgetContext(goal)}</progress>\n<evaluation>${escapeXmlText(goal.lastReason ?? 'The completion condition is not yet established.')}</evaluation>\n</goal-continuation>\n\nThe goal remains active. Continue from the current state and address the evaluator's reason. Make concrete progress, verify it, and surface the evidence. Do not simply restate the plan or ask whether to continue.\n\nIf the objective is genuinely complete, call update_goal with status "complete" and a concise evidence-based reason. Mark it "blocked" only after the same external blocker has prevented progress for at least three goal turns.`
}

export function budgetLimitPrompt(goal: GoalState): string {
  return `<goal-budget-reached>\n<objective>${escapeXmlText(goal.objective)}</objective>\n<progress>${budgetContext(goal)}</progress>\n</goal-budget-reached>\n\nThe goal's configured budget has been reached. Do not start additional work. Give the user a concise handoff describing what is complete, what remains, the verification performed, and the exact next step.`
}

export function statusPrompt(goal: GoalState | undefined): string {
  return goal
    ? `This is a goal status request. Report the following state concisely without starting unrelated work:\n\n${goalSummary(goal)}`
    : 'This is a goal status request. Tell the user there is no goal for this session. Do not start unrelated work.'
}

export function helpPrompt(): string {
  return `Explain this plugin's /goal syntax concisely:\n\n/goal <completion condition>\n/goal --tokens 100k <completion condition>\n/goal --max-turns 20 <completion condition>\n/goal\n/goal pause\n/goal resume\n/goal clear\n\nMention that active goals are independently evaluated after each turn and automatically continue until complete, paused, cleared, blocked, or budget-limited.`
}

export function actionPrompt(message: string): string {
  return `This is a goal-control request. Tell the user: ${message} Do not start unrelated work.`
}

export const EVALUATOR_SYSTEM_PROMPT = `You are a conservative completion evaluator for a long-running coding-agent goal.\n\nJudge only whether the stated completion condition is fully satisfied based on evidence surfaced in the transcript. Do not call tools. Do not assume unreported work succeeded. If tests, builds, or checks are part of the condition, require transcript evidence that they ran and passed. If any required work remains, return complete=false.\n\nReturn exactly one JSON object with this shape and no markdown:\n{"complete":false,"reason":"one short, actionable sentence"}`

export function evaluatorPrompt(goal: GoalState, transcript: string): string {
  const claim = goal.completionClaim ? `\nThe working agent claimed completion: ${goal.completionClaim.reason}\n` : ''
  return `<completion-condition>\n${goal.objective}\n</completion-condition>\n${claim}<transcript>\n${transcript}\n</transcript>\n\nIs the completion condition fully satisfied? Return the required JSON object.`
}

function escapeXmlText(input: string): string {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function budgetContext(goal: GoalState): string {
  return [
    `turns_used=${goal.turns}`,
    `max_turns=${goal.maxTurns ?? 'unbounded'}`,
    `tokens_used=${goal.tokensUsed}`,
    `token_budget=${goal.tokenBudget ?? 'unbounded'}`,
    `remaining_tokens=${undefined === goal.tokenBudget ? 'unbounded' : Math.max(goal.tokenBudget - goal.tokensUsed, 0)}`,
  ].join(' ')
}

function remainingTokens(goal: GoalState): number | undefined {
  if (goal.tokenBudget === undefined) {
    return undefined
  }
  return Math.max(goal.tokenBudget - goal.tokensUsed, 0)
}

export function generateEvaluationPrompt(goal: GoalState): string {
  const summary = goalSummary(goal)
  return `Evaluate this goal's progress:\n\n${summary}`
}
