import type { ProviderSource } from './types.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function validateProviderSource(value: unknown): value is ProviderSource {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    value.id.trim() !== '' &&
    typeof value.baseURL === 'string' &&
    /^https?:\/\//.test(value.baseURL.trim())
  )
}
