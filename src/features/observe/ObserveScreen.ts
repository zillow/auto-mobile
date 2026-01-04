import { logger } from "../../utils/logger";
import { BootedDevice, ExecResult, ObserveResult } from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { GetScreenSize } from "./GetScreenSize";
import { GetSystemInsets } from "./GetSystemInsets";
import { ViewHierarchy } from "./ViewHierarchy";
import { Window } from "./Window";
import { TakeScreenshot } from "./TakeScreenshot";
import { GetDumpsysWindow } from "./GetDumpsysWindow";
import { GetBackStack } from "./GetBackStack";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import fs from "fs-extra";
import path from "path";
import { readdirAsync, readFileAsync, statAsync, writeFileAsync } from "../../utils/io";
import { AndroidAccessibilityServiceManager } from "../../utils/AccessibilityServiceManager";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { WebDriverAgent } from "../../utils/ios-cmdline-tools/WebDriverAgent";
import { PerformanceTracker, NoOpPerformanceTracker, processTimingData } from "../../utils/PerformanceTracker";
import { PerformanceAudit } from "../performance/PerformanceAudit";
import { ThresholdManager } from "../performance/ThresholdManager";
import { DeviceCapabilitiesDetector } from "../../utils/DeviceCapabilities";
import { serverConfig } from "../../utils/ServerConfig";
import { WcagAudit } from "../accessibility/WcagAudit";
import { Element } from "../../models/Element";
import { RecompositionTracker } from "../performance/RecompositionTracker";

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
export class ObserveScreen {
  private device: BootedDevice;
  private screenSize: GetScreenSize;
  private systemInsets: GetSystemInsets;
  private viewHierarchy: ViewHierarchy;
  private window: Window;
  private screenshotUtil: TakeScreenshot;
  private dumpsysWindow: GetDumpsysWindow;
  private backStack: GetBackStack;
  private adb: AdbClient;
  private axe: AxeClient;
  private webdriver: WebDriverAgent;

  // Static cache for observe results
  private static observeResultCache: Map<string, ObserveResultCache> = new Map();
  private static observeResultCacheDir: string = path.join("/tmp/auto-mobile", "observe_results");
  private static readonly OBSERVE_RESULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Get the most recent cached observe result from memory (static accessor).
   * Returns the most recently cached result if available and not expired.
   */
  static getRecentCachedResult(): ObserveResult | undefined {
    if (ObserveScreen.observeResultCache.size === 0) {
      return undefined;
    }

    const now = Date.now();
    let mostRecentEntry: ObserveResultCache | undefined;
    let mostRecentTimestamp = 0;

    for (const entry of ObserveScreen.observeResultCache.values()) {
      const age = now - entry.timestamp;
      if (age <= ObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS && entry.timestamp > mostRecentTimestamp) {
        mostRecentEntry = entry;
        mostRecentTimestamp = entry.timestamp;
      }
    }

    return mostRecentEntry?.observeResult;
  }

  /**
   * Clear the in-memory cache (for testing purposes).
   */
  static clearCache(): void {
    ObserveScreen.observeResultCache.clear();
  }

  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null, webdriver: WebDriverAgent | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.axe = axe || new AxeClient(device);
    this.webdriver = webdriver || new WebDriverAgent(device);
    this.screenSize = new GetScreenSize(device, this.adb);
    this.systemInsets = new GetSystemInsets(device, this.adb);
    this.viewHierarchy = new ViewHierarchy(device, this.adb);
    this.window = new Window(device, this.adb);
    this.screenshotUtil = new TakeScreenshot(device, this.adb);
    this.dumpsysWindow = new GetDumpsysWindow(device, this.adb);
    this.backStack = new GetBackStack(this.adb);

    // Ensure observe result cache directory exists
    if (!fs.existsSync(ObserveScreen.observeResultCacheDir)) {
      fs.mkdirSync(ObserveScreen.observeResultCacheDir, { recursive: true });
    }
  }

  /**
   * Collect screen size and handle errors
   * @param dumpsysWindow - ExecResult containing dumpsys window output
   * @param result - ObserveResult to update
   */
  public async collectScreenSize(dumpsysWindow: ExecResult, result: ObserveResult): Promise<void> {
    try {
      const screenSizeStart = Date.now();
      result.screenSize = await this.screenSize.execute(dumpsysWindow);
      logger.debug(`Screen size retrieval took ${Date.now() - screenSizeStart}ms`);
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
      const insetsStart = Date.now();
      // Pass cached dumpsys window output to avoid duplicate call
      result.systemInsets = await this.systemInsets.execute(dumpsysWindow);
      logger.debug(`System insets retrieval took ${Date.now() - insetsStart}ms`);
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
      const rotationStart = Date.now();
      const rotationMatch = dumpsysWindow.stdout.match(/mRotation=(\d)/);
      if (rotationMatch) {
        result.rotation = parseInt(rotationMatch[1], 10);
      }
      logger.debug(`Rotation info retrieval took ${Date.now() - rotationStart}ms`);
    } catch (error) {
      logger.warn("Failed to get rotation info:", error);
    }
  }

  /**
   * Collect wakefulness state (Android only)
   * @param result - ObserveResult to update
   */
  public async collectWakefulness(result: ObserveResult): Promise<void> {
    try {
      const wakefulness = await this.adb.getWakefulness();
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
  public async collectBackStack(result: ObserveResult, perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<void> {
    try {
      const backStackStart = Date.now();
      const backStackInfo = await this.backStack.execute(perf);
      result.backStack = backStackInfo;
      logger.debug(`Back stack retrieval took ${Date.now() - backStackStart}ms`);
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
    minTimestamp: number = 0
  ): Promise<void> {
    try {
      if (this.device.platform === "android") {
        await this.viewHierarchy.configureRecompositionTracking(serverConfig.isUiPerfDebugModeEnabled(), perf);
      }

      const viewHierarchyStart = Date.now();
      const viewHierarchy = await this.viewHierarchy.getViewHierarchy(queryOptions, perf, skipWaitForFresh, minTimestamp);
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
        await this.detectIntentChooser(result);
      }

      logger.debug(`View hierarchy retrieval took ${Date.now() - viewHierarchyStart}ms`);
    } catch (error) {
      logger.warn("Failed to get view hierarchy:", error);

      // Clear cache on failure
      AndroidAccessibilityServiceManager.getInstance(this.device, this.adb).clearAvailabilityCache();

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
      const windowStart = Date.now();

      const activeWindow = await this.window.getActive();

      logger.info(`Active window retrieval took ${Date.now() - windowStart}ms`);
      if (activeWindow) {
        result.activeWindow = activeWindow;
      }
    } catch (error) {
      logger.warn("Failed to get active window:", error);
      this.appendError(result, "Failed to retrieve active window information");
    }
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
    minTimestamp: number = 0
  ): Promise<void> {
    switch (this.device.platform) {
      case "android":
        // Phase 1: Get dumpsys window data for screen info
        // Note: We no longer call collectActiveWindow here - packageName comes from accessibility service
        perf.serial("phase1_initial");

        const dumpsysWindow = await perf.track("dumpsysWindow", () => this.dumpsysWindow.execute());
        perf.end();

        // Phase 2: Parallel - quick operations using shared dumpsys data
        perf.parallel("phase2_collect");

        await Promise.all([
          perf.track("screenSize", () => this.collectScreenSize(dumpsysWindow, result)),
          perf.track("systemInsets", () => this.collectSystemInsets(dumpsysWindow, result)),
          perf.track("rotation", () => this.collectRotationInfo(dumpsysWindow, result)),
          perf.track("wakefulness", () => this.collectWakefulness(result)),
          perf.track("backStack", () => this.collectBackStack(result, perf)),
        ]);

        // Run view hierarchy separately to avoid perf tracker race condition
        // (it creates nested serial blocks that conflict with parallel tracking)
        await this.collectViewHierarchy(result, queryOptions, perf, skipWaitForFresh, minTimestamp);

        // Note: Offscreen filtering is now done in the Android accessibility service (Kotlin)
        // for better performance (avoids serializing/transferring filtered data)

        // Populate activeWindow from view hierarchy packageName if available
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

        perf.end();
        break;

      case "ios":
        // iOS-specific data collection logic here
        perf.parallel("ios_collect");

        await Promise.all([
          perf.track("screenSize", () => this.collectScreenSize({} as ExecResult, result)),
          this.collectViewHierarchy(result, queryOptions, perf, skipWaitForFresh, minTimestamp),
        ]);

        // Filter out completely offscreen nodes to reduce hierarchy size
        if (result.viewHierarchy && result.screenSize?.width > 0 && result.screenSize?.height > 0) {
          result.viewHierarchy = this.viewHierarchy.filterOffscreenNodes(
            result.viewHierarchy,
            result.screenSize.width,
            result.screenSize.height
          );
        }

        perf.end();
        break;
    }
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
    const startTime = Date.now();

    try {
      logger.info("[OBSERVE_CACHE] Getting most recent cached observe result");

      // Check in-memory cache first
      const memoryResult = await this.checkInMemoryObserveCache();
      if (memoryResult) {
        const duration = Date.now() - startTime;
        logger.info(`[OBSERVE_CACHE] Found recent result in memory cache (${duration}ms)`);
        return memoryResult;
      }

      // Check disk cache
      const diskResult = await this.checkDiskObserveCache();
      if (diskResult) {
        const duration = Date.now() - startTime;
        logger.info(`[OBSERVE_CACHE] Found recent result in disk cache (${duration}ms)`);
        return diskResult;
      }

      // No cached result available
      const duration = Date.now() - startTime;
      logger.info(`[OBSERVE_CACHE] No cached observe result available (${duration}ms)`);

      return {
        updatedAt: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "No cached observe result available"
      };
    } catch (error) {
      const duration = Date.now() - startTime;
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
    const cacheSize = ObserveScreen.observeResultCache.size;
    logger.info(`[OBSERVE_CACHE] Checking in-memory cache, size: ${cacheSize}`);

    if (cacheSize === 0) {
      logger.info("[OBSERVE_CACHE] In-memory cache is empty");
      return null;
    }

    const now = Date.now();
    const ttl = ObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS;

    // Remove expired entries and find most recent
    const expiredKeys: string[] = [];
    let mostRecentEntry: ObserveResultCache | null = null;

    for (const [key, cachedEntry] of ObserveScreen.observeResultCache.entries()) {
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
      ObserveScreen.observeResultCache.delete(key);
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
      const files = await readdirAsync(ObserveScreen.observeResultCacheDir);
      const jsonFiles = files.filter(file => file.endsWith(".json") && file.startsWith("observe_"));

      if (jsonFiles.length === 0) {
        logger.info("[OBSERVE_CACHE] No observe result files found in disk cache");
        return null;
      }

      const now = Date.now();
      const ttl = ObserveScreen.OBSERVE_RESULT_CACHE_TTL_MS;
      let mostRecentFile: { path: string, mtime: number } | null = null;

      // Find the most recent valid file
      for (const file of jsonFiles) {
        const filePath = path.join(ObserveScreen.observeResultCacheDir, file);
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
        ObserveScreen.observeResultCache.set(timestamp, {
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
    const timestamp = Date.now();
    const timestampKey = timestamp.toString();

    try {
      logger.info(`[OBSERVE_CACHE] Caching observe result with timestamp ${timestamp}`);

      // Cache in memory
      ObserveScreen.observeResultCache.set(timestampKey, {
        timestamp,
        observeResult
      });

      // Cache on disk
      await this.saveObserveResultToDisk(timestampKey, observeResult);

      logger.info(`[OBSERVE_CACHE] Successfully cached observe result, in-memory cache size: ${ObserveScreen.observeResultCache.size}`);
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
      const filePath = path.join(ObserveScreen.observeResultCacheDir, filename);

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

    // Need view hierarchy and elements
    if (!result.viewHierarchy?.hierarchy || !result.elements) {
      logger.debug("[AccessibilityAudit] Skipping audit, no view hierarchy or elements available");
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

        // Flatten all elements for audit
        const allElements: Element[] = [
          ...(result.elements?.clickable || []),
          ...(result.elements?.scrollable || []),
          ...(result.elements?.text || []),
        ];

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
   * Get the latest screenshot path from cache
   */
  private async getLatestScreenshotPath(): Promise<string | undefined> {
    try {
      const cacheDir = path.join("/tmp/auto-mobile", "screenshots");
      if (!fs.existsSync(cacheDir)) {
        return undefined;
      }

      const files = await readdirAsync(cacheDir);
      const pngFiles = files.filter(f => f.endsWith(".png"));

      if (pngFiles.length === 0) {
        return undefined;
      }

      // Sort by modification time (most recent first)
      const fileStats = await Promise.all(
        pngFiles.map(async f => {
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
    minTimestamp: number = 0
  ): Promise<ObserveResult> {
    try {
      logger.debug(`Executing observe command (skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp})`);
      const startTime = Date.now();

      // Create base result object with timestamp
      const result = this.createBaseResult();

      // Wrap entire observation in serial tracking
      perf.serial("observe");

      // Collect all data components with parallelization
      // Note: collectAllData tracks its phases internally, so we just call it directly
      await this.collectAllData(result, queryOptions, perf, skipWaitForFresh, minTimestamp);

      // Attach recomposition metrics if enabled
      await RecompositionTracker.getInstance().processObservation(result, this.device);

      // Run performance audit if enabled
      await this.runPerformanceAudit(result, perf);

      // Run accessibility audit if enabled
      await this.runAccessibilityAudit(result, perf);

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
      logger.debug(`Total observe command execution took ${Date.now() - startTime}ms`);
      return result;
    } catch (err) {
      logger.error("Critical error in observe command:", err);
      return {
        updatedAt: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Observation failed due to device access error"
      };
    }
  }
}
