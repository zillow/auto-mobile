import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, GestureOptions } from "../../models";
import { Element } from "../../models";
import { ExecuteGesture } from "./ExecuteGesture";
import { ElementUtils } from "../utility/ElementUtils";
import { SwipeResult } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

/**
 * Executes swipe gestures on specific UI elements
 */
export class SwipeOnElement extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb, idb);
    this.executeGesture = new ExecuteGesture(device, adb);
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
          Math.floor(startX),
          Math.floor(startY),
          Math.floor(endX),
          Math.floor(endY),
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
