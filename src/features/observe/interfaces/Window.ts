import type { ActiveWindowInfo } from "../../../models/ActiveWindowInfo";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * Interface for retrieving active window information.
 */
export interface Window {
  /**
   * Get information about the active window.
   * Uses cache unless forceRefresh is true.
   * @param forceRefresh - Force refresh the cache (default: false)
   * @param perf - Optional performance tracker
   * @returns Promise with active window information (appId, activityName, layoutSeqSum)
   */
  getActive(forceRefresh?: boolean, perf?: PerformanceTracker): Promise<ActiveWindowInfo>;

  /**
   * Get a hash of the current activity name.
   * Always forces a refresh to ensure current state.
   * @param perf - Optional performance tracker
   * @returns Promise with activity hash string
   */
  getActiveHash(perf?: PerformanceTracker): Promise<string>;

  /**
   * Get cached active window without refreshing.
   * @returns Promise with cached window info or null if not cached
   */
  getCachedActiveWindow(): Promise<ActiveWindowInfo | null>;

  /**
   * Set cached active window from external source (e.g., UI stability waiting).
   * @param activeWindow - The active window to cache
   */
  setCachedActiveWindow(activeWindow: ActiveWindowInfo): Promise<void>;

  /**
   * Clear the cached active window from memory and disk.
   */
  clearCache(): Promise<void>;
}
