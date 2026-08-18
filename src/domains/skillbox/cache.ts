interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();

  private hitCount = 0;

  private missCount = 0;

  get(key: K): V | undefined {
    const entry = this.store.get(key);

    if (!entry || Date.now() >= entry.expiresAt) {
      if (entry) {
        this.store.delete(key);
      }
      this.missCount += 1;

      return undefined;
    }
    this.hitCount += 1;

    return entry.value;
  }

  set(key: K, value: V, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  stats(): { hits: number; misses: number; size: number } {
    return {
      hits: this.hitCount,
      misses: this.missCount,
      size: this.store.size,
    };
  }
}
