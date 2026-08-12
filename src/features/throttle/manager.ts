import type { Release } from './queue.js'
import { Semaphore } from './queue.js'

const RECENT_IDLE_TTL_MS = 10_000

export type ThrottleMode = 'session' | 'global'

export interface QueueEventInfo {
  sessionID: string
  callID: string
  description?: string
  position?: number
  running: number
  queued: number
  background: boolean
}

export interface ThrottleManagerOptions {
  maxParallel: number
  mode: ThrottleMode
  maxWaitMs: number
  onWarn?: (message: string) => void
  onQueued?: (info: QueueEventInfo) => void
  onStarted?: (info: QueueEventInfo) => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

type SlotKind = 'foreground' | 'background'

interface Slot {
  release: Release
  kind: SlotKind
  released: boolean
  timer: unknown
  watchedChildSessionID?: string
}

export class ThrottleManager {
  private readonly maxParallel: number
  private readonly mode: ThrottleMode
  private readonly maxWaitMs: number
  private readonly onWarn: (message: string) => void
  private readonly onQueued: (info: QueueEventInfo) => void
  private readonly onStarted: (info: QueueEventInfo) => void
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void
  private readonly sessionSemaphores = new Map<string, Semaphore>()
  private readonly slots = new Map<string, Slot>()
  private readonly watchers = new Map<string, string>()
  private readonly recentlyIdle = new Map<string, unknown>()
  private globalSemaphore: Semaphore | undefined
  private disposed = false

  constructor(options: ThrottleManagerOptions) {
    this.maxParallel = options.maxParallel
    this.mode = options.mode
    this.maxWaitMs = options.maxWaitMs
    this.onWarn = options.onWarn ?? (() => {})
    this.onQueued = options.onQueued ?? (() => {})
    this.onStarted = options.onStarted ?? (() => {})
    this.setTimer = options.setTimer ?? ((fn, ms) => globalThis.setTimeout(fn, ms))
    this.clearTimer =
      options.clearTimer ??
      ((handle) => globalThis.clearTimeout(handle as Parameters<typeof globalThis.clearTimeout>[0]))
  }

  async startTask(sessionId: string, callId: string, isBackground: boolean, description?: string): Promise<void> {
    const semaphore = this.getSemaphore(sessionId)
    const running = semaphore.running
    const queued = semaphore.queued
    const position = queued + 1
    const immediate = running < this.maxParallel

    if (!(immediate || this.disposed)) {
      this.onQueued({
        sessionID: sessionId,
        callID: callId,
        description,
        position,
        running,
        queued: queued + 1,
        background: isBackground,
      })
    }

    const release = await semaphore.acquire()

    if (this.disposed) {
      release()
      return
    }

    if (!immediate) {
      this.onStarted({
        sessionID: sessionId,
        callID: callId,
        description,
        position,
        running: semaphore.running,
        queued: semaphore.queued,
        background: isBackground,
      })
    }

    const key = this.key(sessionId, callId)
    const slot: Slot = { release, kind: isBackground ? 'background' : 'foreground', released: false, timer: undefined }

    this.slots.set(key, slot)
    const timer = this.setTimer(() => {
      if (this.releaseSlot(key)) {
        this.onWarn(`Task ${sessionId}/${callId} was force-released by the watchdog`)
      }
    }, this.maxWaitMs)
    slot.timer = timer
    if (slot.released) {
      this.clearTimer(timer)
    }
  }

  endTask(sessionId: string, callId: string, childSessionId?: string): void {
    const key = this.key(sessionId, callId)
    const slot = this.slots.get(key)

    if (slot === undefined || slot.released) {
      return
    }

    if (slot.kind === 'foreground' || childSessionId === undefined) {
      this.releaseSlot(key)
      return
    }

    if (this.recentlyIdle.has(childSessionId)) {
      this.recentlyIdle.delete(childSessionId)
      this.releaseSlot(key)
      return
    }

    slot.watchedChildSessionID = childSessionId
    this.watchers.set(childSessionId, key)
  }

  onSessionIdle(sessionId: string): void {
    const key = this.watchers.get(sessionId)
    if (key !== undefined) {
      this.watchers.delete(sessionId)
      this.releaseSlot(key)
    }

    let timer: unknown
    timer = this.setTimer(() => {
      if (this.recentlyIdle.get(sessionId) === timer) {
        this.recentlyIdle.delete(sessionId)
      }
    }, RECENT_IDLE_TTL_MS)
    this.recentlyIdle.set(sessionId, timer)
  }

  onToolError(sessionId: string, callId: string): void {
    this.releaseSlot(this.key(sessionId, callId))
  }

  get stats(): { running: number; queued: number } {
    let running = 0
    let queued = 0
    for (const semaphore of this.semaphores()) {
      running += semaphore.running
      queued += semaphore.queued
    }
    return { running, queued }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true

    for (const key of this.slots.keys()) {
      this.releaseSlot(key)
    }
    this.watchers.clear()
    for (const timer of this.recentlyIdle.values()) {
      this.clearTimer(timer)
    }
    this.recentlyIdle.clear()
    this.sessionSemaphores.clear()
    this.globalSemaphore = undefined
  }

  private getSemaphore(sessionId: string): Semaphore {
    if (this.mode === 'global') {
      if (this.globalSemaphore === undefined) {
        this.globalSemaphore = new Semaphore(this.maxParallel)
      }
      return this.globalSemaphore
    }

    let semaphore = this.sessionSemaphores.get(sessionId)
    if (semaphore === undefined) {
      semaphore = new Semaphore(this.maxParallel)
      this.sessionSemaphores.set(sessionId, semaphore)
    }
    return semaphore
  }

  private releaseSlot(key: string): boolean {
    const slot = this.slots.get(key)
    if (slot === undefined || slot.released) {
      return false
    }

    slot.released = true
    this.clearTimer(slot.timer)
    this.slots.delete(key)

    if (slot.watchedChildSessionID !== undefined) {
      const watchedKey = this.watchers.get(slot.watchedChildSessionID)
      if (watchedKey === key) {
        this.watchers.delete(slot.watchedChildSessionID)
      }
    }

    slot.release()
    return true
  }

  private *semaphores(): Iterable<Semaphore> {
    if (this.globalSemaphore !== undefined) {
      yield this.globalSemaphore
    }
    yield* this.sessionSemaphores.values()
  }

  private key(sessionId: string, callId: string): string {
    return `${sessionId}:${callId}`
  }
}
