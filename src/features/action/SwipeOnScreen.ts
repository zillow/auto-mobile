import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, GestureOptions } from "../../models";
import { ExecuteGesture } from "./ExecuteGesture";
import { SwipeResult } from "../../models";
import type { ElementGeometry } from "../../utils/interfaces/ElementGeometry";
import { DefaultElementGeometry } from "../utility/ElementGeometry";
import { ActionableError, ObserveResult } from "../../models";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker, PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { XCTestServiceClient } from "../observe/ios";
import { getScreenBounds } from "../../utils/screenBounds";

/**
 * Executes swipe gestures on the screen, respecting system insets
 */
export class SwipeOnScreen extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private geometry: ElementGeometry;

  constructor(device: BootedDevice, adb: AdbClient | null = null, geometry: ElementGeometry = new DefaultElementGeometry()) {
    super(device, adb);
    this.executeGesture = new ExecuteGesture(device, adb);
    this.geometry = geometry;
  }

  /**
   * Swipe on screen in a given direction
   * @param observeResult - Previous ObserveResult
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param options - Additional gesture options
   * @param progress - Optional progress callback
   * @param perf - Optional performance tracker
   * @returns Result of the swipe operation
   */
  async executeAndroid(
    observeResult: ObserveResult,
    direction: "up" | "down" | "left" | "right",
    options: GestureOptions = {},
    progress?: ProgressCallback,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    logger.info(`[SwipeOnScreen] In observedInteraction callback`);

    if (!observeResult.screenSize) {
      logger.error(`[SwipeOnScreen] No screen size available in observeResult`);
      throw new ActionableError("Could not determine screen size");
    }

    logger.info(`[SwipeOnScreen] Screen dimensions: ${observeResult.screenSize.width}x${observeResult.screenSize.height}`);
    logger.info(`[SwipeOnScreen] System insets: ${JSON.stringify(observeResult.systemInsets)}`);

    const bounds = getScreenBounds(observeResult.screenSize, observeResult.systemInsets, options.includeSystemInsets === true);

    logger.info(`[SwipeOnScreen] Calculated bounds: ${JSON.stringify(bounds)}`);

    const { startX, startY, endX, endY } = this.geometry.getSwipeWithinBounds(
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
        options,
        perf
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

    logger.info(`[SwipeOnScreen] Screen dimensions: ${screenWidth}x${screenHeight}`);
    logger.info(`[SwipeOnScreen] System insets: ${JSON.stringify(observeResult.systemInsets)}`);

    const bounds = getScreenBounds(observeResult.screenSize, observeResult.systemInsets, options.includeSystemInsets === true);

    logger.info(`[SwipeOnScreen] Calculated bounds: ${JSON.stringify(bounds)}`);

    const { startX, startY, endX, endY } = this.geometry.getSwipeWithinBounds(
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
      // Use XCTestServiceClient for swipe
      const client = XCTestServiceClient.getInstance(this.device);
      const xcResult = await client.requestSwipe(
        boundedStartX,
        boundedStartY,
        boundedEndX,
        boundedEndY
      );

      if (!xcResult.success) {
        logger.error(`[SwipeOnScreen] XCTestService swipe failed: ${xcResult.error}`);
        throw new Error(`iOS swipe failed: ${xcResult.error}`);
      }

      logger.info(`[SwipeOnScreen] XCTestService swipe completed successfully`);
      return {
        success: true,
        startX: boundedStartX,
        startY: boundedStartY,
        endX: boundedEndX,
        endY: boundedEndY
      };
    } catch (error) {
      logger.error(`[SwipeOnScreen] iOS swipe failed: ${error}`);
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
    const perf = createGlobalPerformanceTracker();
    perf.serial("swipeOnScreen");

    logger.info(`[SwipeOnScreen] Starting swipe: direction=${direction}, platform=${this.device.platform}`);
    logger.info(`[SwipeOnScreen] Options: ${JSON.stringify(options)}`);

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        logger.info(`[SwipeOnScreen] In observedInteraction callback`);

        switch (this.device.platform) {
          case "android":
            return perf.track("androidSwipe", () =>
              this.executeAndroid(observeResult, direction, options, progress, perf)
            );
          case "ios":
            return perf.track("iOSSwipe", () =>
              this.executeiOS(observeResult, direction, options, progress)
            );
        }
      }, {
        changeExpected: false,
        timeoutMs: 500,
        progress,
        perf
      }
    );
  }
}
