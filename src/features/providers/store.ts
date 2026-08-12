import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Logger, ProviderSource, StoreFile } from './types.js'

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

export function loadStore(path: string, logger: Logger): { providers: ProviderSource[] } {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      logger('warn', `Failed to read provider store "${path}": ${String(error)}`)
    }
    return { providers: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    logger('warn', `Provider store "${path}" is not valid JSON: ${String(error)}`)
    return { providers: [] }
  }
  if (!(isRecord(parsed) && Array.isArray(parsed.providers))) {
    logger('warn', `Provider store "${path}" has an unexpected shape; ignoring it`)
    return { providers: [] }
  }
  const providers: ProviderSource[] = []
  const skipped: string[] = []
  for (const entry of parsed.providers) {
    if (validateProviderSource(entry)) {
      providers.push(entry)
    } else {
      skipped.push(isRecord(entry) && typeof entry.id === 'string' ? entry.id : '(unnamed)')
    }
  }
  if (skipped.length > 0) {
    logger('warn', `Skipped ${skipped.length} malformed provider entry/entries in "${path}"`, { skipped })
  }
  return { providers }
}

export function saveStore(path: string, store: StoreFile, logger: Logger): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
    renameSync(tmp, path)
  } catch (error) {
    logger('error', `Failed to write provider store "${path}": ${String(error)}`)
  }
}
