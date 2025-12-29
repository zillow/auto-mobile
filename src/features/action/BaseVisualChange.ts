import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AwaitIdle } from "../observe/AwaitIdle";
import { ObserveScreen } from "../observe/ObserveScreen";
import { Window } from "../observe/Window";
import { logger } from "../../utils/logger";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { ActionableError, BootedDevice, GfxMetrics, ObserveResult } from "../../models";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

export interface ProgressCallback {
  (progress: number, total?: number, message?: string): Promise<void>;
}

export interface ObservedChangeOptions {
  changeExpected: boolean;
  timeoutMs?: number;
  packageName?: string;
  progress?: ProgressCallback;
  tolerancePercent?: number;
  queryOptions?: ViewHierarchyQueryOptions;
  perf?: PerformanceTracker;
  skipPreviousObserve?: boolean;
  skipUiStability?: boolean;
}

export class BaseVisualChange {
  device: BootedDevice;
  adb: AdbClient;
  axe: AxeClient;
  awaitIdle: AwaitIdle;
  observeScreen: ObserveScreen;
  window: Window;

  /**
   * Create an BaseVisualChange instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   * @param axe - Optional Axe instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null
  ) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.axe = axe || new AxeClient(device);
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
    const perf = options.perf ?? new NoOpPerformanceTracker();

    if (progress) {
      await progress(0, 100, "Preparing to execute action...");
    }

    // Fetch cached view hierarchy (skip if we just terminated/cleared the app)
    let previousObserveResult: ObserveResult | null = null;
    if (options.skipPreviousObserve) {
      logger.info("[BaseVisualChange] Skipping previous observe (app was terminated/cleared)");
    } else {
      try {
        if (progress) {
          await progress(10, 100, "Getting previous view hierarchy...");
        }
        previousObserveResult = await perf.track("getPreviousObserve", async () => {
          const cached = await this.observeScreen.getMostRecentCachedObserveResult();
          if (!cached?.viewHierarchy || cached.viewHierarchy.hierarchy.error) {
            return this.observeScreen.execute(options.queryOptions);
          }
          return cached;
        });
      } catch {
        previousObserveResult = await perf.track("getPreviousObserveFallback", async () => {
          return this.observeScreen.execute(options.queryOptions);
        });
      }

      if (!previousObserveResult) {
        throw new ActionableError("Cannot perform action without view hierarchy");
      }
    }

    // Record the action start time - used to ensure final observe returns fresh data
    const actionStartTime = Date.now();

    const blockResult = await perf.track("executeBlock", async () => {
      return block(previousObserveResult!);
    });

    // Get package name for UI stability waiting
    // Priority: options > previousObserveResult.viewHierarchy.packageName > cached
    let packageName = options.packageName;

    // Try to get packageName from the observe result's view hierarchy (from accessibility service)
    if (!packageName && previousObserveResult?.viewHierarchy?.packageName) {
      packageName = previousObserveResult.viewHierarchy.packageName;
      logger.info(`[BaseVisualChange] Using packageName from view hierarchy: ${packageName}`);
    }

    // Fall back to cached active window if no packageName from hierarchy
    if (!packageName) {
      const cachedPackageName = (await this.window.getCachedActiveWindow())?.appId;
      if (cachedPackageName) {
        packageName = cachedPackageName;
        logger.info(`[BaseVisualChange] Using cached packageName: ${packageName}`);
      }
    }

    // Start UI stability tracking if we have a package name (skip if requested)
    let initState: any = null;
    let gfxMetrics: GfxMetrics | null = null;

    if (options.skipUiStability) {
      logger.info("[BaseVisualChange] Skipping UI stability tracking (skipUiStability=true)");
    } else if (packageName) {
      logger.info(`[BaseVisualChange] Starting UI stability initialization with package: ${packageName}`);
      initState = await perf.track("initUiStability", async () => {
        return this.awaitIdle.initializeUiStabilityTracking(
          packageName!,
          timeoutMs
        );
      }).catch(error => {
        logger.debug(`[BaseVisualChange] UI stability initialization failed: ${error}`);
        return null;
      });

      // Execute UI stability waiting with appropriate state
      if (packageName.trim() !== "") {
        perf.serial("uiStability");
        if (initState !== null) {
          gfxMetrics = await this.awaitIdle.waitForUiStabilityWithState(packageName, timeoutMs, initState, perf);
        } else {
          gfxMetrics = await this.awaitIdle.waitForUiStability(packageName, timeoutMs, perf);
        }
        perf.end();
      }
    }

    return await this.takeObservation(blockResult, previousObserveResult, {
      changeExpected: options.changeExpected,
      tolerancePercent: options.tolerancePercent ?? DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
      queryOptions: options.queryOptions,
      gfxMetrics,
      perf,
      actionStartTime
    });
  }

  private async takeObservation(
    blockResult: any,
    previousObserveResult: ObserveResult | null,
    options: {
      changeExpected: boolean;
      tolerancePercent?: number;
      queryOptions?: ViewHierarchyQueryOptions;
      gfxMetrics?: GfxMetrics | null;
      perf?: PerformanceTracker;
      actionStartTime?: number;
    }
  ): Promise<any> {
    const perf = options.perf ?? new NoOpPerformanceTracker();

    // Use actionStartTime as minTimestamp to ensure we get data captured after the action
    // This prevents returning stale cached data from before the action was executed
    const minTimestamp = options.actionStartTime ?? 0;

    perf.serial("finalObserve");
    const latestObservation = await this.observeScreen.execute(options.queryOptions, perf, true, minTimestamp);
    perf.end();

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

    // Add gfxMetrics to the observation if available
    if (options.gfxMetrics) {
      latestObservation.gfxMetrics = options.gfxMetrics;
    }

    // Add perf timing to the observation if enabled
    if (perf.isEnabled()) {
      const timings = perf.getTimings();
      if (timings) {
        latestObservation.perfTiming = timings;
      }
    }

    blockResult.observation = latestObservation;

    return blockResult;
  }
}
