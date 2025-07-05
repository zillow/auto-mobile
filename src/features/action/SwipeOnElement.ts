import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { GestureOptions } from "../../models";
import { Element } from "../../models";
import { ExecuteGesture } from "./ExecuteGesture";
import { ElementUtils } from "../utility/ElementUtils";
import { SwipeResult } from "../../models";

/**
 * Executes swipe gestures on specific UI elements
 */
export class SwipeOnElement extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.executeGesture = new ExecuteGesture(deviceId, adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Swipe on a specific element in a given direction
   * @param element - The element to swipe on
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @returns Result of the swipe operation
   */
  async execute(
    element: Element,
    direction: "up" | "down" | "left" | "right",
    options: GestureOptions = {},
    progress?: ProgressCallback
  ): Promise<SwipeResult> {
    return this.observedInteraction(
      async () => {
        const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
          direction,
          element.bounds
        );

        return this.executeGesture.swipe(
          startX,
          startY,
          endX,
          endY,
          options
        );
      },
      {
        changeExpected: false,
        timeoutMs: 500,
        progress
      }
    );
  }
}
