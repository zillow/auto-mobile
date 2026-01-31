import { describe, it, expect, beforeEach } from "bun:test";
import { TTLCache, DEFAULT_CACHE_OPTIONS } from "../../../src/utils/cache/Cache";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("TTLCache", () => {
  let cache: TTLCache<string, string>;
  let timer: FakeTimer;

  beforeEach(() => {
    timer = new FakeTimer();
    cache = new TTLCache<string, string>(timer, { ttlMs: 1000 });
  });

  describe("basic operations", () => {
    it("sets and gets a value", () => {
      cache.set("key", "value");
      expect(cache.get("key")).toBe("value");
    });

    it("returns undefined for missing keys", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("has() returns true for existing keys", () => {
      cache.set("key", "value");
      expect(cache.has("key")).toBe(true);
    });

    it("has() returns false for missing keys", () => {
      expect(cache.has("nonexistent")).toBe(false);
    });

    it("deletes a key", () => {
      cache.set("key", "value");
      expect(cache.delete("key")).toBe(true);
      expect(cache.get("key")).toBeUndefined();
    });

    it("delete returns false for missing keys", () => {
      expect(cache.delete("nonexistent")).toBe(false);
    });

    it("clears all entries", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get("key1")).toBeUndefined();
    });

    it("reports correct size", () => {
      expect(cache.size()).toBe(0);
      cache.set("key1", "value1");
      expect(cache.size()).toBe(1);
      cache.set("key2", "value2");
      expect(cache.size()).toBe(2);
    });

    it("overwrites existing keys", () => {
      cache.set("key", "value1");
      cache.set("key", "value2");
      expect(cache.get("key")).toBe("value2");
      expect(cache.size()).toBe(1);
    });
  });

  describe("TTL expiration", () => {
    it("returns value before TTL expires", () => {
      cache.set("key", "value");
      timer.advanceTime(500);
      expect(cache.get("key")).toBe("value");
    });

    it("returns undefined after TTL expires", () => {
      cache.set("key", "value");
      timer.advanceTime(1000);
      expect(cache.get("key")).toBeUndefined();
    });

    it("has() returns false after TTL expires", () => {
      cache.set("key", "value");
      timer.advanceTime(1000);
      expect(cache.has("key")).toBe(false);
    });

    it("cleanup removes expired entries", () => {
      cache.set("key1", "value1");
      timer.advanceTime(500);
      cache.set("key2", "value2");
      timer.advanceTime(600); // key1 is now expired, key2 is not

      const evicted = cache.cleanup();
      expect(evicted).toBe(1);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBe("value2");
    });

    it("tracks TTL evictions in stats", () => {
      cache.set("key", "value");
      timer.advanceTime(1000);
      cache.get("key"); // Triggers TTL eviction

      const stats = cache.getStats();
      expect(stats.ttlEvictions).toBe(1);
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest entry when max entries exceeded", () => {
      const limitedCache = new TTLCache<string, string>(timer, {
        ttlMs: 10000,
        maxEntries: 2,
      });

      limitedCache.set("key1", "value1");
      timer.advanceTime(10);
      limitedCache.set("key2", "value2");
      timer.advanceTime(10);
      limitedCache.set("key3", "value3"); // Should evict key1

      expect(limitedCache.get("key1")).toBeUndefined();
      expect(limitedCache.get("key2")).toBe("value2");
      expect(limitedCache.get("key3")).toBe("value3");
    });

    it("evicts least recently used entry", () => {
      const limitedCache = new TTLCache<string, string>(timer, {
        ttlMs: 10000,
        maxEntries: 2,
      });

      limitedCache.set("key1", "value1");
      timer.advanceTime(10);
      limitedCache.set("key2", "value2");
      timer.advanceTime(10);

      // Access key1 to make it most recently used
      limitedCache.get("key1");
      timer.advanceTime(10);

      // Now add key3 - should evict key2 (least recently used)
      limitedCache.set("key3", "value3");

      expect(limitedCache.get("key1")).toBe("value1");
      expect(limitedCache.get("key2")).toBeUndefined();
      expect(limitedCache.get("key3")).toBe("value3");
    });

    it("tracks size evictions in stats", () => {
      const limitedCache = new TTLCache<string, string>(timer, {
        ttlMs: 10000,
        maxEntries: 1,
      });

      limitedCache.set("key1", "value1");
      limitedCache.set("key2", "value2"); // Should evict key1

      const stats = limitedCache.getStats();
      expect(stats.sizeEvictions).toBe(1);
    });
  });

  describe("size-based eviction", () => {
    it("evicts entries when max size exceeded", () => {
      const sizedCache = new TTLCache<string, Buffer>(timer, {
        ttlMs: 10000,
        maxSizeBytes: 100,
      });

      const buf1 = Buffer.alloc(50);
      const buf2 = Buffer.alloc(50);
      const buf3 = Buffer.alloc(50);

      sizedCache.set("key1", buf1, 50);
      timer.advanceTime(10);
      sizedCache.set("key2", buf2, 50);
      timer.advanceTime(10);
      sizedCache.set("key3", buf3, 50); // Should evict key1

      expect(sizedCache.get("key1")).toBeUndefined();
      expect(sizedCache.getCurrentSizeBytes()).toBeLessThanOrEqual(100);
    });

    it("tracks current size correctly", () => {
      const sizedCache = new TTLCache<string, Buffer>(timer, {
        ttlMs: 10000,
        maxSizeBytes: 1000,
      });

      sizedCache.set("key1", Buffer.alloc(100), 100);
      expect(sizedCache.getCurrentSizeBytes()).toBe(100);

      sizedCache.set("key2", Buffer.alloc(200), 200);
      expect(sizedCache.getCurrentSizeBytes()).toBe(300);

      sizedCache.delete("key1");
      expect(sizedCache.getCurrentSizeBytes()).toBe(200);
    });
  });

  describe("statistics", () => {
    it("tracks hits and misses", () => {
      cache.set("key", "value");
      cache.get("key"); // hit
      cache.get("key"); // hit
      cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it("reports correct size in stats", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });
  });

  describe("keys()", () => {
    it("returns all keys", () => {
      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const keys = cache.keys();
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys.length).toBe(2);
    });
  });

  describe("DEFAULT_CACHE_OPTIONS", () => {
    it("has sensible defaults", () => {
      expect(DEFAULT_CACHE_OPTIONS.ttlMs).toBe(60000);
      expect(DEFAULT_CACHE_OPTIONS.maxEntries).toBe(Infinity);
    });
  });
});
