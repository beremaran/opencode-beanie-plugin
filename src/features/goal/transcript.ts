import type { ModelRef, TranscriptMessage, TranscriptPart } from './types.js'

function partText(part: TranscriptPart): string | undefined {
  if (part.type === 'text' && part.text?.trim()) {
    return part.text.trim()
  }
  if (part.type === 'tool' && part.tool) {
    const status = part.state?.status ?? 'unknown'
    const detail = part.state?.output?.trim() || part.state?.error?.trim() || part.state?.title?.trim() || ''
    const truncated = detail.length > 4000 ? `${detail.slice(0, 4000)}…` : detail
    return `[tool ${part.tool} ${status}]${truncated ? `\n${truncated}` : ''}`
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
    .map((message) => {
      const parts = message.parts.map(partText).filter((value): value is string => Boolean(value))
      return parts.length === 0 ? undefined : `[${message.info.role}]\n${parts.join('\n')}`
    })
    .filter((value): value is string => Boolean(value))
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
      const tokens = message.info.tokens
      return tokens ? total + tokens.input + tokens.output + tokens.reasoning : total
    }, 0)
}
