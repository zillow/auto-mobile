import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { AwaitIdle } from "../observe/AwaitIdle";
import { ObserveScreen } from "../observe/ObserveScreen";
import { Window } from "../observe/Window";
import { logger } from "../../utils/logger";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { ActionableError, ActiveWindowInfo, BootedDevice, GfxMetrics, ObserveResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { IPerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

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
  perf?: IPerformanceTracker;
  skipPreviousObserve?: boolean;
}

export class BaseVisualChange {
  device: BootedDevice;
  adb: AdbUtils;
  axe: Axe;
  awaitIdle: AwaitIdle;
  observeScreen: ObserveScreen;
  window: Window;

  /**
   * Create an BaseVisualChange instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param axe - Optional Axe instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbUtils | null = null,
    axe: Axe | null = null
  ) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.axe = axe || new Axe(device);
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
    let packageName = options.packageName;
    const cachedPackageName = (await this.window.getCachedActiveWindow())?.appId;

    // Start all parallel operations immediately
    const parallelPromises: Promise<any>[] = [];

    // Always start UI stability tracking if we have a cached package name
    if (!packageName && cachedPackageName) {
      packageName = cachedPackageName;
      logger.info(`[BaseVisualChange] Starting optimistic UI stability initialization with cached package: ${packageName}`);
      parallelPromises.push(perf.track("initUiStabilityOptimistic", async () => {
        return this.awaitIdle.initializeUiStabilityTracking(
          packageName!,
          timeoutMs
        );
      }).catch(error => {
        logger.debug(`[BaseVisualChange] Optimistic initialization failed: ${error}`);
        return null;
      }));
    }

    if (this.device.platform === "android") {
      // Always start active window fetch to ensure we have the latest info
      logger.info("[BaseVisualChange] Starting active window fetch in parallel");
      parallelPromises.push(
        perf.track("getActiveWindow", async () => {
          return this.window.getActive(true);
        }).catch(error => {
          logger.debug(`[BaseVisualChange] Active window fetch failed: ${error}`);
          return null;
        })
      );
    }

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
    let gfxMetrics: GfxMetrics | null = null;
    if (packageName && packageName.trim() !== "") {
      perf.serial("uiStability");
      if (initState !== null) {
        gfxMetrics = await this.awaitIdle.waitForUiStabilityWithState(packageName, timeoutMs, initState, perf);
      } else {
        gfxMetrics = await this.awaitIdle.waitForUiStability(packageName, timeoutMs, perf);
      }
      perf.end();
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
      perf?: IPerformanceTracker;
      actionStartTime?: number;
    }
  ): Promise<any> {
    const perf = options.perf ?? new NoOpPerformanceTracker();

    // Use actionStartTime as minTimestamp to ensure we get data captured after the action
    // This prevents returning stale cached data from before the action was executed
    const minTimestamp = options.actionStartTime ?? 0;

    const latestObservation = await perf.track("finalObserve", async () => {
      return this.observeScreen.execute(options.queryOptions, new NoOpPerformanceTracker(), true, minTimestamp);
    });

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
