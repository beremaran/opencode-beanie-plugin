// biome-ignore lint/style/noExcessiveClassesPerFile: FileGoalStore and MemoryGoalStore are the two interchangeable GoalStore implementations; extracting either into its own file would fragment a trivial interface.
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { GOAL_STATUSES, type GoalState } from './types.js'

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function optionalPositiveInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isSafeInteger(value) && Number(value) > 0)
}
function safeSegment(value: string): string {
  if (SAFE_SEGMENT_RE.test(value)) {
    return value
  }
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}
function isNodeError(error: unknown): error is nodejs.ErrnoException {
  return error instanceof Error && 'code' in error
}
export interface GoalStore {
  get: (sessionId: string) => Promise<GoalState | undefined>
  set: (goal: GoalState) => Promise<void>
  clear: (sessionId: string) => Promise<void>
}
export function parseGoalState(value: unknown): GoalState | undefined {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.goalId !== 'string' ||
    !value.goalId ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    typeof value.directory !== 'string' ||
    typeof value.objective !== 'string' ||
    !value.objective.trim()
  ) {
    return undefined
  }
  if (typeof value.status !== 'string' || !GOAL_STATUSES.includes(value.status as GoalState['status'])) {
    return undefined
  }
  if (
    !(Number.isFinite(value.createdAt) && Number.isFinite(value.updatedAt) && Number.isSafeInteger(value.turns)) ||
    Number(value.turns) < 0 ||
    !Number.isSafeInteger(value.tokensUsed) ||
    Number(value.tokensUsed) < 0 ||
    !optionalPositiveInteger(value.tokenBudget) ||
    !optionalPositiveInteger(value.maxTurns)
  ) {
    return undefined
  }
  return value as unknown as GoalState
}
export function defaultStateRoot(): string {
  const xdg = process.env.XDG_STATE_HOME?.trim()
  if (xdg) {
    return path.join(xdg, 'opencode-goal')
  }
  return path.join(homedir(), '.local', 'state', 'opencode-goal')
}
export function scopedStateDirectory(root: string, projectId: string | undefined, directory: string): string {
  return path.join(root, safeSegment(projectId?.trim() || directory))
}
export class FileGoalStore implements GoalStore {
  private readonly directory: string
  constructor(directory: string) {
    this.directory = directory
  }
  private file(sessionId: string): string {
    return path.join(this.directory, `${safeSegment(sessionId)}.json`)
  }
  async get(sessionId: string): Promise<GoalState | undefined> {
    try {
      return parseGoalState(JSON.parse(await readFile(this.file(sessionId), 'utf8')))
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return undefined
      }
      return undefined
    }
  }
  async set(goal: GoalState): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const destination = this.file(goal.sessionId)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(goal, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, destination)
  }
  async clear(sessionId: string): Promise<void> {
    try {
      await unlink(this.file(sessionId))
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }
}
export class MemoryGoalStore implements GoalStore {
  private readonly values = new Map<string, GoalState>()
  // biome-ignore lint/suspicious/useAwait: GoalStore requires Promise-returning methods; the memory backend is synchronous.
  async get(sessionId: string): Promise<GoalState | undefined> {
    return this.values.get(sessionId)
  }
  // biome-ignore lint/suspicious/useAwait: GoalStore requires Promise-returning methods; the memory backend is synchronous.
  async set(goal: GoalState): Promise<void> {
    this.values.set(goal.sessionId, structuredClone(goal))
  }
  // biome-ignore lint/suspicious/useAwait: GoalStore requires Promise-returning methods; the memory backend is synchronous.
  async clear(sessionId: string): Promise<void> {
    this.values.delete(sessionId)
  }
}
