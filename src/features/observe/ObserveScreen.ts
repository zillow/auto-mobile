import { logger } from "../../utils/logger";
import { BootedDevice, ExecResult, ObserveResult } from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { GetScreenSize } from "./GetScreenSize";
import { GetSystemInsets } from "./GetSystemInsets";
import { ViewHierarchy } from "./ViewHierarchy";
import { Window } from "./Window";
import { TakeScreenshot } from "./TakeScreenshot";
import { GetDumpsysWindow } from "./GetDumpsysWindow";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { DeepLinkManager } from "../../utils/deepLinkManager";
import fs from "fs-extra";
import path from "path";
import { readdirAsync, readFileAsync, statAsync, writeFileAsync } from "../../utils/io";
import { AccessibilityServiceManager } from "../../utils/accessibilityServiceManager";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { WebDriverAgent } from "../../utils/ios-cmdline-tools/webdriver";

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
  private adb: AdbUtils;
  private axe: Axe;
  private webdriver: WebDriverAgent;
  private deepLinkManager: DeepLinkManager;

  // Static cache for observe results
  private static observeResultCache: Map<string, ObserveResultCache> = new Map();
  private static observeResultCacheDir: string = path.join("/tmp/auto-mobile", "observe_results");
  private static readonly OBSERVE_RESULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null, webdriver: WebDriverAgent | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.axe = axe || new Axe(device);
    this.webdriver = webdriver || new WebDriverAgent(device);
    this.screenSize = new GetScreenSize(device, this.adb);
    this.systemInsets = new GetSystemInsets(device, this.adb);
    this.viewHierarchy = new ViewHierarchy(device, this.adb);
    this.window = new Window(device, this.adb);
    this.screenshotUtil = new TakeScreenshot(device, this.adb);
    this.dumpsysWindow = new GetDumpsysWindow(device, this.adb);
    this.deepLinkManager = new DeepLinkManager(device);

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
   * Collect view hierarchy and handle errors with accessibility service caching
   * @param result - ObserveResult to update
   * @param queryOptions - ViewHierarchyQueryOptions to pass to viewHierarchy.getViewHierarchy
   */
  public async collectViewHierarchy(result: ObserveResult, queryOptions?: ViewHierarchyQueryOptions): Promise<void> {
    try {
      const viewHierarchyStart = Date.now();
      const viewHierarchy = await this.viewHierarchy.getViewHierarchy(result.screenshotPath, queryOptions);
      logger.debug("Accessibility service availability cached as: true");

      if (viewHierarchy) {
        result.viewHierarchy = viewHierarchy;
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
      AccessibilityServiceManager.getInstance(this.device, this.adb).clearAvailabilityCache();

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
      const intentChooserDetected = this.deepLinkManager.detectIntentChooser(result.viewHierarchy);

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
   * Collect screenshot and handle errors
   * @param result - ObserveResult to update
   */
  public async collectScreenshot(result: ObserveResult): Promise<void> {
    try {
      const screenshotStart = Date.now();
      const screenshotResult = await this.screenshotUtil.execute();

      if (screenshotResult.success && screenshotResult.path) {
        result.screenshotPath = screenshotResult.path;
        logger.debug(`Screenshot capture took ${Date.now() - screenshotStart}ms`);
      } else {
        logger.warn("Failed to take screenshot:", screenshotResult.error);
        this.appendError(result, "Failed to take screenshot");
      }
    } catch (error) {
      logger.warn("Failed to take screenshot:", error);
      this.appendError(result, "Failed to take screenshot");
    }
  }

  /**
   * Collect all observation data with parallelization
   * @param result - ObserveResult to update
   * @param queryOptions - ViewHierarchyQueryOptions to pass to viewHierarchy.getViewHierarchy
   */
  public async collectAllData(result: ObserveResult, queryOptions?: ViewHierarchyQueryOptions): Promise<void> {
    switch (this.device.platform) {
      case "android":
        // Start dumpsys window fetch early since multiple operations need it
        const dumpsysWindowPromise = this.dumpsysWindow.execute();

        // Start these operations in parallel while dumpsys is running
        const parallelPromises: Promise<any>[] = [
          dumpsysWindowPromise,
          this.collectActiveWindow(result),
          this.collectScreenshot(result),
        ];

        const [dumpsysWindow] = await Promise.all(parallelPromises);

        // Now run the remaining operations in parallel using the shared dumpsys data
        const androidFinalPromises: Promise<void>[] = [
          this.collectScreenSize(dumpsysWindow, result),
          this.collectSystemInsets(dumpsysWindow, result),
          this.collectRotationInfo(dumpsysWindow, result),
          this.collectViewHierarchy(result, queryOptions),
        ];

        // Execute all remaining operations in parallel
        await Promise.all(androidFinalPromises);
        break;
      case "ios":
        // iOS-specific data collection logic here

        // Now run the remaining operations in parallel using the shared dumpsys data
        const iosFinalPromises: Promise<void>[] = [
          this.collectScreenSize({} as ExecResult, result),
          this.collectViewHierarchy(result, queryOptions),
        ];

        // Execute all remaining operations in parallel
        await Promise.all(iosFinalPromises);
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
   * @returns Base ObserveResult with timestamp and default values
   */
  createBaseResult(): ObserveResult {
    return {
      timestamp: new Date().toISOString(),
      screenSize: { width: 0, height: 0 },
      systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
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
        timestamp: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "No cached observe result available"
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[OBSERVE_CACHE] Error getting cached observe result after ${duration}ms: ${error}`);

      return {
        timestamp: new Date().toISOString(),
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
   * Execute the observe command
   * @param queryOptions - ViewHierarchyQueryOptions to pass to viewHierarchy.getViewHierarchy
   * @returns The observation result
   */
  async execute(queryOptions?: ViewHierarchyQueryOptions): Promise<ObserveResult> {
    try {
      logger.debug("Executing observe command");
      const startTime = Date.now();

      // Create base result object with timestamp
      const result = this.createBaseResult();

      // Collect all data components with parallelization
      await this.collectAllData(result, queryOptions);

      // Cache the result for future use
      await this.cacheObserveResult(result);

      logger.debug("Observe command completed");
      logger.debug(`Total observe command execution took ${Date.now() - startTime}ms`);
      return result;
    } catch (err) {
      logger.error("Critical error in observe command:", err);
      return {
        timestamp: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Observation failed due to device access error"
      };
    }
  }
}
