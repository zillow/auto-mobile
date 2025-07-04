import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { GestureOptions } from "../../models/GestureOptions";
import { ExecuteGesture } from "./ExecuteGesture";
import { SwipeResult } from "../../models/SwipeResult";
import { ElementUtils } from "../utility/ElementUtils";

/**
 * Executes swipe gestures on the screen, respecting system insets
 */
export class SwipeOnScreen extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.executeGesture = new ExecuteGesture(deviceId, adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Swipe on screen in a given direction
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @returns Result of the swipe operation
   */
  async execute(
    direction: "up" | "down" | "left" | "right",
    options: GestureOptions = {},
    progress?: ProgressCallback
  ): Promise<SwipeResult> {

    // First, get the screen dimensions and system insets
    const observeResult = await this.observeScreen.execute();
    if (!observeResult.screenSize) {
      throw new Error("Could not determine screen size");
    }

    const screenWidth = observeResult.screenSize.width;
    const screenHeight = observeResult.screenSize.height;
    const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };

    // Calculate the bounds based on system insets
    const bounds = (options.includeSystemInsets === true)
      ? {
        left: 0,
        top: 0,
        right: screenWidth,
        bottom: screenHeight
      }
      : {
        left: insets.left,
        top: insets.top,
        right: screenWidth - insets.right,
        bottom: screenHeight - insets.bottom
      };

    return this.observedInteraction(
      async () => {

        const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
          direction,
          bounds
        );

        return this.executeGesture.swipe(
          startX,
          startY,
          endX,
          endY,
          options
        );
      }, {
        changeExpected: false,
        timeoutMs: 500,
        previousViewHierarchy: observeResult.viewHierarchy,
        progress
      }
    );
  }
}
