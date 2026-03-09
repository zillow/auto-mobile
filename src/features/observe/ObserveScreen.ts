import { logger } from "../../utils/logger";
import { throwIfAborted } from "../../utils/toolUtils";
import { BootedDevice, ExecResult, ObserveResult } from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { ScreenshotResult } from "../../models/ScreenshotResult";
import { GetScreenSize } from "./GetScreenSize";
import { GetSystemInsets } from "./GetSystemInsets";
import { ViewHierarchy } from "./ViewHierarchy";
import { Window } from "./Window";
import { TakeScreenshot } from "./TakeScreenshot";
import { GetDumpsysWindow } from "./GetDumpsysWindow";
import { GetBackStack } from "./GetBackStack";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { existsSync, mkdirSync } from "node:fs";
import { pathExists } from "../../utils/filesystem/DefaultFileSystem";
import path from "path";
import { readdirAsync, readFileAsync, statAsync, writeFileAsync } from "../../utils/io";
import { AndroidCtrlProxyManager } from "../../utils/CtrlProxyManager";
import { PerformanceTracker, NoOpPerformanceTracker, processTimingData } from "../../utils/PerformanceTracker";
import { PerformanceAudit } from "../performance/PerformanceAudit";
import { ThresholdManager } from "../performance/ThresholdManager";
import { DeviceCapabilitiesDetector } from "../../utils/DeviceCapabilities";
import { serverConfig } from "../../utils/ServerConfig";
import { WcagAudit } from "../accessibility/WcagAudit";
import { Element } from "../../models/Element";
import { RecompositionTracker } from "../performance/RecompositionTracker";
import { PredictiveUIState } from "./PredictiveUIState";
import { accessibilityDetector } from "../../utils/AccessibilityDetector";
import { iosVoiceOverDetector } from "../../utils/IosVoiceOverDetector";
import { FeatureFlagService } from "../featureFlags/FeatureFlagService";
import { OPERATION_CANCELLED_MESSAGE } from "../../utils/constants";
import { ScreenshotJobTracker } from "../../utils/ScreenshotJobTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { attachRawViewHierarchy } from "../../utils/viewHierarchySearch";
import { DefaultElementParser } from "../utility/ElementParser";
import { CtrlProxyClient as AndroidCtrlProxyClient } from "./android";
import { CtrlProxyClient as IOSCtrlProxyClient } from "./ios";
import { getTempDir, TEMP_SUBDIRS } from "../../utils/tempDir";
import type { ObserveScreen } from "./interfaces/ObserveScreen";
import type { ObserveScreenDependencies } from "./ObserveScreenDependencies";
import type { ScreenSize } from "./interfaces/ScreenSize";
import type { SystemInsets } from "./interfaces/SystemInsets";
import type { ViewHierarchy as ViewHierarchyInterface } from "./interfaces/ViewHierarchy";
import type { Window as WindowInterface } from "./interfaces/Window";
import type { DumpsysWindow } from "./interfaces/DumpsysWindow";
import type { BackStack } from "./interfaces/BackStack";
import type { PredictiveUIState as PredictiveUIStateInterface } from "./interfaces/PredictiveUIState";
import type { ScreenshotService } from "./interfaces/ScreenshotService";

/**
 * Interface for cached observe result
 */
interface ObserveResultCache {
  timestamp: number;
  observeResult: ObserveResult;
}

/**
 * Observe command class that combines screen details, view hierarchy and screenshot
 */
export class RealObserveScreen implements ObserveScreen {
  private device: BootedDevice;
  private screenSize: ScreenSize;
  private systemInsets: SystemInsets;
  private viewHierarchy: ViewHierarchyInterface;
  private window: WindowInterface;
  private screenshotUtil: ScreenshotService;
  private dumpsysWindow: DumpsysWindow;
  private backStack: BackStack;
  private adb: AdbExecutor;
  private adbFactory: AdbClientFactory;
  private predictiveUIState: PredictiveUIStateInterface;
  private timer: Timer;

  // Static cache for observe results
  private static observeResultCache: Map<string, ObserveResultCache> = new Map();
  private static observeResultCacheDir: string = getTempDir(TEMP_SUBDIRS.OBSERVE_RESULTS);
  private static readonly OBSERVE_RESULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static latestScreenshotPath: string | null = null;
  private static latestScreenshotError: string | null = null;
  private static latestScreenshotTimestamp: number | null = null;

  /**
   * Get the most recent cached observe result from memory (static accessor).
   * Returns the most recently cached result if available and not expired.
   */
  static getRecentCachedResult(): ObserveResult | undefined {
    if (RealObserveScreen.observeResultCache.size === 0) {
      return undefined;
    }

    const now = defaultTimer.now();
    let mostRecentEntry: ObserveResultCache | undefined;
    let mostRecentTimestamp = 0;

    for (const entry of RealObserveScreen.observeResultCache.values()) {
      const age = now - entry.timestamp;
      if (age <= RealObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS && entry.timestamp > mostRecentTimestamp) {
        mostRecentEntry = entry;
        mostRecentTimestamp = entry.timestamp;
      }
    }

    return mostRecentEntry?.observeResult;
  }

  /**
   * Get the most recent cached screenshot path (if any).
   */
  static getRecentCachedScreenshotPath(): string | undefined {
    const state = RealObserveScreen.getLatestScreenshotState();
    return state?.path ?? undefined;
  }

  /**
   * Get the most recent cached screenshot error (if any).
   */
  static getRecentCachedScreenshotError(): string | undefined {
    const state = RealObserveScreen.getLatestScreenshotState();
    return state?.error ?? undefined;
  }

  /**
   * Clear the in-memory cache (for testing purposes).
   */
  static clearCache(): void {
    RealObserveScreen.observeResultCache.clear();
    RealObserveScreen.latestScreenshotPath = null;
    RealObserveScreen.latestScreenshotError = null;
    RealObserveScreen.latestScreenshotTimestamp = null;
    ScreenshotJobTracker.clear();
  }

  constructor(
    device: BootedDevice,
    adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory,
    dependencies?: ObserveScreenDependencies,
    timer: Timer = defaultTimer
  ) {
    this.device = device;
    // Detect if the argument is a factory (has create method) or an executor
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      this.adbFactory = adbFactoryOrExecutor as AdbClientFactory;
      this.adb = this.adbFactory.create(device);
    } else if (adbFactoryOrExecutor) {
      // Legacy path: wrap the executor in a factory for downstream dependencies
      const executor = adbFactoryOrExecutor as AdbExecutor;
      this.adb = executor;
      this.adbFactory = { create: () => executor };
    } else {
      this.adbFactory = defaultAdbClientFactory;
      this.adb = this.adbFactory.create(device);
    }

    // Use injected dependencies or create defaults
    this.screenSize = dependencies?.screenSize ?? new GetScreenSize(device, this.adbFactory);
    this.systemInsets = dependencies?.systemInsets ?? new GetSystemInsets(device, this.adbFactory);
    this.viewHierarchy = dependencies?.viewHierarchy ?? new ViewHierarchy(device, this.adbFactory);
    this.window = dependencies?.window ?? new Window(device, this.adbFactory);
    this.screenshotUtil = dependencies?.screenshot ?? new TakeScreenshot(device, this.adbFactory);
    this.dumpsysWindow = dependencies?.dumpsysWindow ?? new GetDumpsysWindow(device, this.adbFactory);
    this.backStack = dependencies?.backStack ?? new GetBackStack(this.adbFactory, device);
    this.predictiveUIState = dependencies?.predictiveUIState ?? new PredictiveUIState();
    this.timer = timer;

    // Ensure observe result cache directory exists
    if (!existsSync(RealObserveScreen.observeResultCacheDir)) {
      mkdirSync(RealObserveScreen.observeResultCacheDir, { recursive: true });
    }
  }

  private static getLatestScreenshotState(): { path: string | null; error: string | null } | null {
    const timestamp = RealObserveScreen.latestScreenshotTimestamp;
    if (!timestamp) {
      return null;
    }

    const age = defaultTimer.now() - timestamp;
    if (age > RealObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS) {
      RealObserveScreen.latestScreenshotPath = null;
      RealObserveScreen.latestScreenshotError = null;
      RealObserveScreen.latestScreenshotTimestamp = null;
      return null;
    }

    return {
      path: RealObserveScreen.latestScreenshotPath,
      error: RealObserveScreen.latestScreenshotError
    };
  }

  private static updateLatestScreenshotCache(path?: string, error?: string): void {
    RealObserveScreen.latestScreenshotPath = path ?? null;
    RealObserveScreen.latestScreenshotError = error ?? null;
    RealObserveScreen.latestScreenshotTimestamp = defaultTimer.now();
  }

  private async handleScreenshotResult(
    screenshotResult: ScreenshotResult,
    options: { ignoreCancel?: boolean } = {}
  ): Promise<void> {
    if (!screenshotResult.success) {
      const errorMessage = screenshotResult.error || "Failed to capture screenshot";
      if (options.ignoreCancel && errorMessage.includes(OPERATION_CANCELLED_MESSAGE)) {
        logger.debug("[OBSERVE] Screenshot capture cancelled");
        return;
      }
      RealObserveScreen.updateLatestScreenshotCache(undefined, errorMessage);
      logger.warn(`[OBSERVE] Screenshot capture failed: ${errorMessage}`);
      return;
    }

    if (!screenshotResult.path) {
      RealObserveScreen.updateLatestScreenshotCache(undefined, "Screenshot capture returned no file path");
      logger.warn("[OBSERVE] Screenshot capture succeeded but no file path was returned");
      return;
    }

    const exists = await pathExists(screenshotResult.path);
    if (!exists) {
      RealObserveScreen.updateLatestScreenshotCache(undefined, "Screenshot file missing after capture");
      logger.warn(`[OBSERVE] Screenshot capture reported success but file missing: ${screenshotResult.path}`);
      return;
    }

    RealObserveScreen.updateLatestScreenshotCache(screenshotResult.path);
  }

  /**
   * Collect screen size and handle errors
   * @param dumpsysWindow - ExecResult containing dumpsys window output
   * @param result - ObserveResult to update
   */
  public async collectScreenSize(dumpsysWindow: ExecResult, result: ObserveResult): Promise<void> {
    try {
      const screenSizeStart = this.timer.now();
      result.screenSize = await this.screenSize.execute(dumpsysWindow);
      logger.debug(`Screen size retrieval took ${this.timer.now() - screenSizeStart}ms`);
    } catch (error) {
      logger.warn("Failed to get screen size:", error);
      this.appendError(result, "Failed to retrieve screen dimensions");
    }
  }

  /**
   * Collect system insets using cached dumpsys window output
   * @param dumpsysWindow - ExecResult containing dumpsys window output
   * @param result - ObserveResult to update
   */
  public async collectSystemInsets(dumpsysWindow: ExecResult, result: ObserveResult): Promise<void> {
    try {
      const insetsStart = this.timer.now();
      // Pass cached dumpsys window output to avoid duplicate call
      result.systemInsets = await this.systemInsets.execute(dumpsysWindow);
      logger.debug(`System insets retrieval took ${this.timer.now() - insetsStart}ms`);
    } catch (error) {
      logger.warn("Failed to get system insets:", error);
      this.appendError(result, "Failed to retrieve system insets");
    }
  }

  /**
   * Collect rotation info using cached dumpsys window output
   * @param dumpsysWindow - ExecResult containing dumpsys window output
   * @param result - ObserveResult to update
   */
  public async collectRotationInfo(dumpsysWindow: ExecResult, result: ObserveResult): Promise<void> {
    try {
      const rotationStart = this.timer.now();
      const rotationMatch = dumpsysWindow.stdout.match(/mRotation=(\d)/);
      if (rotationMatch) {
        result.rotation = parseInt(rotationMatch[1], 10);
      }
      logger.debug(`Rotation info retrieval took ${this.timer.now() - rotationStart}ms`);
    } catch (error) {
      logger.warn("Failed to get rotation info:", error);
    }
  }

  /**
   * Collect wakefulness state (Android only)
   * @param result - ObserveResult to update
   */
  public async collectWakefulness(result: ObserveResult, signal?: AbortSignal): Promise<void> {
    try {
      const wakefulness = await this.adb.getWakefulness(signal);
      if (wakefulness) {
        result.wakefulness = wakefulness;
      }
    } catch (error) {
      logger.warn("Failed to get wakefulness state:", error);
    }
  }

  /**
   * Collect back stack information (Android only)
   * @param result - ObserveResult to update
   * @param perf - Performance tracker for timing data
   */
  public async collectBackStack(
    result: ObserveResult,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const backStackStart = this.timer.now();
      const backStackInfo = await this.backStack.execute(perf, signal);
      result.backStack = backStackInfo;
      logger.debug(`Back stack retrieval took ${this.timer.now() - backStackStart}ms`);
    } catch (error) {
      logger.warn("Failed to get back stack:", error);
      this.appendError(result, "Failed to retrieve back stack information");
    }
  }

  /**
   * Collect view hierarchy and handle errors with accessibility service caching
   * @param result - ObserveResult to update
   * @param queryOptions - ViewHierarchyQueryOptions to pass to viewHierarchy.getViewHierarchy
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   */
  public async collectViewHierarchy(
    result: ObserveResult,
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      if (this.device.platform === "android") {
        await this.viewHierarchy.configureRecompositionTracking(true, perf);
      }

      const viewHierarchyStart = this.timer.now();
      const viewHierarchy = await this.viewHierarchy.getViewHierarchy(queryOptions, perf, skipWaitForFresh, minTimestamp, signal);
      logger.debug("Accessibility service availability cached as: true");

      if (viewHierarchy) {
        result.viewHierarchy = viewHierarchy;

        // Use the updatedAt from the view hierarchy if available (from accessibility service)
        if (viewHierarchy.updatedAt) {
          result.updatedAt = viewHierarchy.updatedAt;
          logger.debug(`Using updatedAt from view hierarchy: ${viewHierarchy.updatedAt}`);
        }

        const focusedElement = this.viewHierarchy.findFocusedElement(viewHierarchy);
        if (focusedElement) {
          result.focusedElement = focusedElement;
          logger.debug(`Found focused element: ${focusedElement.text || focusedElement["resource-id"] || "no text/id"}`);
        }

        const accessibilityFocusedElement = this.viewHierarchy.findAccessibilityFocusedElement(viewHierarchy);
        if (accessibilityFocusedElement) {
          result.accessibilityFocusedElement = accessibilityFocusedElement;
          logger.debug(`Found accessibility-focused element: ${accessibilityFocusedElement.text || accessibilityFocusedElement["resource-id"] || accessibilityFocusedElement["content-desc"] || "no text/id/desc"}`);
        }

        await this.detectIntentChooser(result);
        if (viewHierarchy.notificationPermissionDetected !== undefined) {
          result.notificationPermissionDetected = viewHierarchy.notificationPermissionDetected;
          if (viewHierarchy.notificationPermissionDetected) {
            logger.info("[ObserveScreen] Notification permission dialog detected in view hierarchy");
          }
        }
      }

      logger.debug(`View hierarchy retrieval took ${this.timer.now() - viewHierarchyStart}ms`);
    } catch (error) {
      logger.warn("Failed to get view hierarchy:", error);

      // Clear cache on failure
      AndroidCtrlProxyManager.getInstance(this.device, this.adb).clearAvailabilityCache();

      // Check if the error is due to screen being off
      const errorStr = String(error);
      if (
        errorStr.includes("null root node returned by UiTestAutomationBridge") ||
        (errorStr.includes("cat:") && errorStr.includes("No such file or directory")) ||
        (errorStr.includes("screen appears to be off"))
      ) {
        this.appendError(result, "Screen appears to be off or device is locked");
      } else {
        this.appendError(result, "Failed to retrieve view hierarchy");
      }
    }
  }

  /**
   * Detect intent chooser dialog in the view hierarchy
   * @param result - ObserveResult to update
   */
  private async detectIntentChooser(result: ObserveResult): Promise<void> {

    if (!result.viewHierarchy) {
      return;
    }

    try {
      const intentChooserDetected = result.viewHierarchy.intentChooserDetected;

      // Add intent chooser detection to result
      result.intentChooserDetected = intentChooserDetected;

      if (intentChooserDetected) {
        logger.info("[ObserveScreen] Intent chooser dialog detected in view hierarchy");
      }
    } catch (error) {
      logger.warn(`[ObserveScreen] Failed to detect intent chooser: ${error}`);
      // Don't fail the observation if intent chooser detection fails
    }
  }


  /**
   * Collect active window information using cache if available
   * @param result - ObserveResult to update
   */
  public async collectActiveWindow(result: ObserveResult): Promise<void> {
    try {
      logger.info("[OBSERVER] collectActiveWindow");
      const windowStart = this.timer.now();

      const activeWindow = await this.window.getActive();

      logger.info(`Active window retrieval took ${this.timer.now() - windowStart}ms`);
      if (activeWindow) {
        result.activeWindow = activeWindow;
      }
    } catch (error) {
      logger.warn("Failed to get active window:", error);
      this.appendError(result, "Failed to retrieve active window information");
    }
  }

  /**
   * Fetch raw (unfiltered) view hierarchy from the device and attach to an existing result.
   * On Android: requests the accessibility service hierarchy with all filtering disabled.
   * On iOS: requests the CtrlProxy iOS hierarchy with all filtering disabled.
   * Invalidates the shared cache after fetching so that the unfiltered snapshot does not
   * bleed into subsequent normal observe calls.
   */
  private async collectRawViewHierarchyData(result: ObserveResult, signal?: AbortSignal): Promise<void> {
    try {
      if (this.device.platform === "android") {
        const client = AndroidCtrlProxyClient.getInstance(this.device, this.adbFactory);
        // Use requestHierarchySync directly to bypass the cache — getAccessibilityHierarchy
        // with minTimestamp=0 returns any cached result, which may already be filtered.
        const syncResult = await client.requestHierarchySync(
          new NoOpPerformanceTracker(),
          true, // disableAllFiltering
          signal
        );
        // Invalidate the cache so the unfiltered snapshot is not served to subsequent
        // normal observe calls that expect a filtered hierarchy.
        client.invalidateCache();
        if (syncResult?.hierarchy) {
          result.rawViewHierarchy = {
            json: JSON.stringify(syncResult.hierarchy, null, 2),
            source: "accessibility-service",
            timestamp: this.timer.now(),
            device: { deviceId: this.device.deviceId, platform: this.device.platform }
          };
        }
      } else {
        const xcTestClient = IOSCtrlProxyClient.getInstance(this.device);
        const hierarchyResult = await xcTestClient.requestHierarchySync(
          new NoOpPerformanceTracker(),
          true, // disableAllFiltering
          signal
        );
        // Invalidate the cache so the unfiltered snapshot is not served to subsequent
        // normal observe calls that expect a filtered hierarchy.
        xcTestClient.invalidateCache();
        if (hierarchyResult?.hierarchy) {
          result.rawViewHierarchy = {
            xcuitest: JSON.stringify(hierarchyResult.hierarchy, null, 2),
            source: "xcuitest",
            timestamp: this.timer.now(),
            device: { deviceId: this.device.deviceId, platform: this.device.platform }
          };
        }
      }
    } catch (error) {
      logger.warn("[ObserveScreen] Failed to collect raw view hierarchy:", error);
    }
  }

  /**
   * Fetch raw view hierarchy and attach it to an existing observe result.
   * Call this after execute() when raw hierarchy data is needed.
   */
  public async appendRawViewHierarchy(result: ObserveResult, signal?: AbortSignal): Promise<void> {
    await this.collectRawViewHierarchyData(result, signal);
  }

  /**
   * Collect all observation data with parallelization
   * @param result - ObserveResult to update
   * @param queryOptions - ViewHierarchyQueryOptions to pass to viewHierarchy.getViewHierarchy
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   */
  public async collectAllData(
    result: ObserveResult,
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<void> {
    switch (this.device.platform) {
      case "android":
        // Phase 1: Get view hierarchy first (includes screen info from accessibility service)
        perf.serial("phase1_hierarchy");

        // Get view hierarchy (includes all device metadata from accessibility service)
        await this.collectViewHierarchy(result, queryOptions, perf, skipWaitForFresh, minTimestamp, signal);

        perf.end();

        // Use device metadata from accessibility service (no dumpsys fallback)
        const hierarchy = result.viewHierarchy;
        if (hierarchy?.screenWidth && hierarchy?.screenHeight) {
          result.screenSize = { width: hierarchy.screenWidth, height: hierarchy.screenHeight };
          if (hierarchy.rotation !== undefined) {
            result.rotation = hierarchy.rotation;
          }
          if (hierarchy.systemInsets) {
            result.systemInsets = hierarchy.systemInsets;
          }
          // Use wakefulness from accessibility service, fall back to ADB
          if (hierarchy.wakefulness) {
            result.wakefulness = hierarchy.wakefulness;
          } else {
            await perf.track("wakefulness", () => this.collectWakefulness(result, signal));
          }
          // Use foreground activity from accessibility service for activeWindow
          if (hierarchy.foregroundActivity) {
            const parts = hierarchy.foregroundActivity.split("/");
            const packageName = parts[0];
            const activityName = parts[1]?.startsWith(".")
              ? packageName + parts[1]
              : parts[1] || "";
            result.activeWindow = {
              appId: packageName,
              activityName,
              layoutSeqSum: 0
            };
          }
          // Always use ADB for back stack (accessibility service cannot determine stack depth)
          await perf.track("backStack", () => this.collectBackStack(result, perf, signal));
          logger.debug("[OBSERVE] Using device metadata from accessibility service");
        } else {
          logger.warn("[OBSERVE] No screen info from accessibility service - check if APK is updated");
          // Fall back to ADB for all metadata
          await Promise.all([
            perf.track("wakefulness", () => this.collectWakefulness(result, signal)),
            perf.track("backStack", () => this.collectBackStack(result, perf, signal)),
          ]);
        }

        // Note: Offscreen filtering is now done in the Android accessibility service (Kotlin)
        // for better performance (avoids serializing/transferring filtered data)

        // Populate activeWindow from view hierarchy packageName if not already set
        if (result.viewHierarchy?.packageName && !result.activeWindow) {
          result.activeWindow = {
            appId: result.viewHierarchy.packageName,
            activityName: "",
            layoutSeqSum: 0
          };
        }

        // Fallback: if activeWindow still not populated, use the Window class
        if (!result.activeWindow) {
          await this.collectActiveWindow(result);
        }

        if (result.notificationPermissionDetected && result.activeWindow) {
          result.activeWindow.type = "notification_permission_dialog";
        }

        break;

      case "ios":
        // iOS-specific data collection logic here
        perf.serial("ios_collect");

        // Collect view hierarchy (fast via CtrlProxy iOS WebSocket)
        await this.collectViewHierarchy(result, queryOptions, perf, skipWaitForFresh, minTimestamp, signal);

        // Extract screen size from hierarchy
        {
          const extractedSize = this.extractScreenSizeFromHierarchy(result.viewHierarchy);
          if (extractedSize) {
            result.screenSize = extractedSize;
            logger.debug(`[iOS] Extracted screen size from hierarchy: ${extractedSize.width}x${extractedSize.height}`);
          } else if (result.viewHierarchy?.screenWidth && result.viewHierarchy?.screenHeight) {
            // Fallback to screenWidth/screenHeight from CtrlProxy iOS (logical points)
            result.screenSize = {
              width: result.viewHierarchy.screenWidth,
              height: result.viewHierarchy.screenHeight
            };
            logger.debug(`[iOS] Using screen size from CtrlProxy iOS: ${result.screenSize.width}x${result.screenSize.height}`);
          } else {
            logger.warn("[iOS] Failed to extract screen size from hierarchy");
          }
        }

        // Filter out completely offscreen nodes to reduce hierarchy size
        if (result.viewHierarchy && result.screenSize?.width > 0 && result.screenSize?.height > 0) {
          const rawHierarchy = result.viewHierarchy;
          result.viewHierarchy = this.viewHierarchy.filterOffscreenNodes(
            rawHierarchy,
            result.screenSize.width,
            result.screenSize.height
          );
          if (serverConfig.isRawElementSearchEnabled()) {
            attachRawViewHierarchy(result.viewHierarchy, rawHierarchy);
          }
        }

        perf.end();
        break;
    }
  }

  /**
   * Capture a screenshot for the latest observation.
   */
  private async captureObservationScreenshot(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    signal?: AbortSignal
  ): Promise<void> {
    try {
      await perf.track("screenshot", async () => {
        const { promise } = this.screenshotUtil.startTrackedCapture(
          { format: "png" },
          {
            parentSignal: signal,
            onComplete: async completion => {
              if (!completion.isLatest) {
                return;
              }
              if (completion.aborted) {
                logger.debug("[OBSERVE] Screenshot capture cancelled");
                return;
              }
              try {
                await this.handleScreenshotResult(completion.result, { ignoreCancel: true });
              } catch (err) {
                logger.warn(`[OBSERVE] Failed to finalize screenshot capture: ${err}`);
              }
            }
          }
        );
        await promise;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes(OPERATION_CANCELLED_MESSAGE)) {
        logger.debug("[OBSERVE] Screenshot capture cancelled");
        return;
      }
      RealObserveScreen.updateLatestScreenshotCache(undefined, errorMessage);
      logger.warn(`[OBSERVE] Screenshot capture failed: ${errorMessage}`);
    }
  }

  private startObservationScreenshot(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    signal?: AbortSignal
  ): void {
    perf.startOperation("screenshot");
    const { promise } = this.screenshotUtil.startTrackedCapture(
      { format: "png" },
      {
        parentSignal: signal,
        onComplete: async completion => {
          if (!completion.isLatest) {
            return;
          }
          if (completion.aborted) {
            logger.debug("[OBSERVE] Screenshot capture cancelled");
            return;
          }
          try {
            await this.handleScreenshotResult(completion.result, { ignoreCancel: true });
          } catch (err) {
            logger.warn(`[OBSERVE] Failed to finalize screenshot capture: ${err}`);
          }
        }
      }
    );

    promise.finally(() => {
      perf.endOperation("screenshot");
    });
  }

  /**
   * Extract screen size from view hierarchy root node bounds.
   * Supports both Android format ("[left,top][right,bottom]") and iOS format ({left, top, right, bottom}).
   * @param viewHierarchy - View hierarchy result
   * @returns Screen size or null if unable to extract
   */
  private extractScreenSizeFromHierarchy(viewHierarchy: ObserveResult["viewHierarchy"]): { width: number; height: number } | null {
    // Android format: hierarchy.node.$.bounds = "[0,0][402,874]"
    const rootNode = viewHierarchy?.hierarchy?.node;
    if (rootNode?.$?.bounds) {
      const boundsStr = rootNode.$.bounds;
      const match = boundsStr.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
      if (match) {
        const width = parseInt(match[3], 10) - parseInt(match[1], 10);
        const height = parseInt(match[4], 10) - parseInt(match[2], 10);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
    }

    // iOS format: hierarchy is the root XCTestNode with bounds as {left, top, right, bottom}
    const iosHierarchy = viewHierarchy?.hierarchy as any;
    if (iosHierarchy?.bounds && typeof iosHierarchy.bounds === "object" && !Array.isArray(iosHierarchy.bounds)) {
      const { left, top, right, bottom } = iosHierarchy.bounds;
      if (typeof right === "number" && typeof bottom === "number") {
        const width = right - (left ?? 0);
        const height = bottom - (top ?? 0);
        if (width > 0 && height > 0) {
          return { width, height };
        }
      }
    }

    return null;
  }

  /**
   * Append error message to result
   * @param result - ObserveResult to update
   * @param newError - Error message to append
   */
  appendError(result: ObserveResult, newError: string): void {
    if (result.error) {
      result.error += `; ${newError}`;
    } else {
      result.error = newError;
    }
  }

  /**
   * Create base observe result object
   * @returns Base ObserveResult with updatedAt and default values
   */
  createBaseResult(): ObserveResult {
    return {
      updatedAt: new Date().toISOString(),
      screenSize: { width: 0, height: 0 },
      systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  /**
   * Resolve observation timestamp in milliseconds (device time if available).
   */
  private resolveObservationTimestampMs(result: ObserveResult): number | undefined {
    const candidate = result.viewHierarchy?.updatedAt ?? result.updatedAt;
    if (typeof candidate === "number" && !Number.isNaN(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Date.parse(candidate);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  /**
   * Get the most recent cached observe result from memory or disk cache
   * @returns Promise<ObserveResult> - The most recent cached observe result
   */
  async getMostRecentCachedObserveResult(): Promise<ObserveResult> {
    const startTime = this.timer.now();

    try {
      logger.info("[OBSERVE_CACHE] Getting most recent cached observe result");

      // Check in-memory cache first
      const memoryResult = await this.checkInMemoryObserveCache();
      if (memoryResult) {
        const duration = this.timer.now() - startTime;
        logger.info(`[OBSERVE_CACHE] Found recent result in memory cache (${duration}ms)`);
        return memoryResult;
      }

      // Check disk cache
      const diskResult = await this.checkDiskObserveCache();
      if (diskResult) {
        const duration = this.timer.now() - startTime;
        logger.info(`[OBSERVE_CACHE] Found recent result in disk cache (${duration}ms)`);
        return diskResult;
      }

      // No cached result available
      const duration = this.timer.now() - startTime;
      logger.info(`[OBSERVE_CACHE] No cached observe result available (${duration}ms)`);

      return {
        updatedAt: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "No cached observe result available"
      };
    } catch (error) {
      const duration = this.timer.now() - startTime;
      logger.warn(`[OBSERVE_CACHE] Error getting cached observe result after ${duration}ms: ${error}`);

      return {
        updatedAt: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Failed to retrieve cached observe result"
      };
    }
  }

  /**
   * Check in-memory cache for most recent observe result
   * @returns Promise<ObserveResult | null> - Most recent cached result or null
   */
  private async checkInMemoryObserveCache(): Promise<ObserveResult | null> {
    const cacheSize = RealObserveScreen.observeResultCache.size;
    logger.info(`[OBSERVE_CACHE] Checking in-memory cache, size: ${cacheSize}`);

    if (cacheSize === 0) {
      logger.info("[OBSERVE_CACHE] In-memory cache is empty");
      return null;
    }

    const now = this.timer.now();
    const ttl = RealObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS;

    // Remove expired entries and find most recent
    const expiredKeys: string[] = [];
    let mostRecentEntry: ObserveResultCache | null = null;

    for (const [key, cachedEntry] of RealObserveScreen.observeResultCache.entries()) {
      const age = now - cachedEntry.timestamp;

      if (age >= ttl) {
        expiredKeys.push(key);
        logger.info(`[OBSERVE_CACHE] Removing expired cache entry: ${key} (age: ${age}ms > TTL: ${ttl}ms)`);
      } else {
        // Check if this is the most recent valid entry
        if (!mostRecentEntry || cachedEntry.timestamp > mostRecentEntry.timestamp) {
          mostRecentEntry = cachedEntry;
        }
      }
    }

    // Remove expired entries
    for (const key of expiredKeys) {
      RealObserveScreen.observeResultCache.delete(key);
    }

    if (mostRecentEntry) {
      const age = now - mostRecentEntry.timestamp;
      logger.info(`[OBSERVE_CACHE] Found most recent in-memory result (age: ${age}ms)`);
      return mostRecentEntry.observeResult;
    }

    logger.info("[OBSERVE_CACHE] No valid entries in in-memory cache");
    return null;
  }

  /**
   * Check disk cache for most recent observe result
   * @returns Promise<ObserveResult | null> - Most recent cached result or null
   */
  private async checkDiskObserveCache(): Promise<ObserveResult | null> {
    logger.info("[OBSERVE_CACHE] Checking disk cache");

    try {
      // Get all JSON files in the cache directory
      const files = await readdirAsync(RealObserveScreen.observeResultCacheDir);
      const jsonFiles = files.filter(file => file.endsWith(".json") && file.startsWith("observe_"));

      if (jsonFiles.length === 0) {
        logger.info("[OBSERVE_CACHE] No observe result files found in disk cache");
        return null;
      }

      const now = this.timer.now();
      const ttl = RealObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS;
      let mostRecentFile: { path: string, mtime: number } | null = null;

      // Find the most recent valid file
      for (const file of jsonFiles) {
        const filePath = path.join(RealObserveScreen.observeResultCacheDir, file);
        const stats = await statAsync(filePath);
        const age = now - stats.mtime.getTime();

        if (age < ttl) {
          if (!mostRecentFile || stats.mtime.getTime() > mostRecentFile.mtime) {
            mostRecentFile = { path: filePath, mtime: stats.mtime.getTime() };
          }
        } else {
          // TODO: Remove old file
          logger.debug(`[OBSERVE_CACHE] Disk cache file expired: ${file} (age: ${age}ms > TTL: ${ttl}ms)`);
        }
      }

      if (mostRecentFile) {
        const age = now - mostRecentFile.mtime;
        logger.info(`[OBSERVE_CACHE] Loading most recent disk cache file (age: ${age}ms)`);

        const cacheData = await readFileAsync(mostRecentFile.path, "utf8");
        const cachedResult: ObserveResult = JSON.parse(cacheData);

        // Also update the in-memory cache
        const timestamp = mostRecentFile.mtime.toString();
        RealObserveScreen.observeResultCache.set(timestamp, {
          timestamp: mostRecentFile.mtime,
          observeResult: cachedResult
        });

        logger.info(`[OBSERVE_CACHE] Updated in-memory cache from disk cache`);
        return cachedResult;
      }

      logger.info("[OBSERVE_CACHE] No valid files in disk cache");
      return null;
    } catch (error) {
      logger.warn(`[OBSERVE_CACHE] Error checking disk cache: ${error}`);
      return null;
    }
  }

  /**
   * Cache observe result in memory and disk
   * @param observeResult - The observe result to cache
   */
  async cacheObserveResult(observeResult: ObserveResult): Promise<void> {
    const timestamp = this.timer.now();
    const timestampKey = timestamp.toString();

    try {
      logger.info(`[OBSERVE_CACHE] Caching observe result with timestamp ${timestamp}`);

      // Cache in memory
      RealObserveScreen.observeResultCache.set(timestampKey, {
        timestamp,
        observeResult
      });

      // Cache on disk
      await this.saveObserveResultToDisk(timestampKey, observeResult);

      logger.info(`[OBSERVE_CACHE] Successfully cached observe result, in-memory cache size: ${RealObserveScreen.observeResultCache.size}`);
    } catch (error) {
      logger.warn(`[OBSERVE_CACHE] Error caching observe result: ${error}`);
    }
  }

  /**
   * Save observe result to disk cache
   * @param timestamp - Timestamp for filename
   * @param observeResult - The observe result to save
   */
  private async saveObserveResultToDisk(timestamp: string, observeResult: ObserveResult): Promise<void> {
    try {
      const filename = `observe_${timestamp}.json`;
      const filePath = path.join(RealObserveScreen.observeResultCacheDir, filename);

      await writeFileAsync(filePath, JSON.stringify(observeResult, null, 2));
      logger.info(`[OBSERVE_CACHE] Saved observe result to disk: ${filename}`);
    } catch (error) {
      logger.warn(`[OBSERVE_CACHE] Failed to save observe result to disk: ${error}`);
    }
  }

  /**
   * Run performance audit if enabled
   * Checks --ui-perf-mode CLI flag to enable/disable
   * @param result - ObserveResult to attach audit results to
   * @param perf - Performance tracker
   */
  private async runPerformanceAudit(
    result: ObserveResult,
    perf: PerformanceTracker
  ): Promise<void> {
    // Check if performance audit is enabled via CLI flag
    // This will be replaced with global configuration in issue #67
    const auditEnabled = serverConfig.isUiPerfModeEnabled();

    if (!auditEnabled) {
      return;
    }

    // Only run on Android for now
    if (this.device.platform !== "android") {
      logger.debug("[PerformanceAudit] Skipping audit, only Android is supported");
      return;
    }

    // Need an active window with app ID
    if (!result.activeWindow?.appId) {
      logger.debug("[PerformanceAudit] Skipping audit, no active app");
      return;
    }

    try {
      await perf.track("performanceAudit", async () => {
        logger.info(`[PerformanceAudit] Running UI performance audit for ${result.activeWindow?.appId}`);

        // Initialize components
        const capabilitiesDetector = new DeviceCapabilitiesDetector(this.device, this.adb);
        const thresholdManager = new ThresholdManager();
        const performanceAudit = new PerformanceAudit(this.device, this.adb);

        // Get device capabilities
        const capabilities = await capabilitiesDetector.getCapabilities();

        // Get or create thresholds
        const thresholds = await thresholdManager.getOrCreateThresholds(
          this.device.deviceId,
          capabilities
        );

        // Run the audit
        const auditResult = await performanceAudit.runAudit(
          result.activeWindow!.appId,
          thresholds,
          result.screenSize,
          perf
        );

        // Attach audit result to observe result
        result.performanceAudit = auditResult;

        // Update threshold weight based on result
        const sessionId = new Date().toISOString().split("T")[0];
        await thresholdManager.updateThresholdWeight(
          this.device.deviceId,
          sessionId,
          auditResult.passed
        );

        if (!auditResult.passed) {
          logger.warn(
            `[PerformanceAudit] Performance audit FAILED with ${auditResult.violations.length} violations`
          );
        } else {
          logger.info("[PerformanceAudit] Performance audit PASSED");
        }

        // Start continuous performance monitoring for this device/package
        const { getPerformanceMonitor } = await import("../performance/PerformanceMonitor");
        getPerformanceMonitor().startMonitoring(this.device.deviceId, result.activeWindow!.appId, this.device.platform);
      });
    } catch (error) {
      logger.error(`[PerformanceAudit] Failed to run performance audit: ${error}`);
      // Don't fail the entire observation if audit fails
    }
  }

  /**
   * Run accessibility audit if enabled
   * Checks --accessibility-audit CLI flag to enable/disable
   * @param result - ObserveResult to attach audit results to
   * @param perf - Performance tracker
   */
  private async runAccessibilityAudit(
    result: ObserveResult,
    perf: PerformanceTracker
  ): Promise<void> {
    // Check if accessibility audit is enabled via CLI flag
    const auditConfig = serverConfig.getAccessibilityAuditConfig();

    if (!auditConfig) {
      return;
    }

    // Only run on Android for now
    if (this.device.platform !== "android") {
      logger.debug("[AccessibilityAudit] Skipping audit, only Android is supported");
      return;
    }

    // Need view hierarchy
    if (!result.viewHierarchy?.hierarchy) {
      logger.debug("[AccessibilityAudit] Skipping audit, no view hierarchy available");
      return;
    }

    // Need active window for screen ID
    if (!result.activeWindow?.appId) {
      logger.debug("[AccessibilityAudit] Skipping audit, no active app");
      return;
    }

    try {
      await perf.track("accessibilityAudit", async () => {
        logger.info(`[AccessibilityAudit] Running WCAG ${auditConfig.level} audit for ${result.activeWindow?.appId}`);

        // Initialize audit
        const wcagAudit = new WcagAudit();

        // Extract elements directly from view hierarchy for audit
        const elementParser = new DefaultElementParser();
        const allElements: Element[] = elementParser.flattenViewHierarchy(result.viewHierarchy!)
          .map(entry => entry.element);

        // Get screenshot path if available (from TakeScreenshot cache)
        const screenshotPath = await this.getLatestScreenshotPath();

        // Run the audit
        const auditResult = await wcagAudit.audit(
          allElements,
          result.viewHierarchy!.hierarchy,
          screenshotPath,
          result.activeWindow!.appId,
          auditConfig
        );

        // Attach audit result to observe result
        result.accessibilityAudit = auditResult;

        if (!auditResult.summary.passed) {
          logger.warn(
            `[AccessibilityAudit] Accessibility audit FAILED with ${auditResult.violations.length} violations (${auditResult.summary.bySeverity.error} errors, ${auditResult.summary.bySeverity.warning} warnings)`
          );
        } else {
          logger.info("[AccessibilityAudit] Accessibility audit PASSED");
        }
      });
    } catch (error) {
      logger.error(`[AccessibilityAudit] Failed to run accessibility audit: ${error}`);
      // Don't fail the entire observation if audit fails
    }
  }

  /**
   * Detect accessibility state (TalkBack/VoiceOver) and attach to result
   * @param result - ObserveResult to attach accessibility state to
   * @param perf - Performance tracker
   * @param signal - Abort signal
   */
  private async detectAccessibilityState(
    result: ObserveResult,
    perf: PerformanceTracker,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      await perf.track("accessibilityDetection", async () => {
        throwIfAborted(signal);

        // Get feature flag service instance
        const featureFlags = FeatureFlagService.getInstance();

        if (this.device.platform === "android") {
          // Detect TalkBack state via ADB
          const enabled = await accessibilityDetector.isAccessibilityEnabled(
            this.device.deviceId,
            this.adb,
            featureFlags
          );

          const service = await accessibilityDetector.detectMethod(
            this.device.deviceId,
            this.adb,
            featureFlags
          );

          result.accessibilityState = { enabled, service };
          logger.debug(
            `[AccessibilityDetector] Android accessibility state: enabled=${enabled}, service=${service}`
          );
        } else if (this.device.platform === "ios") {
          // Detect VoiceOver state via CtrlProxy WebSocket
          const client = IOSCtrlProxyClient.getInstance(this.device);
          const enabled = await iosVoiceOverDetector.isVoiceOverEnabled(
            this.device.deviceId,
            client,
            featureFlags
          );

          result.accessibilityState = {
            enabled,
            service: enabled ? "voiceover" : "unknown",
          };
          logger.debug(`[IosVoiceOverDetector] iOS VoiceOver state: enabled=${enabled}`);
        }
      });
    } catch (error) {
      logger.error(`[detectAccessibilityState] Failed to detect accessibility state: ${error}`);
      // Don't fail the entire observation if detection fails
      // Result will simply not include accessibilityState field
    }
  }

  /**
   * Get the latest screenshot path from cache
   */
  private async getLatestScreenshotPath(): Promise<string | undefined> {
    try {
      const cachedPath = RealObserveScreen.getRecentCachedScreenshotPath();
      if (cachedPath) {
        const exists = await pathExists(cachedPath);
        if (exists) {
          return cachedPath;
        }
      }

      const cacheDir = getTempDir(TEMP_SUBDIRS.SCREENSHOTS);
      if (!existsSync(cacheDir)) {
        return undefined;
      }

      const files = await readdirAsync(cacheDir);
      const imageFiles = files.filter(f => f.endsWith(".png") || f.endsWith(".webp"));

      if (imageFiles.length === 0) {
        return undefined;
      }

      // Sort by modification time (most recent first)
      const fileStats = await Promise.all(
        imageFiles.map(async f => {
          const fullPath = path.join(cacheDir, f);
          const stat = await statAsync(fullPath);
          return { path: fullPath, mtime: stat.mtime };
        })
      );

      fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return fileStats[0]?.path;
    } catch (error) {
      logger.warn(`[AccessibilityAudit] Failed to get latest screenshot: ${error}`);
      return undefined;
    }
  }

  /**
   * Execute the observe command
   * @param queryOptions - ViewHierarchyQueryOptions to pass to viewHierarchy.getViewHierarchy
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method (default: true for direct observe calls)
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value (used after actions to ensure fresh data)
   * @returns The observation result
   */
  async execute(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = true, // Default to true for direct observe tool requests
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<ObserveResult> {
    try {
      logger.debug(`Executing observe command (skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp})`);
      const startTime = this.timer.now();
      throwIfAborted(signal);

      // Create base result object with timestamp
      const result = this.createBaseResult();

      // Wrap entire observation in serial tracking
      perf.serial("observe");

      // Collect all data components with parallelization
      // Note: collectAllData tracks its phases internally, so we just call it directly
      await this.collectAllData(result, queryOptions, perf, skipWaitForFresh, minTimestamp, signal);

      // Capture screenshot for latest observation resource
      if (serverConfig.getAccessibilityAuditConfig()) {
        await this.captureObservationScreenshot(perf, signal);
      } else {
        this.startObservationScreenshot(perf, signal);
      }

      // Attach recomposition metrics if enabled
      await RecompositionTracker.getInstance().processObservation(result, this.device);

      // Run performance audit if enabled
      await this.runPerformanceAudit(result, perf);

      // Run accessibility audit if enabled
      await this.runAccessibilityAudit(result, perf);

      // Detect accessibility state (TalkBack/VoiceOver)
      await this.detectAccessibilityState(result, perf, signal);

      if (serverConfig.isPredictiveUiEnabled()) {
        try {
          const predictions = await this.predictiveUIState.generate(result);
          if (predictions) {
            result.predictions = predictions;
          }
        } catch (error) {
          logger.warn(`[PredictiveUIState] Failed to generate predictions: ${error}`);
        }
      }

      // Cache the result for future use
      await perf.track("cacheResult", () => this.cacheObserveResult(result));

      perf.end();

      const requestedAfter = minTimestamp > 0 ? minTimestamp : undefined;
      const actualTimestamp = this.resolveObservationTimestampMs(result);
      const isFresh = requestedAfter === undefined
        ? true
        : actualTimestamp !== undefined && actualTimestamp >= requestedAfter;
      const staleDurationMs = requestedAfter !== undefined && actualTimestamp !== undefined && actualTimestamp < requestedAfter
        ? requestedAfter - actualTimestamp
        : undefined;
      result.freshness = {
        requestedAfter,
        actualTimestamp,
        isFresh,
        staleDurationMs
      };

      // Attach performance timing if enabled (with filtering and truncation)
      const timings = perf.getTimings();
      const processedTimings = processTimingData(timings);
      if (processedTimings) {
        result.perfTiming = processedTimings.data;
        if (processedTimings.truncated) {
          result.perfTimingTruncated = true;
        }
      }

      logger.debug("Observe command completed");
      logger.debug(`Total observe command execution took ${this.timer.now() - startTime}ms`);
      return result;
    } catch (err) {
      logger.error("Critical error in observe command:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      ScreenshotJobTracker.cancelJob(this.device.deviceId);
      RealObserveScreen.updateLatestScreenshotCache(undefined, `Observation failed: ${errorMessage}`);
      return {
        updatedAt: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Observation failed due to device access error"
      };
    }
  }
}
