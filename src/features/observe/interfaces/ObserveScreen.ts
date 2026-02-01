import type { ObserveResult } from "../../../models";
import type { ViewHierarchyQueryOptions } from "../../../models/ViewHierarchyQueryOptions";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * Interface for observing device screen state.
 */
export interface ObserveScreen {
  /**
   * Execute the observe command to capture screen state.
   * Collects view hierarchy, screen size, system insets, and other device state.
   * @param queryOptions - Optional query options for targeted element retrieval
   * @param perf - Optional performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method (default: true)
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @param signal - Optional abort signal
   * @returns Promise with the observation result
   */
  execute(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    signal?: AbortSignal
  ): Promise<ObserveResult>;

  /**
   * Get the most recent cached observe result from memory or disk cache.
   * @returns Promise with the most recent cached observe result
   */
  getMostRecentCachedObserveResult(): Promise<ObserveResult>;
}
