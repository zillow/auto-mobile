import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { AwaitIdle } from "../observe/AwaitIdle";
import { ObserveScreen } from "../observe/ObserveScreen";
import { Window } from "../observe/Window";
import { logger } from "../../utils/logger";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { ActionableError, ActiveWindowInfo, BootedDevice, ObserveResult } from "../../models";

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
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(device);
    this.awaitIdle = new AwaitIdle(device, this.adb);
    this.observeScreen = new ObserveScreen(device, this.adb);
    this.window = new Window(device, this.adb);
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
      if (!previousObserveResult?.viewHierarchy || !previousObserveResult.viewHierarchy || previousObserveResult.viewHierarchy.hierarchy.error) {
        previousObserveResult = await this.observeScreen.execute();
      }
    } catch (error) {
      previousObserveResult = await this.observeScreen.execute();
    }

    if (!previousObserveResult) {
      throw new ActionableError("Cannot perform action without view hierarchy");
    }
    const blockResult = await block(previousObserveResult);

    // Get package name for UI stability waiting
    let packageName = options.packageName;
    const cachedPackageName = (await this.window.getCachedActiveWindow())?.appId;

    // Start all parallel operations immediately
    const parallelPromises: Promise<any>[] = [];

    // Always start UI stability tracking if we have a cached package name
    if (!packageName && cachedPackageName) {
      packageName = cachedPackageName;
      logger.info(`[BaseVisualChange] Starting optimistic UI stability initialization with cached package: ${packageName}`);
      parallelPromises.push(this.awaitIdle.initializeUiStabilityTracking(
        packageName,
        timeoutMs
      ).catch(error => {
        logger.debug(`[BaseVisualChange] Optimistic initialization failed: ${error}`);
        return null;
      }));
    }

    // Always start active window fetch to ensure we have the latest info
    logger.info("[BaseVisualChange] Starting active window fetch in parallel");
    parallelPromises.push(
      this.window.getActive(true).catch(error => {
        logger.debug(`[BaseVisualChange] Active window fetch failed: ${error}`);
        return null;
      })
    );

    // Execute all parallel operations
    const results = await Promise.all(parallelPromises);

    // Process results
    let initState: any = null;
    let activeWindowResult: ActiveWindowInfo | undefined = undefined;

    if (results.length === 2) {
      // Both UI stability and active window promises were created
      initState = results[0];
      activeWindowResult = results[1] as ActiveWindowInfo;
    } else if (results.length === 1) {
      // Only active window promise was created
      activeWindowResult = results[0] as ActiveWindowInfo;
    }

    // Update package name from active window result if needed
    if (activeWindowResult && activeWindowResult.appId) {
      packageName = activeWindowResult.appId;
      logger.info(`[BaseVisualChange] Updated package name from active window: ${packageName}`);
    }

    // Execute UI stability waiting with appropriate state
    if (packageName && packageName.trim() !== "") {
      if (initState !== null) {
        await this.awaitIdle.waitForUiStabilityWithState(packageName, timeoutMs, initState);
      } else {
        await this.awaitIdle.waitForUiStability(packageName, timeoutMs);
      }
    }

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
