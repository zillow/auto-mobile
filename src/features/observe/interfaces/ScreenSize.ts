import type { ExecResult, ScreenSize as ScreenSizeModel } from "../../../models";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * Interface for retrieving device screen dimensions.
 */
export interface ScreenSize {
  /**
   * Get the screen size and resolution, accounting for device rotation.
   * Uses caching to avoid repeated commands.
   * @param dumpsysResult - Optional dumpsys result for rotation detection optimization
   * @param perf - Optional performance tracker
   * @returns Promise with width and height in pixels
   */
  execute(dumpsysResult?: ExecResult, perf?: PerformanceTracker): Promise<ScreenSizeModel>;
}
