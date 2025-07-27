import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, GestureOptions } from "../../models";
import { Element } from "../../models";
import { ExecuteGesture } from "./ExecuteGesture";
import { ElementUtils } from "../utility/ElementUtils";
import { SwipeResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { logger } from "../../utils/logger";

/**
 * Executes swipe gestures on specific UI elements
 */
export class SwipeOnElement extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
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
    logger.info(`[SwipeOnElement] Starting swipe: direction=${direction}, platform=${this.device.platform}`);
    logger.info(`[SwipeOnElement] Element bounds: ${JSON.stringify(element.bounds)}`);
    logger.info(`[SwipeOnElement] Options: ${JSON.stringify(options)}`);

    return this.observedInteraction(
      async () => {
        logger.info(`[SwipeOnElement] In observedInteraction callback`);

        const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
          direction,
          element.bounds
        );

        logger.info(`[SwipeOnElement] Raw swipe coordinates: start=(${startX}, ${startY}), end=(${endX}, ${endY})`);

        const flooredStartX = Math.floor(startX);
        const flooredStartY = Math.floor(startY);
        const flooredEndX = Math.floor(endX);
        const flooredEndY = Math.floor(endY);

        logger.info(`[SwipeOnElement] Floored swipe coordinates: start=(${flooredStartX}, ${flooredStartY}), end=(${flooredEndX}, ${flooredEndY})`);

        try {
          const result = await this.executeGesture.swipe(
            flooredStartX,
            flooredStartY,
            flooredEndX,
            flooredEndY,
            options
          );
          logger.info(`[SwipeOnElement] Swipe completed successfully: ${JSON.stringify(result)}`);
          return result;
        } catch (error) {
          logger.error(`[SwipeOnElement] Swipe execution failed: ${error}`);
          throw error;
        }
      },
      {
        changeExpected: false,
        timeoutMs: 500,
        progress
      }
    );
  }
}
