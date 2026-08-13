// biome-ignore lint/style/noExcessiveLinesPerFile: this file is the cohesive goal feature entrypoint (lifecycle wiring, slash-command handling, tool definitions, and idle-driven evaluation); splitting it would fragment tightly coupled state transitions.
import { type Hooks, type Plugin, type PluginInput, tool } from '@opencode-ai/plugin'
import { evaluateGoal } from './evaluator.js'
import { createGoalState, remainingTokens } from './lifecycle.js'
import { parseGoalCommand, resolveOptions } from './options.js'
import {
  actionPrompt,
  activeGoalContext,
  budgetLimitPrompt,
  continuationPrompt,
  helpPrompt,
  startingPrompt,
  statusPrompt,
} from './prompts.js'
import { defaultStateRoot, FileGoalStore, scopedStateDirectory } from './state.js'
import { latestAssistant, latestUserExecution, totalGoalTokens } from './transcript.js'
import type { GoalCommand, GoalState, ResolvedGoalPluginOptions, TranscriptMessage } from './types.js'

const SERVICE = 'opencode-beanie-plugin'
const TOAST_DURATION_MS = 6000

type Logger = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  extra?: Record<string, unknown>,
) => Promise<void>

interface IdleInput {
  client: PluginInput['client']
  store: FileGoalStore
  sessionId: string
  options: ResolvedGoalPluginOptions
  processing: Set<string>
  log: Logger
}

interface CommandInput {
  // biome-ignore lint/style/useNamingConvention: sessionID matches the command.execute.before hook input shape from @opencode-ai/plugin.
  command: { command: string; sessionID: string; arguments: string }
  output: { parts: Array<{ type: string; text?: string }> }
  store: FileGoalStore
  options: ResolvedGoalPluginOptions
  directory: string
  controlTurns: Set<string>
}

function replaceTextPart(parts: Array<{ type: string; text?: string }>, text: string): void {
  const part = parts.find((candidate) => candidate.type === 'text')
  if (!part) {
    throw new Error('The /goal command template did not produce a text part')
  }
  part.text = text
}
function asTranscriptMessages(value: unknown): TranscriptMessage[] {
  if (Array.isArray(value)) {
    return value as TranscriptMessage[]
  }
  return []
}
function statusPayload(goal: GoalState | undefined): string {
  if (goal) {
    return JSON.stringify({ goal, remainingTokens: remainingTokens(goal) ?? null }, null, 2)
  }
  return JSON.stringify({ goal: null })
}
async function sleep(milliseconds: number): Promise<void> {
  if (milliseconds > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  }
}
function createLogger(client: PluginInput['client']): Logger {
  return async (level, message, extra) => {
    const body: {
      service: string
      level: 'debug' | 'info' | 'warn' | 'error'
      message: string
      extra?: Record<string, unknown>
    } = { service: SERVICE, level, message }
    if (extra) {
      body.extra = extra
    }
    await client.app.log({ body }).catch(() => undefined)
  }
}
async function showToast(
  client: PluginInput['client'],
  message: string,
  variant: 'info' | 'success' | 'warning' | 'error',
): Promise<void> {
  await client.tui
    .showToast({ body: { title: 'Goal', message, variant, duration: TOAST_DURATION_MS } })
    .catch(() => undefined)
}
function isParentBusy(statuses: unknown, sessionId: string): boolean {
  if (typeof statuses !== 'object' || statuses === null) {
    return false
  }
  const status = (statuses as Record<string, { type?: string }>)[sessionId]
  return Boolean(status && status.type !== 'idle')
}
async function continueParent(input: {
  client: PluginInput['client']
  goal: GoalState
  messages: TranscriptMessage[]
  text: string
  log: Logger
}): Promise<void> {
  const { client, goal, messages, text, log } = input
  try {
    if (isParentBusy((await client.session.status()).data, goal.sessionId)) {
      await log('debug', 'Skipped continuation because the parent session is busy', { sessionId: goal.sessionId })
      return
    }
  } catch {
    // session status is best-effort; continue anyway
  }
  const execution = latestUserExecution(messages)
  const body: {
    parts: Array<{ type: 'text'; text: string }>
    agent?: string
    // biome-ignore lint/style/useNamingConvention: providerID/modelID are the OpenCode SDK model reference fields.
    model?: { providerID: string; modelID: string }
  } = { parts: [{ type: 'text', text }] }
  if (execution.agent) {
    body.agent = execution.agent
  }
  if (execution.model) {
    // biome-ignore lint/style/useNamingConvention: providerID/modelID are the OpenCode SDK model reference fields.
    body.model = { providerID: execution.model.providerId, modelID: execution.model.modelId }
  }
  const response = await client.session.promptAsync({ path: { id: goal.sessionId }, body })
  if (response.error) {
    await log('error', 'OpenCode rejected an automatic goal continuation', {
      sessionId: goal.sessionId,
      error: String(response.error),
    })
  }
}
async function handleIdle(input: IdleInput): Promise<void> {
  if (input.processing.has(input.sessionId)) {
    return
  }
  input.processing.add(input.sessionId)
  try {
    const goal = await input.store.get(input.sessionId)
    if (goal?.status !== 'active') {
      return
    }
    const response = await input.client.session.messages({ path: { id: input.sessionId } })
    if (response.error) {
      await input.log('error', 'Failed to read goal session messages', {
        sessionId: input.sessionId,
        error: String(response.error),
      })
      return
    }
    const messages = asTranscriptMessages(response.data)
    const assistant = latestAssistant(messages, goal.createdAt)
    if (!assistant || assistant.info.id === goal.lastEvaluatedMessageId) {
      return
    }
    await evaluateAndRespond(input, goal, messages, assistant)
  } finally {
    input.processing.delete(input.sessionId)
  }
}
async function evaluateAndRespond(
  input: IdleInput,
  goal: GoalState,
  messages: TranscriptMessage[],
  assistant: TranscriptMessage,
): Promise<void> {
  const progress: GoalState = {
    ...goal,
    turns: goal.turns + 1,
    tokensUsed: totalGoalTokens(messages, goal.createdAt),
    updatedAt: Date.now(),
    lastEvaluatedMessageId: assistant.info.id,
  }
  await input.store.set(progress)
  const decision = await evaluateGoal({
    client: input.client,
    parentSessionId: input.sessionId,
    goal: progress,
    messages,
    options: input.options,
  })
  const current = await input.store.get(input.sessionId)
  if (!current || current.goalId !== progress.goalId || current.status !== 'active') {
    return
  }
  if (decision.error) {
    await pauseForFailedEvaluation(input, current, decision.reason)
    return
  }
  if (decision.complete) {
    await completeGoal(input, current, decision.reason)
    return
  }
  if (await applyTokenLimit(input, current, decision.reason, messages)) {
    return
  }
  if (await applyTurnLimit(input, current, decision.reason, messages)) {
    return
  }
  await extendGoal(input, current, decision.reason, messages)
}
async function pauseForFailedEvaluation(input: IdleInput, current: GoalState, reason: string): Promise<void> {
  const paused = { ...current, status: 'paused' as const, updatedAt: Date.now(), lastReason: reason }
  paused.completionClaim = undefined
  await input.store.set(paused)
  await input.log('error', 'Goal paused because completion evaluation failed', {
    sessionId: paused.sessionId,
    reason,
  })
  await showToast(input.client, 'Goal paused: evaluator failed', 'error')
}
async function completeGoal(input: IdleInput, current: GoalState, reason: string): Promise<void> {
  const completed = {
    ...current,
    status: 'complete' as const,
    completedAt: Date.now(),
    updatedAt: Date.now(),
    lastReason: reason,
  }
  completed.completionClaim = undefined
  await input.store.set(completed)
  await input.log('info', 'Goal completed', {
    sessionId: completed.sessionId,
    turns: completed.turns,
    tokensUsed: completed.tokensUsed,
  })
  await showToast(input.client, `Goal complete: ${reason}`, 'success')
}
async function applyTokenLimit(
  input: IdleInput,
  current: GoalState,
  reason: string,
  messages: TranscriptMessage[],
): Promise<boolean> {
  if (current.tokenBudget === undefined || current.tokensUsed < current.tokenBudget) {
    return false
  }
  const limited = {
    ...current,
    status: 'budget_limited' as const,
    updatedAt: Date.now(),
    lastReason: `Token budget reached (${current.tokensUsed.toLocaleString()} / ${current.tokenBudget.toLocaleString()}). Last evaluation: ${reason}`,
  }
  limited.completionClaim = undefined
  await input.store.set(limited)
  await showToast(input.client, 'Goal stopped at its token budget', 'warning')
  await continueParent({
    client: input.client,
    goal: limited,
    messages,
    text: budgetLimitPrompt(limited),
    log: input.log,
  })
  return true
}
async function applyTurnLimit(
  input: IdleInput,
  current: GoalState,
  reason: string,
  messages: TranscriptMessage[],
): Promise<boolean> {
  if (current.maxTurns === undefined || current.turns < current.maxTurns) {
    return false
  }
  const limited = {
    ...current,
    status: 'turn_limited' as const,
    updatedAt: Date.now(),
    lastReason: `Turn budget reached (${current.turns} / ${current.maxTurns} turns). Last evaluation: ${reason}`,
  }
  limited.completionClaim = undefined
  await input.store.set(limited)
  await showToast(input.client, 'Goal stopped at its turn budget', 'warning')
  await continueParent({
    client: input.client,
    goal: limited,
    messages,
    text: budgetLimitPrompt(limited),
    log: input.log,
  })
  return true
}
async function extendGoal(
  input: IdleInput,
  current: GoalState,
  reason: string,
  messages: TranscriptMessage[],
): Promise<void> {
  const continuing = { ...current, updatedAt: Date.now(), lastReason: reason }
  continuing.completionClaim = undefined
  await input.store.set(continuing)
  await sleep(input.options.continuationDelayMs)
  const latest = await input.store.get(input.sessionId)
  if (!latest || latest.goalId !== continuing.goalId || latest.status !== 'active') {
    return
  }
  await continueParent({
    client: input.client,
    goal: latest,
    messages,
    text: continuationPrompt(latest),
    log: input.log,
  })
}
function answerCommand(input: CommandInput, text: string): void {
  input.controlTurns.add(input.command.sessionID)
  replaceTextPart(input.output.parts, text)
}
async function handlePause(input: CommandInput): Promise<void> {
  input.controlTurns.add(input.command.sessionID)
  const current = await input.store.get(input.command.sessionID)
  if (current?.status !== 'active') {
    replaceTextPart(input.output.parts, actionPrompt('There is no active goal to pause.'))
    return
  }
  await input.store.set({ ...current, status: 'paused', updatedAt: Date.now(), lastReason: 'Paused by the user.' })
  replaceTextPart(input.output.parts, actionPrompt('The session goal is paused.'))
}
async function handleResume(input: CommandInput): Promise<void> {
  const current = await input.store.get(input.command.sessionID)
  if (!current) {
    replaceTextPart(input.output.parts, actionPrompt('There is no goal to resume.'))
    return
  }
  if (current.status === 'complete') {
    input.controlTurns.add(input.command.sessionID)
    replaceTextPart(input.output.parts, actionPrompt('The previous goal is complete. Set a new goal to do more work.'))
    return
  }
  const resumed = {
    ...current,
    status: 'active' as const,
    updatedAt: Date.now(),
    lastReason: 'Resumed by the user.',
  }
  await input.store.set(resumed)
  replaceTextPart(input.output.parts, continuationPrompt(resumed))
}
async function handleSet(input: CommandInput, parsed: Extract<GoalCommand, { action: 'set' }>): Promise<void> {
  const goal = createGoalState({
    sessionId: input.command.sessionID,
    directory: input.directory,
    objective: parsed.objective,
  })
  if (parsed.tokenBudget) {
    goal.tokenBudget = parsed.tokenBudget
  }
  if (parsed.maxTurns) {
    goal.maxTurns = parsed.maxTurns
  }
  await input.store.set(goal)
  replaceTextPart(input.output.parts, startingPrompt(goal))
}
async function runGoalCommand(input: CommandInput): Promise<void> {
  const parsed = parseGoalCommand(input.command.arguments, input.options)
  if (parsed.action === 'status') {
    answerCommand(input, statusPrompt(await input.store.get(input.command.sessionID)))
    return
  }
  if (parsed.action === 'help') {
    answerCommand(input, helpPrompt())
    return
  }
  if (parsed.action === 'invalid') {
    answerCommand(input, actionPrompt(parsed.message))
    return
  }
  if (parsed.action === 'clear') {
    input.controlTurns.add(input.command.sessionID)
    await input.store.clear(input.command.sessionID)
    answerCommand(input, actionPrompt('The session goal was cleared.'))
    return
  }
  if (parsed.action === 'pause') {
    await handlePause(input)
    return
  }
  if (parsed.action === 'resume') {
    await handleResume(input)
    return
  }
  await handleSet(input, parsed)
}
function createConfigHook(): Hooks['config'] {
  // biome-ignore lint/suspicious/useAwait: the Hooks contract requires a Promise<void>; this handler is synchronous.
  return async (config) => {
    config.command ??= {}
    config.command.goal = {
      description: 'Set, inspect, pause, resume, or clear a persistent goal',
      template: '<goal-command>$ARGUMENTS</goal-command>',
    }
  }
}
function createGoalTools(input: { client: PluginInput['client']; store: FileGoalStore }): Hooks['tool'] {
  return {
    // biome-ignore lint/style/useNamingConvention: get_goal is the public snake_case tool name exposed to OpenCode agents.
    get_goal: tool({
      description:
        'Get the current persistent goal for this session, including status, budgets, usage, and the latest evaluator reason.',
      args: {},
      async execute(_args, context) {
        return statusPayload(await input.store.get(context.sessionID))
      },
    }),
    // biome-ignore lint/style/useNamingConvention: update_goal is the public snake_case tool name exposed to OpenCode agents.
    update_goal: tool({
      description:
        'Claim that the active goal is complete for independent verification, or mark it blocked after the same external blocker has prevented progress for at least three goal turns. Status must be "complete" or "blocked".',
      args: {
        status: tool.schema.enum(['complete', 'blocked']),
        reason: tool.schema.string().min(1).describe('Concise evidence for completion or the exact repeated blocker'),
      },
      async execute(args, context) {
        const goal = await input.store.get(context.sessionID)
        if (!goal) {
          return 'No goal exists for this session.'
        }
        if (goal.status !== 'active') {
          return `The goal is ${goal.status}, so it cannot be updated by the model.`
        }
        if (args.status === 'blocked') {
          if (goal.turns < 2) {
            return `Blocked status rejected: only ${goal.turns + 1} goal turn(s) have run. Continue making progress; the same blocker must recur for at least three turns.`
          }
          const blocked = { ...goal, status: 'blocked' as const, updatedAt: Date.now(), lastReason: args.reason }
          await input.store.set(blocked)
          await showToast(input.client, `Goal blocked: ${args.reason}`, 'warning')
          return statusPayload(blocked)
        }
        const claimed = {
          ...goal,
          updatedAt: Date.now(),
          completionClaim: { reason: args.reason, createdAt: Date.now() },
        }
        await input.store.set(claimed)
        return 'Completion claim recorded. An independent evaluator will verify it when this turn ends.'
      },
    }),
  }
}
function createEventHook(input: {
  client: PluginInput['client']
  store: FileGoalStore
  options: ResolvedGoalPluginOptions
  processing: Set<string>
  log: Logger
  controlTurns: Set<string>
}): Hooks['event'] {
  const { client, store, options, processing, log, controlTurns } = input
  return async ({ event }) => {
    if (event.type === 'session.deleted') {
      controlTurns.delete(event.properties.info.id)
      await store.clear(event.properties.info.id)
      return
    }
    if (
      event.type === 'session.error' &&
      event.properties.sessionID &&
      event.properties.error?.name === 'MessageAbortedError'
    ) {
      const goal = await store.get(event.properties.sessionID)
      if (goal?.status === 'active') {
        await store.set({
          ...goal,
          status: 'paused',
          updatedAt: Date.now(),
          lastReason: 'Paused because the session was interrupted.',
        })
        await showToast(client, 'Goal paused after interruption', 'warning')
      }
      return
    }
    if (event.type === 'session.idle') {
      controlTurns.delete(event.properties.sessionID)
      await handleIdle({
        client,
        store,
        sessionId: event.properties.sessionID,
        options,
        processing,
        log,
      })
    }
  }
}
// biome-ignore lint/suspicious/useAwait: The Plugin type requires Promise<Hooks>, so the async modifier is needed even though no await occurs at this level.
const GoalPlugin: Plugin = async (input, rawOptions) => {
  const options = resolveOptions(rawOptions)
  const root = options.stateDirectory ?? defaultStateRoot()
  const store = new FileGoalStore(scopedStateDirectory(root, input.project.id, input.directory))
  const processing = new Set<string>()
  const controlTurns = new Set<string>()
  const log = createLogger(input.client)
  return {
    config: createConfigHook(),
    'command.execute.before': async (command, output) => {
      if (command.command !== 'goal') {
        return
      }
      await runGoalCommand({
        command,
        output,
        store,
        options,
        directory: input.directory,
        controlTurns,
      })
    },
    'experimental.chat.system.transform': async ({ sessionID }, output) => {
      if (!sessionID || controlTurns.has(sessionID)) {
        return
      }
      const goal = await store.get(sessionID)
      if (goal?.status === 'active') {
        output.system.push(activeGoalContext(goal))
      }
    },
    'experimental.session.compacting': async ({ sessionID }, output) => {
      const goal = await store.get(sessionID)
      if (goal?.status === 'active') {
        output.context.push(activeGoalContext(goal))
      }
    },
    tool: createGoalTools({ client: input.client, store }),
    event: createEventHook({
      client: input.client,
      store,
      options,
      processing,
      log,
      controlTurns,
    }),
  }
}
export default GoalPlugin
