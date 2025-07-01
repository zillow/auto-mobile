import { AdbUtils } from "../../utils/adb";
import { Point } from "../../models/Point";
import { FingerPath } from "../../models/FingerPath";
import { GestureOptions } from "../../models/GestureOptions";
import { BaseVisualChange } from "./BaseVisualChange";
import { SwipeResult } from "../../models/SwipeResult";

/**
 * Executes gestures using adb input commands (no sendevent)
 */
export class ExecuteGesture extends BaseVisualChange {
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  /**
   * Execute a swipe gesture from one point to another
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Duration in milliseconds
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
    return this.observedChange(
      async () => {
        await this.adb.executeCommand(`shell input swipe ${x1} ${y1} ${x2} ${y2} ${options.duration}`);

        return {
          success: true,
          x1,
          y1,
          x2,
          y2,
          duration: options.duration
        };
      },
      {
        changeExpected: false,
        timeoutMs: 1000
      }
    );
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
    return this.observedChange(
      async () => {
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
          duration
        };
      },
      {
        changeExpected: false,
        timeoutMs: 1000
      }
    );
  }
}
