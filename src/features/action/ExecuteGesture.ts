import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice, Point } from "../../models";
import { FingerPath } from "../../models";
import { GestureOptions } from "../../models";
import { BaseVisualChange } from "./BaseVisualChange";
import { SwipeResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";

/**
 * Executes gestures using platform-specific commands
 */
export class ExecuteGesture extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  /**
   * Execute a swipe gesture from one point to another
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param options - Additional gesture options
   * @returns Result of the swipe operation
   */
  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {}
  ): Promise<SwipeResult> {
    return this.observedInteraction(
      async () => {
        // Platform-specific swipe execution
        switch (this.device.platform) {
          case "android":
            return await this.executeAndroidSwipe(x1, y1, x2, y2, options);
          case "ios":
            return await this.executeiOSSwipe(x1, y1, x2, y2, options);
          default:
            throw new Error(`Unsupported platform: ${this.device.platform}`);
        }
      },
      {
        changeExpected: false,
        timeoutMs: 1000
      }
    );
  }

  /**
   * Execute Android-specific swipe gesture
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param options - Additional gesture options
   * @returns Result of the swipe operation
   */
  private async executeAndroidSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {}
  ): Promise<SwipeResult> {
    const duration = options.duration || 300; // Default duration
    await this.adb.executeCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);

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
    // iOS idb swipe method has stepSize parameter instead of duration
    // We use a default step size for iOS
    const stepSize = 10; // Default step size for iOS
    const duration = options.duration || 300; // Default duration for result

    await this.axe.swipe(x1, y1, x2, y2, stepSize);

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
   * @param path - Points to follow during the gesture
   * @param duration - Duration in milliseconds
   * @returns Result of the executed gesture
   */
  async execute(
    path: Point[] | FingerPath[],
    duration: number = 300,
  ): Promise<any> {
    return this.observedInteraction(
      async () => {
        // Platform-specific gesture execution
        switch (this.device.platform) {
          case "android":
            return await this.executeAndroidGesture(path, duration);
          case "ios":
            return await this.executeiOSGesture(path, duration);
          default:
            throw new Error(`Unsupported platform: ${this.device.platform}`);
        }
      },
      {
        changeExpected: false,
        timeoutMs: 1000
      }
    );
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
          await this.axe.swipe(start.x, start.y, end.x, end.y, 10);
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
