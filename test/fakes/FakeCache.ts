import { Cache, CacheStats } from "../../src/utils/cache/Cache";

/**
 * Recorded cache operation for verification.
 */
export interface CacheOperation {
  type: "get" | "set" | "has" | "delete" | "clear" | "cleanup";
  key?: unknown;
  value?: unknown;
  result?: unknown;
  timestamp: number;
}

/**
 * Fake Cache implementation for testing.
 * Provides full control over cache behavior and records all operations.
 */
export class FakeCache<K, V> implements Cache<K, V> {
  private data: Map<K, V> = new Map();
  private operations: CacheOperation[] = [];
  private simulateExpired: Set<K> = new Set();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    ttlEvictions: 0,
    sizeEvictions: 0,
  };

  /**
   * Get a value from the fake cache.
   */
  get(key: K): V | undefined {
    const isExpired = this.simulateExpired.has(key);
    const value = isExpired ? undefined : this.data.get(key);

    this.operations.push({
      type: "get",
      key,
      result: value,
      timestamp: Date.now(),
    });

    if (value !== undefined) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
      if (isExpired) {
        this.stats.ttlEvictions++;
        this.data.delete(key);
        this.simulateExpired.delete(key);
      }
    }

    this.stats.size = this.data.size;
    return value;
  }

  /**
   * Set a value in the fake cache.
   */
  set(key: K, value: V, _sizeBytes?: number): void {
    this.operations.push({
      type: "set",
      key,
      value,
      timestamp: Date.now(),
    });

    this.data.set(key, value);
    this.simulateExpired.delete(key);
    this.stats.size = this.data.size;
  }

  /**
   * Check if a key exists in the fake cache.
   */
  has(key: K): boolean {
    const isExpired = this.simulateExpired.has(key);
    const result = !isExpired && this.data.has(key);

    this.operations.push({
      type: "has",
      key,
      result,
      timestamp: Date.now(),
    });

    if (isExpired && this.data.has(key)) {
      this.stats.ttlEvictions++;
      this.data.delete(key);
      this.simulateExpired.delete(key);
      this.stats.size = this.data.size;
    }

    return result;
  }

  /**
   * Delete a key from the fake cache.
   */
  delete(key: K): boolean {
    const result = this.data.delete(key);
    this.simulateExpired.delete(key);

    this.operations.push({
      type: "delete",
      key,
      result,
      timestamp: Date.now(),
    });

    this.stats.size = this.data.size;
    return result;
  }

  /**
   * Clear the fake cache.
   */
  clear(): void {
    this.operations.push({
      type: "clear",
      timestamp: Date.now(),
    });

    this.data.clear();
    this.simulateExpired.clear();
    this.stats.size = 0;
  }

  /**
   * Get the size of the fake cache.
   */
  size(): number {
    return this.data.size;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Simulate cleanup (no-op for fake).
   */
  cleanup(): number {
    this.operations.push({
      type: "cleanup",
      timestamp: Date.now(),
    });

    let evicted = 0;
    for (const key of this.simulateExpired) {
      if (this.data.delete(key)) {
        evicted++;
        this.stats.ttlEvictions++;
      }
    }
    this.simulateExpired.clear();
    this.stats.size = this.data.size;
    return evicted;
  }

  // Test helper methods

  /**
   * Simulate a key being expired.
   */
  simulateExpiry(key: K): void {
    this.simulateExpired.add(key);
  }

  /**
   * Check if a key was accessed via get().
   */
  wasKeyAccessed(key: K): boolean {
    return this.operations.some(
      op => op.type === "get" && op.key === key
    );
  }

  /**
   * Check if a key was set.
   */
  wasKeySet(key: K): boolean {
    return this.operations.some(
      op => op.type === "set" && op.key === key
    );
  }

  /**
   * Get all recorded operations.
   */
  getOperations(): CacheOperation[] {
    return [...this.operations];
  }

  /**
   * Get operations of a specific type.
   */
  getOperationsByType(type: CacheOperation["type"]): CacheOperation[] {
    return this.operations.filter(op => op.type === type);
  }

  /**
   * Get the number of get operations.
   */
  getGetCount(): number {
    return this.getOperationsByType("get").length;
  }

  /**
   * Get the number of set operations.
   */
  getSetCount(): number {
    return this.getOperationsByType("set").length;
  }

  /**
   * Clear the operation history.
   */
  clearHistory(): void {
    this.operations = [];
  }

  /**
   * Reset the fake cache to initial state.
   */
  reset(): void {
    this.data.clear();
    this.operations = [];
    this.simulateExpired.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      ttlEvictions: 0,
      sizeEvictions: 0,
    };
  }

  /**
   * Pre-populate the cache with data (for testing).
   */
  populate(entries: Map<K, V>): void {
    for (const [key, value] of entries) {
      this.data.set(key, value);
    }
    this.stats.size = this.data.size;
  }

  /**
   * Get all keys currently in the cache.
   */
  keys(): K[] {
    return Array.from(this.data.keys());
  }

  /**
   * Get all values currently in the cache.
   */
  values(): V[] {
    return Array.from(this.data.values());
  }
}
