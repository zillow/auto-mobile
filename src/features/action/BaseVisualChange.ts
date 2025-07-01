import { AdbUtils } from "../../utils/adb";
import { AwaitIdle } from "../observe/AwaitIdle";
import { ObserveScreen } from "../observe/ObserveScreen";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { ViewHierarchyResult } from "../../models/ViewHierarchyResult";
import { Window } from "../observe/Window";
import { logger } from "../../utils/logger";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { ActiveWindowInfo } from "../../models";
import { assert } from "chai";

export interface ProgressCallback {
  (progress: number, total?: number, message?: string): Promise<void>;
}

export interface ObservedChangeOptions {
  changeExpected: boolean;
  timeoutMs?: number;
  packageName?: string;
  previousViewHierarchy?: ViewHierarchyResult | null;
  progress?: ProgressCallback;
  tolerancePercent?: number;
}

export class BaseVisualChange {
  adb: AdbUtils;
  awaitIdle: AwaitIdle;
  observeScreen: ObserveScreen;
  private viewHierarchyUtil: ViewHierarchy;
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
    this.viewHierarchyUtil = new ViewHierarchy(deviceId, this.adb);
    this.window = new Window(deviceId, this.adb);
  }

  /**
   * Execute a block of code and wait for UI to stabilize with optional observation
   * @param block - Block of code to execute which should have a visual change.
   * @param options - Options controlling observation behavior
   */
  async observedChange(
    block: () => Promise<any>,
    options: ObservedChangeOptions
  ): Promise<any> {

    const timeoutMs = options.timeoutMs || 12000;
    let previousViewHierarchy: ViewHierarchyResult | null = options.previousViewHierarchy ?? null;
    const progress = options.progress;

    if (progress) {
      await progress(0, 100, "Preparing to execute action...");
    }

    // Only fetch cached view hierarchy if not provided
    if (previousViewHierarchy === null) {
      try {
        if (progress) {
          await progress(10, 100, "Getting previous view hierarchy...");
        }
        previousViewHierarchy = await this.viewHierarchyUtil.getMostRecentCachedViewHierarchy();
        if (!previousViewHierarchy.hierarchy || previousViewHierarchy.hierarchy.error) {
          previousViewHierarchy = null;
        }
      } catch (error) {
        previousViewHierarchy = null;
      }
    }

    if (progress) {
      await progress(20, 100, "Executing action...");
    }

    const blockResult = await block();

    if (progress) {
      await progress(40, 100, "Action completed, waiting for UI to stabilize...");
    }

    // Get package name for UI stability waiting
    let packageName = options.packageName;

    // Dynamic parallel promises
    const promises: Promise<any>[] = [];
    const cachedPackageName = this.observeScreen.getCachedActiveWindow()?.appId;

    // If no package name provided and we have a cached one, start optimistic initialization
    if (!packageName) {
      if (cachedPackageName) {
        packageName = cachedPackageName;
        logger.info(`[BaseVisualChange] Starting optimistic UI stability initialization with cached package: $packageName`);
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
          this.window.getActive()
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

    if (progress) {
      await progress(50, 100, "Waiting for UI to stabilize...");
    }

    const results = await Promise.all(promises);
    const resultsSize = results.length;

    results.forEach((result, index) => {
      assert.isTrue(result.success, `Call ${index} should succeed`);
    });

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
      this.observeScreen.setCachedActiveWindow(activeWindowResult);
      logger.info(`[BaseVisualChange] Updated package name from active window: ${packageName}`);
    }

    // Only add UI stability waiting if we have a package name
    if (packageName && packageName.trim() !== "") {
      if (packageName !== cachedPackageName) {
        await this.awaitIdle.waitForUiStability(packageName, timeoutMs);
      } else {
        await this.awaitIdle.waitForUiStabilityWithState(packageName, timeoutMs, initState);
      }

      if (progress) {
        await progress(70, 100, `UI stability achieved for ${packageName}`);
      }
    }

    // Wait for both operations to complete
    await Promise.all(promises);

    if (progress) {
      await progress(80, 100, "Taking final observation...");
    }

    const result = await this.takeObservation(blockResult, previousViewHierarchy, {
      changeExpected: options.changeExpected,
      tolerancePercent: options.tolerancePercent ?? DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT
    });

    if (progress) {
      await progress(100, 100, "Action and observation completed");
    }

    return result;
  }

  private async takeObservation(
    blockResult: any,
    previousViewHierarchy: ViewHierarchyResult | null,
    options: { changeExpected: boolean; tolerancePercent?: number; }
  ): Promise<any> {
    const latestObservation = await this.observeScreen.execute();

    if (options.changeExpected && latestObservation.viewHierarchy && previousViewHierarchy) {
      blockResult.success = latestObservation.viewHierarchy !== previousViewHierarchy;
      if (!blockResult.success) {
        blockResult.error = "No visual change observed";
      }
    } else {
      blockResult.success = true;
    }

    blockResult.observation = latestObservation;

    return blockResult;
  }
}
