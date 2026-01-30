import { NavigationRepository } from "../../db/NavigationRepository";
import { logger } from "../../utils/logger";

/**
 * Cache entry for navigation node lookup
 */
interface NodeCacheEntry {
  nodeId: number | null;
  timestamp: number;
}

/**
 * Utility for looking up navigation node IDs from app/screen name pairs.
 * Includes caching to avoid repeated database queries.
 */
export class NavigationNodeLookup {
  private repository: NavigationRepository;
  private cache: Map<string, NodeCacheEntry> = new Map();
  private readonly cacheMaxAgeMs: number;

  constructor(
    repository?: NavigationRepository,
    cacheMaxAgeMs: number = 60000 // 1 minute default
  ) {
    this.repository = repository ?? new NavigationRepository();
    this.cacheMaxAgeMs = cacheMaxAgeMs;
  }

  /**
   * Get the node ID for a given app and screen name.
   * Returns null if the node doesn't exist or screen name is null.
   */
  async getNodeId(appId: string, screenName: string | null): Promise<number | null> {
    if (!screenName) {
      return null;
    }

    const cacheKey = `${appId}:${screenName}`;
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < this.cacheMaxAgeMs) {
      return cached.nodeId;
    }

    // Query database
    try {
      const node = await this.repository.getNode(appId, screenName);
      const nodeId = node?.id ?? null;

      // Update cache
      this.cache.set(cacheKey, {
        nodeId,
        timestamp: now,
      });

      return nodeId;
    } catch (error) {
      logger.warn(`[NavigationNodeLookup] Failed to look up node: ${error}`);
      return null;
    }
  }

  /**
   * Clear the lookup cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Remove stale entries from the cache.
   */
  pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp >= this.cacheMaxAgeMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get the current cache size (for testing/debugging).
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Singleton instance
let instance: NavigationNodeLookup | null = null;

export function getNavigationNodeLookup(): NavigationNodeLookup {
  if (!instance) {
    instance = new NavigationNodeLookup();
  }
  return instance;
}

export function resetNavigationNodeLookup(): void {
  instance = null;
}
