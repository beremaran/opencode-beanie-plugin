const KEY_RE = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/
const NEWLINE_RE = /\r?\n/
const HEADING_RE = /^#+\s*/
const MAX_DESC_CHARS = 300
function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed[0] === '"' && trimmed.at(-1) === '"') || (trimmed[0] === "'" && trimmed.at(-1) === "'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const lines = content.split(NEWLINE_RE)
  if (lines[0]?.trim() !== '---') {
    return {}
  }
  const result: { name?: string; description?: string } = {}
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') {
      break
    }
    const match = line.match(KEY_RE)
    if (match) {
      if (match[1] === 'name') {
        result.name = stripQuotes(match[2])
      }
      if (match[1] === 'description') {
        result.description = stripQuotes(match[2])
      }
    }
  }
  return result
}
export function extractDescription(content: string): string {
  const lines = content.split(NEWLINE_RE)
  const parsed = parseSkillFrontmatter(content)
  if (parsed.description) {
    return parsed.description.slice(0, MAX_DESC_CHARS)
  }
  let inFrontmatter = lines[0]?.trim() === '---'
  let start = 0
  if (inFrontmatter) {
    start = 1
  }
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i]
    if (inFrontmatter) {
      if (line.trim() === '---') {
        inFrontmatter = false
      }
    } else {
      if (line.startsWith('#')) {
        return line.replace(HEADING_RE, '').trim().slice(0, MAX_DESC_CHARS)
      }
      if (line.trim()) {
        return line.trim().slice(0, MAX_DESC_CHARS)
      }
    }
  }
  return ''
}
