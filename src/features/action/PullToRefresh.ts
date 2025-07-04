import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { GestureOptions } from "../../models/GestureOptions";
import { Element } from "../../models/Element";
import { ExecuteGesture } from "./ExecuteGesture";
import { ElementUtils } from "../utility/ElementUtils";

/**
 * Executes pull-to-refresh gestures on scrollable elements
 */
export class PullToRefresh extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.executeGesture = new ExecuteGesture(deviceId, adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Perform a pull-to-refresh gesture at the top of a scrollable element
   * @param element - The scrollable element to pull on
   * @param distance - Pull distance in pixels
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @returns Result of the pull-to-refresh operation
   */
  async execute(
    element: Element,
    distance: number = 300,
    options: GestureOptions = {},
    progress?: ProgressCallback
  ): Promise<any> {
    return this.observedInteraction(
      async () => {
        const center = this.elementUtils.getElementCenter(element);
        const bounds = element.bounds;

        // Start at top center of element, slightly below the top edge
        const startX = center.x;
        const startY = bounds.top + 8;

        // Pull down by the specified distance
        const endY = startY + distance;

        // Use a slower pull with decelerate easing to simulate user behavior
        return this.executeGesture.swipe(
          startX,
          startY,
          startX,
          endY,
          {
            ...options,
            easing: "accelerateDecelerate"
          }
        );
      },
      {
        changeExpected: false,
        timeoutMs: 1000,
        progress
      }
    );
  }
}
