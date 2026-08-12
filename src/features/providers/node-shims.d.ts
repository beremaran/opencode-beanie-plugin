declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
  export function readFileSync(path: string, encoding: string): string
  export function renameSync(oldPath: string, newPath: string): void
  export function writeFileSync(path: string, data: string, encoding: string): void
}
