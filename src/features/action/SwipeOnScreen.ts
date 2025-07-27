import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, GestureOptions } from "../../models";
import { ExecuteGesture } from "./ExecuteGesture";
import { SwipeResult } from "../../models";
import { ElementUtils } from "../utility/ElementUtils";
import { ActionableError, ObserveResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { logger } from "../../utils/logger";

/**
 * Executes swipe gestures on the screen, respecting system insets
 */
export class SwipeOnScreen extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.executeGesture = new ExecuteGesture(device, adb);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Swipe on screen in a given direction
   * @param observeResult - Previous ObserveResult
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @returns Result of the swipe operation
   */
  async executeAndroid(
    observeResult: ObserveResult,
    direction: "up" | "down" | "left" | "right",
    options: GestureOptions = {},
    progress?: ProgressCallback
  ): Promise<SwipeResult> {
    logger.info(`[SwipeOnScreen] In observedInteraction callback`);

    if (!observeResult.screenSize) {
      logger.error(`[SwipeOnScreen] No screen size available in observeResult`);
      throw new ActionableError("Could not determine screen size");
    }

    const screenWidth = observeResult.screenSize.width;
    const screenHeight = observeResult.screenSize.height;
    const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };

    logger.info(`[SwipeOnScreen] Screen dimensions: ${screenWidth}x${screenHeight}`);
    logger.info(`[SwipeOnScreen] System insets: ${JSON.stringify(insets)}`);

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

    logger.info(`[SwipeOnScreen] Calculated bounds: ${JSON.stringify(bounds)}`);

    const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
      direction,
      bounds
    );

    logger.info(`[SwipeOnScreen] Raw swipe coordinates: start=(${startX}, ${startY}), end=(${endX}, ${endY})`);

    const flooredStartX = Math.floor(startX);
    const flooredStartY = Math.floor(startY);
    const flooredEndX = Math.floor(endX);
    const flooredEndY = Math.floor(endY);

    logger.info(`[SwipeOnScreen] Floored swipe coordinates: start=(${flooredStartX}, ${flooredStartY}), end=(${flooredEndX}, ${flooredEndY})`);

    try {
      const result = await this.executeGesture.swipe(
        flooredStartX,
        flooredStartY,
        flooredEndX,
        flooredEndY,
        options
      );
      logger.info(`[SwipeOnScreen] Swipe completed successfully: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`[SwipeOnScreen] Swipe execution failed: ${error}`);
      throw error;
    }
  }
  /**
   * Swipe on screen in a given direction
   * @param observeResult - Previous ObserveResult
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @returns Result of the swipe operation
   */
  async executeiOS(
    observeResult: ObserveResult,
    direction: "up" | "down" | "left" | "right",
    options: GestureOptions = {},
    progress?: ProgressCallback
  ): Promise<SwipeResult> {
    logger.info(`[SwipeOnScreen] In observedInteraction callback for iOS`);

    if (!observeResult.screenSize) {
      logger.error(`[SwipeOnScreen] No screen size available in observeResult`);
      throw new ActionableError("Could not determine screen size");
    }

    const screenWidth = observeResult.screenSize.width;
    const screenHeight = observeResult.screenSize.height;
    const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };

    logger.info(`[SwipeOnScreen] Screen dimensions: ${screenWidth}x${screenHeight}`);
    logger.info(`[SwipeOnScreen] System insets: ${JSON.stringify(insets)}`);

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

    logger.info(`[SwipeOnScreen] Calculated bounds: ${JSON.stringify(bounds)}`);

    const { startX, startY, endX, endY } = this.elementUtils.getSwipeWithinBounds(
      direction,
      bounds
    );

    logger.info(`[SwipeOnScreen] Raw swipe coordinates: start=(${startX}, ${startY}), end=(${endX}, ${endY})`);

    // Ensure coordinates are bounded by screen size and always positive
    const boundedStartX = Math.max(0, Math.min(Math.floor(startX), screenWidth - 1));
    const boundedStartY = Math.max(0, Math.min(Math.floor(startY), screenHeight - 1));
    const boundedEndX = Math.max(0, Math.min(Math.floor(endX), screenWidth - 1));
    const boundedEndY = Math.max(0, Math.min(Math.floor(endY), screenHeight - 1));

    logger.info(`[SwipeOnScreen] Bounded swipe coordinates: start=(${boundedStartX}, ${boundedStartY}), end=(${boundedEndX}, ${boundedEndY})`);

    try {
      const result = await this.axe.swipe(
        boundedStartX,
        boundedStartY,
        boundedEndX,
        boundedEndY
      );
      logger.info(`[SwipeOnScreen] Swipe completed successfully: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.error(`[SwipeOnScreen] Swipe execution failed: ${error}`);
      throw error;
    }
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
    logger.info(`[SwipeOnScreen] Starting swipe: direction=${direction}, platform=${this.device.platform}`);
    logger.info(`[SwipeOnScreen] Options: ${JSON.stringify(options)}`);

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        logger.info(`[SwipeOnScreen] In observedInteraction callback`);

        switch (this.device.platform) {
          case "android":
            return this.executeAndroid(observeResult, direction, options, progress);
          case "ios":
            return this.executeiOS(observeResult, direction, options, progress);
        }
      }, {
        changeExpected: false,
        timeoutMs: 500,
        progress
      }
    );
  }
}
