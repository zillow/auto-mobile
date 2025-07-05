import { AdbUtils } from "../../utils/adb";
import { AwaitIdle } from "../observe/AwaitIdle";
import { ObserveScreen } from "../observe/ObserveScreen";
import { Window } from "../observe/Window";
import { logger } from "../../utils/logger";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { ActionableError, ActiveWindowInfo, ObserveResult } from "../../models";

export interface ProgressCallback {
  (progress: number, total?: number, message?: string): Promise<void>;
}

export interface ObservedChangeOptions {
  changeExpected: boolean;
  timeoutMs?: number;
  packageName?: string;
  progress?: ProgressCallback;
  tolerancePercent?: number;
}

export class BaseVisualChange {
  adb: AdbUtils;
  awaitIdle: AwaitIdle;
  observeScreen: ObserveScreen;
  window: Window;

  /**
   * Create an BaseVisualChange instance
   * @param deviceId - Optional device ID
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
    this.awaitIdle = new AwaitIdle(deviceId, this.adb);
    this.observeScreen = new ObserveScreen(deviceId, this.adb);
    this.window = new Window(deviceId, this.adb);
  }

  /**
   * Execute a block of code and wait for UI to stabilize with optional observation
   * @param block - Block of code to execute which should have a visual change.
   * @param options - Options controlling observation behavior
   */
  async observedInteraction(
    block: (observeResult: ObserveResult) => Promise<any>,
    options: ObservedChangeOptions
  ): Promise<any> {

    const timeoutMs = options.timeoutMs || 12000;
    const progress = options.progress;

    if (progress) {
      await progress(0, 100, "Preparing to execute action...");
    }

    // Fetch cached view hierarchy
    let previousObserveResult: ObserveResult | null = null;
    try {
      if (progress) {
        await progress(10, 100, "Getting previous view hierarchy...");
      }
      previousObserveResult = await this.observeScreen.getMostRecentCachedObserveResult();
      if (!previousObserveResult?.viewHierarchy || !previousObserveResult.viewHierarchy || previousObserveResult.viewHierarchy.error) {
        previousObserveResult = null;
      }
    } catch (error) {
      previousObserveResult = null;
    }

    if (!previousObserveResult) {
      throw new ActionableError("Cannot perform action without view hierarchy");
    }
    const blockResult = await block(previousObserveResult);

    // Get package name for UI stability waiting
    let packageName = options.packageName;

    // Dynamic parallel promises
    const promises: Promise<any>[] = [];
    const cachedPackageName = (await this.window.getCachedActiveWindow())?.appId;

    // Start optimistic initialization with full active window fetch
    if (!packageName) {
      if (cachedPackageName) {
        packageName = cachedPackageName;
        logger.info(`[BaseVisualChange] Starting optimistic UI stability initialization with cached package: ${packageName}`);
        // Start the initialization in the background
        promises.push(this.awaitIdle.initializeUiStabilityTracking(
          packageName,
          timeoutMs
        ).catch(error => {
          logger.debug(`[BaseVisualChange] Optimistic initialization failed: ${error}`);
          return null;
        }));
      } else {
        logger.info("[BaseVisualChange] There was no cached active window");
      }

      logger.info("[BaseVisualChange] No package name provided, attempting to get active window package name...");
      try {
        promises.push(
          this.window.getActive(true)
            .catch(error => {
              // If we can't get the active window package name, we'll just wait for touch events
              packageName = undefined;
            })
        );
      } catch (error) {
        // If we can't get the active window package name, we'll just wait for touch events
        packageName = undefined;
      }
    }

    const results = await Promise.all(promises);
    const resultsSize = results.length;

    // Get results from promises and cast to correct types
    let initState: any = null;
    let activeWindowResult: ActiveWindowInfo | undefined = undefined;
    if (resultsSize === 2) {
      // Both initialization and active window promises were created
      initState = results[0];
      activeWindowResult = results[1] as ActiveWindowInfo;
    } else if (resultsSize === 1) {
      // Only one promise was created, must be active window promise was created
      activeWindowResult = results[0] as ActiveWindowInfo;
    }

    // Update package name from active window result if needed
    if (activeWindowResult && activeWindowResult.appId) {
      packageName = activeWindowResult.appId;
      logger.info(`[BaseVisualChange] Updated package name from active window: ${packageName}`);
    }

    // Only add UI stability waiting if we have a package name
    if (packageName && packageName.trim() !== "") {
      if (packageName !== cachedPackageName) {
        await this.awaitIdle.waitForUiStability(packageName, timeoutMs);
      } else {
        await this.awaitIdle.waitForUiStabilityWithState(packageName, timeoutMs, initState);
      }
    }

    // Wait for both operations to complete
    await Promise.all(promises);

    return await this.takeObservation(blockResult, previousObserveResult, {
      changeExpected: options.changeExpected,
      tolerancePercent: options.tolerancePercent ?? DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT
    });
  }

  private async takeObservation(
    blockResult: any,
    previousObserveResult: ObserveResult | null,
    options: { changeExpected: boolean; tolerancePercent?: number; }
  ): Promise<any> {
    const latestObservation = await this.observeScreen.execute();

    if (options.changeExpected && latestObservation.viewHierarchy && previousObserveResult && previousObserveResult?.viewHierarchy) {
      blockResult.success = latestObservation.viewHierarchy !== previousObserveResult.viewHierarchy;
      if (!blockResult.success) {
        blockResult.error = "No visual change observed";
      }
    } else {
      if (blockResult && "error" in blockResult && blockResult.error !== undefined) {
        blockResult.success = false;
      } else if (blockResult && !("success" in blockResult)) {
        blockResult.success = true;
      } else if (blockResult && "success" in blockResult && blockResult.success === undefined) {
        blockResult.success = true;
      }
    }

    blockResult.observation = latestObservation;

    return blockResult;
  }
}
