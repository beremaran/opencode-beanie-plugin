const KEY_RE = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/
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
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return {}
  }
  const result: { name?: string; description?: string } = {}
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') {
      break
    }
    const match = line.match(KEY_RE)
    if (!match) {
      continue
    }
    if (match[1] === 'name') {
      result.name = stripQuotes(match[2])
    }
    if (match[1] === 'description') {
      result.description = stripQuotes(match[2])
    }
  }
  return result
}
export function extractDescription(content: string): string {
  const lines = content.split(/\r?\n/)
  const parsed = parseSkillFrontmatter(content)
  if (parsed.description) {
    return parsed.description.slice(0, 300)
  }
  let frontmatter = lines[0]?.trim() === '---'
  for (let i = frontmatter ? 1 : 0; i < lines.length; i++) {
    const line = lines[i]
    if (frontmatter) {
      if (line.trim() === '---') {
        frontmatter = false
      }
      continue
    }
    if (line.startsWith('#')) {
      return line
        .replace(/^#+\s*/, '')
        .trim()
        .slice(0, 300)
    }
    if (line.trim()) {
      return line.trim().slice(0, 300)
    }
  }
  return ''
}
