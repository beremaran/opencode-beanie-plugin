export class TtlCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>()
  private hitCount = 0
  private missCount = 0
  get(key: K): V | undefined {
    const entry = this.store.get(key)
    if (!entry || Date.now() >= entry.expiresAt) {
      if (entry) {
        this.store.delete(key)
      }
      this.missCount++
      return undefined
    }
    this.hitCount++
    return entry.value
  }
  set(key: K, value: V, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
  has(key: K): boolean {
    return this.get(key) !== undefined
  }
  stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hitCount, misses: this.missCount, size: this.store.size }
  }
}
