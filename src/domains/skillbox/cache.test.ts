import {describe, expect, test} from "bun:test";
import {TtlCache} from "./cache";

describe("TtlCache", () => {
  test("stores and retrieves values within TTL", () => {
    const cache = new TtlCache<string, number>();

    cache.set("a", 1, 10_000);
    expect(cache.get("a")).toBe(1);
    expect(cache.stats()).toEqual({ hits: 1, misses: 0, size: 1 });
    expect(cache.has("a")).toBe(true);
    expect(cache.stats()).toEqual({ hits: 2, misses: 0, size: 1 });
  });

  test("expires items when TTL passes", () => {
    const cache = new TtlCache<string, string>();

    cache.set("k", "v", -10);
    expect(cache.has("k")).toBe(false);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.stats()).toEqual({ hits: 0, misses: 2, size: 0 });
  });

  test("clears stored entries", () => {
    const cache = new TtlCache<string, number>();

    cache.set("a", 1, 10_000);
    cache.set("b", 2, 10_000);
    cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
