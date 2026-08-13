import type { ModelRef, TranscriptMessage, TranscriptPart } from './types.js'

const TOOL_DETAIL_LIMIT = 4000

function partText(part: TranscriptPart): string | undefined {
  if (part.type === 'text' && part.text?.trim()) {
    return part.text.trim()
  }
  if (part.type === 'tool' && part.tool) {
    const status = part.state?.status ?? 'unknown'
    const detail = part.state?.output?.trim() || part.state?.error?.trim() || part.state?.title?.trim() || ''
    let truncated = detail
    if (detail.length > TOOL_DETAIL_LIMIT) {
      truncated = `${detail.slice(0, TOOL_DETAIL_LIMIT)}…`
    }
    if (truncated) {
      return `[tool ${part.tool} ${status}]\n${truncated}`
    }
    return `[tool ${part.tool} ${status}]`
  }
  if (part.type === 'patch' && part.files && part.files.length > 0) {
    return `[patch]\n${part.files.join('\n')}`
  }
  return undefined
}
export function goalMessages(messages: TranscriptMessage[], startedAt: number): TranscriptMessage[] {
  return messages
    .filter((message) => message.info.time.created >= startedAt)
    .sort((a, b) => a.info.time.created - b.info.time.created)
}
export function buildTranscript(messages: TranscriptMessage[], startedAt: number, maxCharacters: number): string {
  const rendered = goalMessages(messages, startedAt)
    .flatMap((message) => {
      const parts = message.parts.map(partText).filter((value): value is string => Boolean(value))
      if (parts.length === 0) {
        return []
      }
      return [`[${message.info.role}]\n${parts.join('\n')}`]
    })
    .join('\n\n')
  if (rendered.length <= maxCharacters) {
    return rendered
  }
  const marker = '[Earlier goal transcript omitted]\n\n'
  return marker + rendered.slice(-(maxCharacters - marker.length))
}
export function latestAssistant(messages: TranscriptMessage[], startedAt: number): TranscriptMessage | undefined {
  return goalMessages(messages, startedAt)
    .filter((message) => message.info.role === 'assistant')
    .at(-1)
}
export function latestUserExecution(messages: TranscriptMessage[]): { agent?: string; model?: ModelRef } {
  const latest = [...messages]
    .sort((a, b) => a.info.time.created - b.info.time.created)
    .filter((message) => message.info.role === 'user')
    .at(-1)
  const result: { agent?: string; model?: ModelRef } = {}
  if (latest?.info.agent) {
    result.agent = latest.info.agent
  }
  if (latest?.info.model) {
    result.model = latest.info.model
  }
  return result
}
export function totalGoalTokens(messages: TranscriptMessage[], startedAt: number): number {
  return goalMessages(messages, startedAt)
    .filter((message) => message.info.role === 'assistant')
    .reduce((total, message) => {
      const { tokens } = message.info
      if (tokens) {
        return total + tokens.input + tokens.output + tokens.reasoning
      }
      return total
    }, 0)
}
