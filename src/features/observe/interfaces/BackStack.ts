import type { BackStackInfo } from "../../../models";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * Interface for retrieving Android activity back stack information.
 */
export interface BackStack {
  /**
   * Execute dumpsys activity activities command and parse the back stack.
   * @param perf - Optional performance tracker
   * @param signal - Optional abort signal
   * @returns Promise with BackStackInfo containing activities, tasks, and current activity
   */
  execute(perf?: PerformanceTracker, signal?: AbortSignal): Promise<BackStackInfo>;
}
