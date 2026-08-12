import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const PLUGIN_NAME = 'opencode-beanie-plugin'
const PLUGIN_QUOTED = `"${PLUGIN_NAME}"`
const isWhitespace = (char: string | undefined): boolean => char !== undefined && /\s/.test(char)

export function globalConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return join(xdg || join(homedir(), '.config'), 'opencode', 'opencode.json')
}

export function projectConfigPaths(worktree: string): string[] {
  return [
    join(worktree, 'opencode.json'),
    join(worktree, 'opencode.jsonc'),
    join(worktree, '.opencode', 'opencode.json'),
  ]
}

export function candidateConfigPaths(worktree: string): string[] {
  return [...projectConfigPaths(worktree), globalConfigPath()]
}

export function readConfigFile(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null
  } catch {
    return null
  }
}

export function writeConfigFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, path)
}

export type ConfigScope = 'auto' | 'project' | 'global'

export function resolveTargetPath(worktree: string, scope: ConfigScope = 'auto'): string {
  const candidates =
    scope === 'global'
      ? [globalConfigPath()]
      : scope === 'project'
        ? projectConfigPaths(worktree)
        : candidateConfigPaths(worktree)
  for (const path of candidates) {
    const text = readConfigFile(path)
    if (text?.includes(PLUGIN_QUOTED)) {
      return path
    }
  }
  for (const path of candidates) {
    if (existsSync(path)) {
      return path
    }
  }
  return candidates[0] ?? join(worktree, 'opencode.json')
}

function findMatching(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = open; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === openChar) {
      depth += 1
    } else if (char === closeChar) {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

export function findPluginEntrySpan(text: string): [number, number] | null {
  const nameIndex = text.indexOf(PLUGIN_NAME)
  if (nameIndex === -1) {
    return null
  }
  let start = nameIndex
  while (start > 0 && text[start] !== '"') {
    start -= 1
  }
  if (text[start] !== '"') {
    return null
  }
  let end = start + 1
  while (end < text.length && text[end] !== '"') {
    if (text[end] === '\\') {
      end += 1
    }
    end += 1
  }
  if (end >= text.length) {
    return null
  }
  end += 1
  let i = end
  while (isWhitespace(text[i])) {
    i += 1
  }
  if (text[i] !== ',') {
    return [start, end]
  }
  i += 1
  while (isWhitespace(text[i])) {
    i += 1
  }
  if (text[i] !== '{') {
    return [start, end]
  }
  const objectEnd = findMatching(text, i, '{', '}')
  if (objectEnd === -1) {
    return null
  }
  let close = objectEnd + 1
  let after = objectEnd + 1
  while (isWhitespace(text[after])) {
    after += 1
  }
  if (text[after] === ']') {
    close = after + 1
  }
  let begin = start
  let before = start - 1
  while (before >= 0 && isWhitespace(text[before])) {
    before -= 1
  }
  if (text[before] === '[') {
    begin = before
  }
  return [begin, close]
}

export function findPluginArrayOpen(text: string): number | null {
  const needle = '"plugin"'
  let from = 0
  for (;;) {
    const idx = text.indexOf(needle, from)
    if (idx === -1) {
      return null
    }
    let i = idx + needle.length
    while (isWhitespace(text[i])) {
      i += 1
    }
    if (text[i] === ':') {
      i += 1
      while (isWhitespace(text[i])) {
        i += 1
      }
      if (text[i] === '[') {
        return i
      }
    }
    from = idx + 1
  }
}

export function upsertPluginEntry(text: string, options: Record<string, unknown>): string {
  const entryText = Object.keys(options).length === 0 ? PLUGIN_QUOTED : JSON.stringify([PLUGIN_NAME, options])
  const existing = findPluginEntrySpan(text)
  if (existing) {
    return `${text.slice(0, existing[0])}${entryText}${text.slice(existing[1])}`
  }
  const arrayOpen = findPluginArrayOpen(text)
  if (arrayOpen !== null) {
    const arrayClose = findMatching(text, arrayOpen, '[', ']')
    if (arrayClose === -1) {
      throw new Error('Could not locate the end of the plugin array.')
    }
    const inner = text.slice(arrayOpen + 1, arrayClose)
    const needsComma = inner.trim() !== '' && !inner.trimEnd().endsWith(',')
    return `${text.slice(0, arrayClose)}${needsComma ? ',' : ''}${inner.trim() === '' ? '' : ' '}${entryText}${text.slice(arrayClose)}`
  }
  const objectOpen = text.indexOf('{')
  if (objectOpen === -1) {
    throw new Error('Could not locate the top-level object of the config file.')
  }
  const objectClose = findMatching(text, objectOpen, '{', '}')
  if (objectClose === -1) {
    throw new Error('Could not locate the top-level object of the config file.')
  }
  const head = text.slice(objectOpen + 1, objectClose).trimEnd()
  const tail = text.slice(objectClose)
  const needsComma = head.trim() !== '' && !head.trimEnd().endsWith(',')
  return `${text.slice(0, objectOpen + 1)}${head}${needsComma ? ',' : ''}\n  "plugin": [${entryText}]\n${tail}`
}

export interface ApplyResult {
  path: string
  created: boolean
  changed: boolean
}
export function applyOptionsToFile(
  worktree: string,
  scope: ConfigScope,
  options: Record<string, unknown>,
): ApplyResult {
  const path = resolveTargetPath(worktree, scope)
  const before = readConfigFile(path)
  const created = before === null
  const text = upsertPluginEntry(before ?? '{}', options)
  writeConfigFile(path, text)
  return { path, created, changed: text !== before }
}
