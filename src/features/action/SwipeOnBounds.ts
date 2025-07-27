import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { GestureOptions } from "../../models/GestureOptions";
import { ExecuteGesture } from "./ExecuteGesture";
import { ElementUtils } from "../utility/ElementUtils";
import { SwipeResult } from "../../models/SwipeResult";
import { BootedDevice } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";

/**
 * Executes swipe gestures on specific coordinate bounds
 */
export class SwipeOnBounds extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.executeGesture = new ExecuteGesture(device, adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Swipe within specified bounds in a given direction
   * @param bounds - The coordinate bounds to swipe within
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param options - Additional gesture options
   * @returns Result of the swipe operation
   */
  async execute(
    bounds: { left: number; top: number; right: number; bottom: number },
    direction: "up" | "down" | "left" | "right",
    options: GestureOptions = {}
  ): Promise<SwipeResult> {
    const { startX, startY, endX, endY } = this.calculateSwipeCoordinates(bounds, direction);

    return this.executeGesture.swipe(
      startX,
      startY,
      endX,
      endY,
      options
    );
  }

  /**
   * Calculate start and end coordinates for swipe based on bounds and direction
   * @param bounds - The coordinate bounds to swipe within
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @returns Start and end coordinates for the swipe
   */
  private calculateSwipeCoordinates(
    bounds: { left: number; top: number; right: number; bottom: number },
    direction: "up" | "down" | "left" | "right"
  ): { startX: number; startY: number; endX: number; endY: number } {
    const centerX = Math.floor((bounds.left + bounds.right) / 2);
    const centerY = Math.floor((bounds.top + bounds.bottom) / 2);

    // Use full available space with 8px padding
    let startX = centerX;
    let startY = centerY;
    let endX = centerX;
    let endY = centerY;

    switch (direction) {
      case "up":
        // For "up" direction: Swipe finger from bottom to top
        startY = bounds.bottom - 8;
        endY = bounds.top + 8;
        break;
      case "down":
        // For "down" direction: Swipe finger from top to bottom
        startY = bounds.top + 8;
        endY = bounds.bottom - 8;
        break;
      case "left":
        // For "left" direction: Swipe finger from right to left
        startX = bounds.right - 8;
        endX = bounds.left + 8;
        break;
      case "right":
        // For "right" direction: Swipe finger from left to right
        startX = bounds.left + 8;
        endX = bounds.right - 8;
        break;
    }

    return { startX, startY, endX, endY };
  }
}
