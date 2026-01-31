import type { ScreenshotResult } from "../../../models/ScreenshotResult";
import type { ScreenshotOptions } from "../TakeScreenshot";

/**
 * Interface for taking screenshots of a device.
 */
export interface ScreenshotService {
  /**
   * Take a screenshot of the device.
   * @param options - Optional screenshot format options
   * @param signal - Optional abort signal
   * @returns Promise with screenshot result including success status and path if successful
   */
  execute(options?: ScreenshotOptions, signal?: AbortSignal): Promise<ScreenshotResult>;

  /**
   * Generate screenshot file path.
   * @param timestamp - Timestamp for unique filename
   * @param options - Screenshot options
   * @returns Full file path for screenshot
   */
  generateScreenshotPath(timestamp: number, options: ScreenshotOptions): string;

  /**
   * Get activity hash for screenshot naming.
   * @param activityHash - Optional provided hash
   * @returns Promise with activity hash
   */
  getActivityHash(activityHash: string | null): Promise<string>;
}
