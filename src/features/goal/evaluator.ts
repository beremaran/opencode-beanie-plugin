import type { PluginInput } from '@opencode-ai/plugin'
import { EVALUATOR_SYSTEM_PROMPT, evaluatorPrompt } from './prompts.js'
import { buildTranscript, latestUserExecution } from './transcript.js'
import type { EvaluationDecision, GoalState, ModelRef, ResolvedGoalPluginOptions, TranscriptMessage } from './types.js'

type OpenCodeClient = PluginInput['client']

const FENCED_EVAL_RE = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i
const BRACE_OBJECT_RE = /\{[\s\S]*\}/

function responseText(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return ''
  }
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string',
    )
    .map((part) => part.text)
    .join('\n')
}

async function evaluatorModel(
  client: OpenCodeClient,
  messages: TranscriptMessage[],
  configured: string | undefined,
): Promise<ModelRef | undefined> {
  const explicit = parseModelRef(configured)
  if (explicit) {
    return explicit
  }
  try {
    const small = parseModelRef((await client.config.get()).data?.small_model)
    if (small) {
      return small
    }
  } catch {
    // fall through to the latest user execution model
  }
  return latestUserExecution(messages).model
}

export function parseModelRef(value: string | undefined): ModelRef | undefined {
  if (!value) {
    return undefined
  }
  const [providerId, ...modelParts] = value.split('/')
  const modelId = modelParts.join('/')
  if (providerId && modelId) {
    return { providerId, modelId }
  }
  return undefined
}

export function parseEvaluation(text: string): EvaluationDecision | undefined {
  const trimmed = text.trim()
  const fenced = trimmed.match(FENCED_EVAL_RE)?.[1]
  const candidate = fenced ?? trimmed.match(BRACE_OBJECT_RE)?.[0]
  if (!candidate) {
    return undefined
  }
  try {
    const value = JSON.parse(candidate) as Record<string, unknown>
    if (typeof value.complete === 'boolean' && typeof value.reason === 'string' && value.reason.trim()) {
      return { complete: value.complete, reason: value.reason.trim() }
    }
    return undefined
  } catch {
    return undefined
  }
}

export interface EvaluateGoalInput {
  client: OpenCodeClient
  parentSessionId: string
  goal: GoalState
  messages: TranscriptMessage[]
  options: ResolvedGoalPluginOptions
}

export async function evaluateGoal(input: EvaluateGoalInput): Promise<EvaluationDecision> {
  const transcript = buildTranscript(input.messages, input.goal.createdAt, input.options.maxTranscriptChars)
  const model = await evaluatorModel(input.client, input.messages, input.options.evaluatorModel)
  const created = await input.client.session.create({
    // biome-ignore lint/style/useNamingConvention: parentID is the OpenCode SDK body field for the parent session.
    body: { parentID: input.parentSessionId, title: `[goal evaluator] ${input.goal.objective.slice(0, 60)}` },
  })
  const evaluatorSessionId = created.data?.id
  if (!evaluatorSessionId) {
    return {
      complete: false,
      reason: 'Completion evaluation could not start; continue and surface clearer verification evidence.',
      error: true,
    }
  }
  try {
    const body: {
      system: string
      tools: Record<string, boolean>
      parts: Array<{ type: 'text'; text: string }>
      // biome-ignore lint/style/useNamingConvention: providerID/modelID are the OpenCode SDK model reference fields.
      model?: { providerID: string; modelID: string }
      agent?: string
    } = {
      system: EVALUATOR_SYSTEM_PROMPT,
      tools: { '*': false },
      parts: [{ type: 'text', text: evaluatorPrompt(input.goal, transcript) }],
    }
    if (model) {
      // biome-ignore lint/style/useNamingConvention: providerID/modelID are the OpenCode SDK model reference fields.
      body.model = { providerID: model.providerId, modelID: model.modelId }
    }
    if (input.options.evaluatorAgent) {
      body.agent = input.options.evaluatorAgent
    }
    const response = await input.client.session.prompt({ path: { id: evaluatorSessionId }, body })
    if (response.error) {
      return {
        complete: false,
        reason: 'Completion evaluation failed because the evaluator model returned an error.',
        error: true,
      }
    }
    return (
      parseEvaluation(responseText(response.data?.parts)) ?? {
        complete: false,
        reason: 'The evaluator returned no valid decision; continue and surface explicit completion evidence.',
        error: true,
      }
    )
  } catch {
    return {
      complete: false,
      reason: 'Completion evaluation failed; continue and surface explicit verification evidence.',
      error: true,
    }
  } finally {
    if (input.options.deleteEvaluatorSessions) {
      await input.client.session.delete({ path: { id: evaluatorSessionId } }).catch(() => undefined)
    }
  }
}
