declare module 'node:crypto' {
  export function randomUUID(): string
  export function createHash(algorithm: string): { update: (value: string) => { digest: (encoding: 'hex') => string } }
}

declare module 'node:os' {
  export function homedir(): string
}

declare module 'node:path' {
  const path: { join: (...parts: string[]) => string }
  export function join(...parts: string[]): string
  export function dirname(path: string): string
  export default path
}

declare module 'node:fs/promises' {
  export function mkdir(path: string, options?: { recursive?: boolean; mode?: number }): Promise<void>
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function rename(oldPath: string, newPath: string): Promise<void>
  export function unlink(path: string): Promise<void>
  export function writeFile(path: string, data: string, options?: { encoding?: string; mode?: number }): Promise<void>
}

declare const process: { env: Record<string, string | undefined> }

declare namespace NodeJS {
  interface ErrnoException extends Error {
    code?: string
  }
}
