import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BootedDevice, Point } from "../../models";
import { FingerPath } from "../../models";
import { GestureOptions } from "../../models";
import { BaseVisualChange } from "./BaseVisualChange";
import { SwipeResult } from "../../models";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { logger } from "../../utils/logger";

/**
 * Executes gestures using platform-specific commands
 */
export class ExecuteGesture extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  /**
   * Execute a swipe gesture from one point to another
   * Note: This method executes the raw swipe command without observation.
   * Callers that need observation should use observedInteraction at a higher level.
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param options - Additional gesture options
   * @param perf - Optional performance tracker
   * @returns Result of the swipe operation
   */
  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {},
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    // Platform-specific swipe execution (no observedInteraction - caller handles observation)
    switch (this.device.platform) {
      case "android":
        return await this.executeAndroidSwipe(x1, y1, x2, y2, options, perf);
      case "ios":
        return await this.executeiOSSwipe(x1, y1, x2, y2, options);
      default:
        throw new Error(`Unsupported platform: ${this.device.platform}`);
    }
  }

  /**
   * Execute Android-specific swipe gesture
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param options - Additional gesture options
   * @param perf - Performance tracker for timing
   * @returns Result of the swipe operation
   */
  private async executeAndroidSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {},
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    const duration = options.duration || 300; // Default duration
    const scrollMode = options.scrollMode || "adb"; // Default to ADB mode

    // Use accessibility service swipe if requested
    if (scrollMode === "a11y") {
      return await this.executeA11ySwipe(x1, y1, x2, y2, duration, perf);
    }

    // Default ADB mode
    await perf.track("adbInputSwipe", async () => {
      await this.adb.executeCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
    });

    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration
    };
  }

  /**
   * Execute swipe using accessibility service's dispatchGesture API.
   * This is significantly faster than ADB's input swipe command.
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Swipe duration in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Result of the swipe operation
   */
  private async executeA11ySwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    try {
      const client = AccessibilityServiceClient.getInstance(this.device, this.adb);

      const result = await perf.track("a11ySwipe", async () => {
        return await client.requestSwipe(x1, y1, x2, y2, duration, 5000, perf);
      });

      if (result.success) {
        logger.info(`[SWIPE] A11y swipe successful: deviceTotal=${result.totalTimeMs}ms, gesture=${result.gestureTimeMs}ms`);
        return {
          success: true,
          x1,
          y1,
          x2,
          y2,
          duration,
          a11yTotalTimeMs: result.totalTimeMs,
          a11yGestureTimeMs: result.gestureTimeMs
        };
      } else {
        logger.warn(`[SWIPE] A11y swipe failed: ${result.error}, falling back to ADB`);
        // Fall back to ADB on failure
        await perf.track("adbInputSwipeFallback", async () => {
          await this.adb.executeCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
        });
        return {
          success: true,
          x1,
          y1,
          x2,
          y2,
          duration,
          fallbackReason: result.error
        };
      }
    } catch (error) {
      logger.warn(`[SWIPE] A11y swipe exception: ${error}, falling back to ADB`);
      // Fall back to ADB on exception
      await perf.track("adbInputSwipeFallback", async () => {
        await this.adb.executeCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
      });
      return {
        success: true,
        x1,
        y1,
        x2,
        y2,
        duration,
        fallbackReason: `${error}`
      };
    }
  }

  /**
   * Execute iOS-specific swipe gesture
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param options - Additional gesture options
   * @returns Result of the swipe operation
   */
  private async executeiOSSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {}
  ): Promise<SwipeResult> {
    // Duration is hardcoded to 0.3 in axe.swipe
    const duration = 300; // Return duration in milliseconds

    await this.axe.swipe(x1, y1, x2, y2);

    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration
    };
  }

  /**
   * Execute a gesture by sending a series of touch events
   * Note: This method executes the raw gesture command without observation.
   * Callers that need observation should use observedInteraction at a higher level.
   * @param path - Points to follow during the gesture
   * @param duration - Duration in milliseconds
   * @returns Result of the executed gesture
   */
  async execute(
    path: Point[] | FingerPath[],
    duration: number = 300,
  ): Promise<any> {
    // Platform-specific gesture execution (no observedInteraction - caller handles observation)
    switch (this.device.platform) {
      case "android":
        return await this.executeAndroidGesture(path, duration);
      case "ios":
        return await this.executeiOSGesture(path, duration);
      default:
        throw new Error(`Unsupported platform: ${this.device.platform}`);
    }
  }

  /**
   * Execute Android-specific gesture
   */
  private async executeAndroidGesture(path: Point[] | FingerPath[], duration: number): Promise<any> {
    // Generate and execute adb touch events
    if (Array.isArray(path) && path.length > 0) {
      if ("finger" in path[0]) {
        // Multi-finger gestures are not supported without sendevent
        throw new Error("Multi-finger gestures not supported - use simple swipe instead");
      } else {
        // Single finger path - convert to simple swipe
        const points = path as Point[];
        if (points.length >= 2) {
          const start = points[0];
          const end = points[points.length - 1];

          await this.adb.executeCommand(
            `shell input swipe ${start.x} ${start.y} ${end.x} ${end.y} ${duration}`
          );
        }
      }
    }

    return {
      pathLength: path.length,
      duration,
      platform: "android"
    };
  }

  /**
   * Execute iOS-specific gesture
   */
  private async executeiOSGesture(path: Point[] | FingerPath[], duration: number): Promise<any> {
    if (Array.isArray(path) && path.length > 0) {
      if ("finger" in path[0]) {
        // Multi-finger gestures are not supported on iOS through idb
        throw new Error("Multi-finger gestures not supported on iOS - use simple swipe instead");
      } else {
        // Single finger path - convert to simple swipe
        const points = path as Point[];
        if (points.length >= 2) {
          const start = points[0];
          const end = points[points.length - 1];

          // Use default step size for iOS swipe
          await this.axe.swipe(start.x, start.y, end.x, end.y);
        }
      }
    }

    return {
      pathLength: path.length,
      duration,
      platform: "ios"
    };
  }
}
