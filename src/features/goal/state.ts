import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { GOAL_STATUSES, type GoalState } from './types.js'
export interface GoalStore {
  get: (sessionId: string) => Promise<GoalState | undefined>
  set: (goal: GoalState) => Promise<void>
  clear: (sessionId: string) => Promise<void>
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function optionalPositiveInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isSafeInteger(value) && Number(value) > 0)
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
function safeSegment(value: string): string {
  return /^[a-zA-Z0-9._-]+$/.test(value) ? value : createHash('sha256').update(value).digest('hex').slice(0, 24)
}
export function defaultStateRoot(): string {
  const xdg = process.env.XDG_STATE_HOME?.trim()
  return xdg ? path.join(xdg, 'opencode-goal') : path.join(homedir(), '.local', 'state', 'opencode-goal')
}
export function scopedStateDirectory(root: string, projectId: string | undefined, directory: string): string {
  return path.join(root, safeSegment(projectId?.trim() || directory))
}
export class FileGoalStore implements GoalStore {
  constructor(private readonly directory: string) {}
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
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
export class MemoryGoalStore implements GoalStore {
  private readonly values = new Map<string, GoalState>()
  async get(sessionId: string): Promise<GoalState | undefined> {
    return this.values.get(sessionId)
  }
  async set(goal: GoalState): Promise<void> {
    this.values.set(goal.sessionId, structuredClone(goal))
  }
  async clear(sessionId: string): Promise<void> {
    this.values.delete(sessionId)
  }
}
