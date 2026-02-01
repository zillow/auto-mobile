import type { ExecResult } from "../../../models";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * Interface for retrieving and caching dumpsys window output.
 */
export interface DumpsysWindow {
  /**
   * Get cached dumpsys window data, using memory cache first, then disk cache.
   * If no valid cache exists, fetches fresh data.
   * @param perf - Optional performance tracker
   * @param signal - Optional abort signal
   * @returns Promise with ExecResult containing dumpsys window output
   */
  execute(perf?: PerformanceTracker, signal?: AbortSignal): Promise<ExecResult>;

  /**
   * Refresh dumpsys window data and update both memory and disk cache.
   * @param perf - Optional performance tracker
   * @param signal - Optional abort signal
   * @returns Promise with fresh ExecResult
   */
  refresh(perf?: PerformanceTracker, signal?: AbortSignal): Promise<ExecResult>;
}
