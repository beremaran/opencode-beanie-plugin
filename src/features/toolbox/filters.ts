export function matchesToolFilter(name: string, patterns: string[]) {
  if (patterns.length === 0) {
    return true
  }
  return patterns.some((pattern) => {
    const source = [...pattern]
      .map((char) => {
        if (char === '*') {
          return '.*'
        }
        return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      })
      .join('')
    return new RegExp(`^${source}$`).test(name)
  })
}
