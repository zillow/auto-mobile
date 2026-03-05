import { Timer, defaultTimer } from "../SystemTimer";

/**
 * Configuration for cache behavior.
 */
interface CacheOptions {
  /**
   * Time-to-live in milliseconds.
   * Entries older than this will be considered expired.
   * Default: 60000 (1 minute)
   */
  ttlMs?: number;

  /**
   * Maximum number of entries in the cache.
   * When exceeded, oldest entries are evicted (LRU).
   * Default: unlimited
   */
  maxEntries?: number;

  /**
   * Maximum total size in bytes (for size-aware caches).
   * Default: unlimited
   */
  maxSizeBytes?: number;
}

/**
 * Entry stored in the cache with metadata.
 */
interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry was last accessed */
  lastAccessedAt: number;
  /** Size in bytes (if tracked) */
  sizeBytes?: number;
}

/**
 * Statistics about cache performance.
 */
interface CacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of entries currently in cache */
  size: number;
  /** Number of entries evicted due to TTL */
  ttlEvictions: number;
  /** Number of entries evicted due to size limits */
  sizeEvictions: number;
}

/**
 * Generic cache interface.
 */
interface Cache<K, V> {
  /**
   * Get a value from the cache.
   * Returns undefined if not found or expired.
   */
  get(key: K): V | undefined;

  /**
   * Set a value in the cache.
   * @param key - Cache key
   * @param value - Value to cache
   * @param sizeBytes - Optional size hint for size-aware caches
   */
  set(key: K, value: V, sizeBytes?: number): void;

  /**
   * Check if a key exists and is not expired.
   */
  has(key: K): boolean;

  /**
   * Delete a specific entry.
   */
  delete(key: K): boolean;

  /**
   * Clear all entries.
   */
  clear(): void;

  /**
   * Get the number of entries in the cache.
   */
  size(): number;

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats;

  /**
   * Remove expired entries.
   * Called automatically on get/set, but can be called manually.
   */
  cleanup(): number;
}

/**
 * Default cache options.
 */
export const DEFAULT_CACHE_OPTIONS: Required<Omit<CacheOptions, "maxSizeBytes">> = {
  ttlMs: 60000, // 1 minute
  maxEntries: Infinity,
};

/**
 * TTL-based cache implementation with LRU eviction.
 */
export class TTLCache<K, V> implements Cache<K, V> {
  private readonly entries: Map<K, CacheEntry<V>> = new Map();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxSizeBytes: number;
  private currentSizeBytes: number = 0;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    ttlEvictions: 0,
    sizeEvictions: 0,
  };

  constructor(
    private readonly timer: Timer = defaultTimer,
    options?: CacheOptions
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_CACHE_OPTIONS.ttlMs;
    this.maxEntries = options?.maxEntries ?? DEFAULT_CACHE_OPTIONS.maxEntries;
    this.maxSizeBytes = options?.maxSizeBytes ?? Infinity;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    const now = this.timer.now();
    if (now - entry.createdAt >= this.ttlMs) {
      // Entry has expired
      this.entries.delete(key);
      this.currentSizeBytes -= entry.sizeBytes ?? 0;
      this.stats.ttlEvictions++;
      this.stats.misses++;
      this.updateSizeStats();
      return undefined;
    }

    // Update last access time for LRU
    entry.lastAccessedAt = now;
    this.stats.hits++;
    return entry.value;
  }

  set(key: K, value: V, sizeBytes?: number): void {
    const now = this.timer.now();

    // Remove existing entry if present
    const existing = this.entries.get(key);
    if (existing) {
      this.currentSizeBytes -= existing.sizeBytes ?? 0;
      this.entries.delete(key);
    }

    // Check size constraints
    if (sizeBytes !== undefined && this.maxSizeBytes !== Infinity) {
      // Evict entries if needed to make room
      while (
        this.currentSizeBytes + sizeBytes > this.maxSizeBytes &&
        this.entries.size > 0
      ) {
        this.evictOldest();
        this.stats.sizeEvictions++;
      }
    }

    // Check entry count constraints (guard against maxEntries <= 0)
    while (this.maxEntries > 0 && this.entries.size >= this.maxEntries && this.entries.size > 0) {
      this.evictOldest();
      this.stats.sizeEvictions++;
    }

    // Skip caching if maxEntries is 0 or negative (caching disabled)
    if (this.maxEntries <= 0) {
      return;
    }

    // Add new entry
    const entry: CacheEntry<V> = {
      value,
      createdAt: now,
      lastAccessedAt: now,
      sizeBytes,
    };

    this.entries.set(key, entry);
    this.currentSizeBytes += sizeBytes ?? 0;
    this.updateSizeStats();
  }

  has(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }

    const now = this.timer.now();
    if (now - entry.createdAt >= this.ttlMs) {
      this.entries.delete(key);
      this.currentSizeBytes -= entry.sizeBytes ?? 0;
      this.stats.ttlEvictions++;
      this.updateSizeStats();
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.sizeBytes ?? 0;
      this.entries.delete(key);
      this.updateSizeStats();
      return true;
    }
    return false;
  }

  clear(): void {
    this.entries.clear();
    this.currentSizeBytes = 0;
    this.updateSizeStats();
  }

  size(): number {
    return this.entries.size;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  cleanup(): number {
    const now = this.timer.now();
    let evicted = 0;

    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt >= this.ttlMs) {
        this.entries.delete(key);
        this.currentSizeBytes -= entry.sizeBytes ?? 0;
        this.stats.ttlEvictions++;
        evicted++;
      }
    }

    this.updateSizeStats();
    return evicted;
  }

  /**
   * Get the current total size in bytes.
   */
  getCurrentSizeBytes(): number {
    return this.currentSizeBytes;
  }

  /**
   * Get all keys currently in the cache.
   */
  keys(): K[] {
    return Array.from(this.entries.keys());
  }

  private evictOldest(): void {
    let oldestKey: K | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      const entry = this.entries.get(oldestKey);
      if (entry) {
        this.currentSizeBytes -= entry.sizeBytes ?? 0;
      }
      this.entries.delete(oldestKey);
    }
  }

  private updateSizeStats(): void {
    this.stats.size = this.entries.size;
  }
}

/**
 * Create a TTL cache with the default timer.
 */
