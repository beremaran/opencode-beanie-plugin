export function matchesToolFilter(name: string, patterns: string[]) {
  return (
    !patterns.length ||
    patterns.some((pattern) =>
      new RegExp(
        `^${[...pattern].map((char) => (char === '*' ? '.*' : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`,
      ).test(name),
    )
  )
}
