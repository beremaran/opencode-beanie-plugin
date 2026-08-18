function patternToRegex(pattern: string): RegExp {
  const source = pattern.replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === "*" ? ".*" : `\\${char}`));

  return new RegExp(`^${source}$`);
}

export function matchesToolFilter(name: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }
  return patterns.some((pattern) => patternToRegex(pattern).test(name));
}
