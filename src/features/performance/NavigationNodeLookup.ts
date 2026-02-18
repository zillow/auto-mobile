import { NavigationRepository } from "../../db/NavigationRepository";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { TTLCache } from "../../utils/cache/Cache";

/**
 * Utility for looking up navigation node IDs from app/screen name pairs.
 * Includes caching to avoid repeated database queries.
 */
export class NavigationNodeLookup {
  private repository: NavigationRepository;
  private readonly cache: TTLCache<string, number | null>;

  constructor(
    repository?: NavigationRepository,
    cacheMaxAgeMs: number = 60000, // 1 minute default
    timer: Timer = defaultTimer
  ) {
    this.repository = repository ?? new NavigationRepository();
    this.cache = new TTLCache(timer, { ttlMs: cacheMaxAgeMs });
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

    // Check cache - TTLCache handles expiration automatically
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) ?? null;
    }

    // Query database
    try {
      const node = await this.repository.getNode(appId, screenName);
      const nodeId = node?.id ?? null;

      // Update cache
      this.cache.set(cacheKey, nodeId);

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
   * Get the current cache size (for testing/debugging).
   */
  getCacheSize(): number {
    return this.cache.size();
  }
}

export function resetNavigationNodeLookup(): void {
  // No-op: retained for test compatibility
}
