import fs from "fs-extra";
import path from "path";
import xml2js from "xml2js";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { CryptoUtils } from "../../utils/crypto";
import { BootedDevice, ViewHierarchyCache } from "../../models";
import { Element } from "../../models";
import { ViewHierarchyResult } from "../../models";
import { TakeScreenshot } from "./TakeScreenshot";
import { ElementUtils } from "../utility/ElementUtils";
import { readdirAsync, readFileAsync, statAsync, writeFileAsync } from "../../utils/io";
import { ScreenshotUtils } from "../../utils/screenshot-utils";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { SourceMapper } from "../../utils/sourceMapper";
import { ActivityInfo, FragmentInfo, ViewInfo, ComposableInfo, ViewHierarchyQueryOptions } from "../../models";
import { AccessibilityServiceClient } from "./AccessibilityServiceClient";
import { WebDriverAgent } from "../../utils/ios-cmdline-tools/webdriver";

/**
 * Interface for activity top data
 */
interface ActivityTopData {
  classOverrides: Map<string, string>;
  fragmentData: Map<string, string>;
  viewData: Map<string, string>;
}

/**
 * Interface for element bounds
 */
interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Interface for element with Z-order information
 */
interface ElementWithZOrder {
  element: any;
  bounds: ElementBounds;
  zOrder: number;
  isClickable: boolean;
}

/**
 * Extended ViewHierarchyResult with source indexing information
 */
interface ExtendedViewHierarchyResult extends ViewHierarchyResult {
  sourceInfo?: {
    activity?: ActivityInfo;
    fragments?: FragmentInfo[];
    views?: ViewInfo[];
    composables?: ComposableInfo[];
    appId?: string;
  };
}

export class ViewHierarchy {
  private device: BootedDevice;
  private readonly adb: AdbUtils;
  private readonly webdriver: WebDriverAgent;
  private takeScreenshot: TakeScreenshot;
  private elementUtils: ElementUtils;
  private sourceMapper: SourceMapper;
  private accessibilityServiceClient: AccessibilityServiceClient;
  private static viewHierarchyCache: Map<string, ViewHierarchyCache> = new Map();
  private static cacheDir: string = path.join("/tmp/auto-mobile", "view_hierarchy");
  private static screenshotCacheDir: string = path.join("/tmp/auto-mobile", "screenshots");
  private static readonly MAX_CACHE_SIZE_BYTES = 128 * 1024 * 1024; // 128MB
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Create a ViewHierarchy instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param webdriver - Optional IdbPython instance for testing
   * @param takeScreenshot - Optional TakeScreenshot instance for testing
   * @param accessibilityServiceClient - Optional AccessibilityServiceClient instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbUtils | null = null,
    webdriver: WebDriverAgent | null = null,
    takeScreenshot: TakeScreenshot | null = null,
    accessibilityServiceClient: AccessibilityServiceClient | null = null,
  ) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.webdriver = webdriver || new WebDriverAgent(device);
    this.takeScreenshot = takeScreenshot || new TakeScreenshot(device, this.adb);
    this.elementUtils = new ElementUtils();
    this.sourceMapper = SourceMapper.getInstance();
    this.accessibilityServiceClient = accessibilityServiceClient || new AccessibilityServiceClient(device, this.adb);

    // Ensure cache directories exist
    if (!fs.existsSync(ViewHierarchy.cacheDir)) {
      fs.mkdirSync(ViewHierarchy.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(ViewHierarchy.screenshotCacheDir)) {
      fs.mkdirSync(ViewHierarchy.screenshotCacheDir, { recursive: true });
    }
  }

  /**
   * Parse bounds string to ElementBounds object
   * @param boundsStr - Bounds string in format "[left,top][right,bottom]"
   * @returns ElementBounds object or null if invalid
   */
  private parseBounds(boundsStr: string): ElementBounds | null {
    if (!boundsStr) {return null;}

    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) {return null;}

    return {
      left: parseInt(match[1], 10),
      top: parseInt(match[2], 10),
      right: parseInt(match[3], 10),
      bottom: parseInt(match[4], 10)
    };
  }

  /**
   * Calculate the intersection area of two rectangles
   * @param rect1 - First rectangle
   * @param rect2 - Second rectangle
   * @returns Intersection area or 0 if no intersection
   */
  private calculateIntersectionArea(rect1: ElementBounds, rect2: ElementBounds): number {
    const left = Math.max(rect1.left, rect2.left);
    const top = Math.max(rect1.top, rect2.top);
    const right = Math.min(rect1.right, rect2.right);
    const bottom = Math.min(rect1.bottom, rect2.bottom);

    if (left >= right || top >= bottom) {
      return 0; // No intersection
    }

    return (right - left) * (bottom - top);
  }

  /**
   * Calculate the total area of a rectangle
   * @param bounds - Rectangle bounds
   * @returns Total area
   */
  private calculateArea(bounds: ElementBounds): number {
    return (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  }

  /**
   * Collect all elements with their Z-order information from the view hierarchy
   * @param node - Root node to start traversal
   * @param zOrder - Current Z-order (depth-first traversal order)
   * @param result - Array to collect elements
   */
  private collectElementsWithZOrder(node: any, zOrder: { value: number }, result: ElementWithZOrder[]): void {
    if (!node) {return;}

    const bounds = this.parseBounds(node.bounds);
    if (bounds) {
      const isClickable = node.clickable === "true" || node.clickable === true;

      result.push({
        element: node,
        bounds,
        zOrder: zOrder.value++,
        isClickable
      });
    }

    // Process children (later children have higher Z-order)
    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      for (const child of children) {
        this.collectElementsWithZOrder(child, zOrder, result);
      }
    }
  }

  /**
   * Calculate accessibility percentage for a clickable element
   * @param targetElement - The clickable element to analyze
   * @param allElements - All elements in the hierarchy with Z-order
   * @returns Accessibility percentage (0.0 to 1.0)
   */
  private calculateAccessibility(targetElement: ElementWithZOrder, allElements: ElementWithZOrder[]): number {
    const totalArea = this.calculateArea(targetElement.bounds);
    if (totalArea === 0) {return 0;}

    let coveredArea = 0;

    // Find all elements that are above this element in Z-order and intersect with it
    for (const otherElement of allElements) {
      // Skip if it's the same element or if the other element is below in Z-order
      if (otherElement === targetElement || otherElement.zOrder <= targetElement.zOrder) {
        continue;
      }

      // Calculate intersection area
      const intersectionArea = this.calculateIntersectionArea(targetElement.bounds, otherElement.bounds);
      coveredArea += intersectionArea;
    }

    // Calculate accessible percentage (ensure it doesn't exceed 100% due to floating point errors)
    const accessibleArea = Math.max(0, totalArea - coveredArea);
    const accessibilityPercentage = Math.min(1.0, accessibleArea / totalArea);

    // Round to 3 decimal places
    return Math.round(accessibilityPercentage * 1000) / 1000;
  }

  /**
   * Analyze Z-index accessibility for all clickable elements in the view hierarchy
   * @param viewHierarchy - The view hierarchy to analyze
   */
  private analyzeZIndexAccessibility(viewHierarchy: ViewHierarchyResult): void {
    if (!viewHierarchy || !viewHierarchy.hierarchy) {
      return;
    }

    const startTime = Date.now();

    // Collect all elements with their Z-order information
    const allElements: ElementWithZOrder[] = [];
    const zOrder = { value: 0 };
    this.collectElementsWithZOrder(viewHierarchy.hierarchy, zOrder, allElements);

    logger.debug(`[Z_INDEX_ANALYSIS] Collected ${allElements.length} elements for Z-index analysis`);

    // Filter clickable elements
    const clickableElements = allElements.filter(el => el.isClickable);
    logger.debug(`[Z_INDEX_ANALYSIS] Found ${clickableElements.length} clickable elements`);

    // Calculate accessibility for each clickable element
    for (const clickableElement of clickableElements) {
      clickableElement.element.accessible = this.calculateAccessibility(clickableElement, allElements);
    }

    const duration = Date.now() - startTime;
    logger.debug(`[Z_INDEX_ANALYSIS] Z-index accessibility analysis completed in ${duration}ms`);
  }

  /**
   * Calculate screenshot hash from buffer
   * @param screenshotBuffer - Buffer containing screenshot data
   * @returns MD5 hash of the screenshot
   */
  calculateScreenshotHash(screenshotBuffer: Buffer): string {
    return CryptoUtils.generateCacheKey(screenshotBuffer);
  }

  /**
   * Check in-memory cache for view hierarchy using fuzzy matching
   * @param targetBuffer - Screenshot buffer to compare against
   * @returns Cached view hierarchy or null if not found/expired
   */
  async checkInMemoryCache(targetBuffer: Buffer): Promise<ViewHierarchyResult | null> {
    const cacheSize = ViewHierarchy.viewHierarchyCache.size;
    logger.debug(`Checking in-memory cache with fuzzy matching, cache size: ${cacheSize}`);

    if (cacheSize === 0) {
      logger.debug("In-memory cache is empty");
      return null;
    }

    const cacheTtl = ViewHierarchy.CACHE_TTL_MS;
    const now = Date.now();

    // First, remove expired entries
    const expiredKeys: string[] = [];
    for (const [key, cachedEntry] of ViewHierarchy.viewHierarchyCache.entries()) {
      const age = now - cachedEntry.timestamp;
      if (age >= cacheTtl) {
        expiredKeys.push(key);
        logger.debug(`Removing expired cache entry: ${key} (age: ${age}ms > TTL: ${cacheTtl}ms)`);
      }
    }

    for (const key of expiredKeys) {
      ViewHierarchy.viewHierarchyCache.delete(key);
    }

    if (ViewHierarchy.viewHierarchyCache.size === 0) {
      logger.debug("All cache entries were expired and removed");
      return null;
    }

    // Try to find a cached screenshot that matches with fuzzy comparison
    logger.debug(`Performing fuzzy matching against ${ViewHierarchy.viewHierarchyCache.size} cached entries (tolerance: ${DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT}%)`);

    const screenshotFiles = await ScreenshotUtils.getScreenshotFiles(ViewHierarchy.screenshotCacheDir);
    if (screenshotFiles.length === 0) {
      logger.debug("No screenshot files found for fuzzy comparison");
      return null;
    }

    const similarResult = await ScreenshotUtils.findSimilarScreenshots(
      targetBuffer,
      ViewHierarchy.screenshotCacheDir,
      DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
      5 // Limit to 5 comparisons for in-memory cache check
    );

    if (similarResult.matchFound) {
      // Extract hash from the similar screenshot filename
      const hash = ScreenshotUtils.extractHashFromFilename(similarResult.filePath);
      if (hash) {
        const cachedEntry = ViewHierarchy.viewHierarchyCache.get(hash);
        if (cachedEntry) {
          const age = now - cachedEntry.timestamp;
          if (age < cacheTtl) {
            logger.debug(`Found fuzzy match in memory cache: ${hash} (${similarResult.similarity.toFixed(2)}% similarity, age: ${age}ms)`);
            return cachedEntry.viewHierarchy;
          } else {
            logger.debug(`Fuzzy match found but cache entry expired: ${hash} (age: ${age}ms > TTL: ${cacheTtl}ms)`);
            ViewHierarchy.viewHierarchyCache.delete(hash);
          }
        }
      }
    }

    logger.debug("No fuzzy match found in in-memory cache");
    return null;
  }

  /**
   * Check disk cache for view hierarchy using fuzzy matching
   * @param targetBuffer - Screenshot buffer to compare against
   * @returns Promise with cached view hierarchy or null if not found/expired
   */
  async checkDiskCache(targetBuffer: Buffer): Promise<ViewHierarchyResult | null> {
    logger.debug("Checking disk cache with fuzzy matching");

    const cacheTtl = ViewHierarchy.CACHE_TTL_MS;

    const similarResult = await ScreenshotUtils.findSimilarScreenshots(
      targetBuffer,
      ViewHierarchy.screenshotCacheDir,
      DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
      10 // Check up to 10 recent screenshots for disk cache
    );

    if (!similarResult.matchFound) {
      logger.debug("No fuzzy match found in disk cache");
      return null;
    }

    // Extract hash from the matched screenshot
    const hash = ScreenshotUtils.extractHashFromFilename(similarResult.filePath);
    if (!hash) {
      logger.warn(`Could not extract hash from matched file: ${similarResult.filePath}`);
      return null;
    }

    const diskCachePath = path.join(ViewHierarchy.cacheDir, `${hash}.json`);
    logger.debug(`Found fuzzy match in disk cache: ${path.basename(similarResult.filePath)} (${similarResult.similarity.toFixed(2)}% similarity)`);

    if (!fs.existsSync(diskCachePath)) {
      logger.warn(`Disk cache JSON file does not exist: ${diskCachePath}`);
      return null;
    }

    try {
      const fileStats = await statAsync(diskCachePath);
      const fileAge = Date.now() - fileStats.mtimeMs;

      logger.debug(`Disk cache file found with age ${fileAge}ms (TTL: ${cacheTtl}ms)`);

      if (fileAge < cacheTtl) {
        logger.debug(`Using fuzzy matched disk cached view hierarchy: ${hash}`);
        const cacheData = await readFileAsync(diskCachePath, "utf8");
        const cachedViewHierarchy = JSON.parse(cacheData);

        // Also update the in-memory cache with the fuzzy-matched result
        ViewHierarchy.viewHierarchyCache.set(hash, {
          timestamp: Date.now(),
          activityHash: hash,
          viewHierarchy: cachedViewHierarchy
        });

        logger.debug(`Updated in-memory cache from fuzzy matched disk cache: ${hash}`);
        return cachedViewHierarchy;
      } else {
        logger.debug(`Fuzzy matched disk cache file expired (age: ${fileAge}ms > TTL: ${cacheTtl}ms)`);
      }
    } catch (err) {
      logger.warn(`Failed to load fuzzy matched disk cached view hierarchy: ${err}`);
    }

    return null;
  }

  /**
   * Check cache hierarchy (both in-memory and disk) using fuzzy matching
   * @param screenshotBuffer - Screenshot buffer to compare against
   * @returns Promise with cached view hierarchy or null if not found
   */
  public async checkCacheHierarchyWithFuzzyMatching(screenshotBuffer: Buffer): Promise<ViewHierarchyResult | null> {
    logger.debug("Checking cache hierarchy using fuzzy matching");

    // Check in-memory cache first
    const cachedResult = await this.checkInMemoryCache(screenshotBuffer);
    if (cachedResult) {
      logger.debug("Found result in in-memory cache using fuzzy matching");
      return cachedResult;
    }

    // Check disk cache
    const diskCachedResult = await this.checkDiskCache(screenshotBuffer);
    if (diskCachedResult) {
      logger.debug("Found result in disk cache using fuzzy matching");
      return diskCachedResult;
    }

    logger.debug("No cached result found using fuzzy matching");
    return null;
  }

  /**
   * Check cache hierarchy (both in-memory and disk) - legacy hash-based method for backward compatibility
   * @param screenshotHash - Hash of the screenshot
   * @returns Promise with cached view hierarchy or null if not found
   */
  public async checkCacheHierarchy(screenshotHash: string): Promise<ViewHierarchyResult | null> {

    // Check in-memory cache first using exact hash match
    const cachedEntry = ViewHierarchy.viewHierarchyCache.get(screenshotHash);
    const cacheTtl = ViewHierarchy.CACHE_TTL_MS;
    const now = Date.now();

    if (cachedEntry) {
      const age = now - cachedEntry.timestamp;
      logger.debug(`Found cached entry with age ${age}ms (TTL: ${cacheTtl}ms)`);

      if (age < cacheTtl) {
        logger.debug(`Using cached view hierarchy for screenshot hash ${screenshotHash}`);
        return cachedEntry.viewHierarchy;
      } else {
        logger.debug(`Cached entry expired (age: ${age}ms > TTL: ${cacheTtl}ms), removing from cache`);
        ViewHierarchy.viewHierarchyCache.delete(screenshotHash);
      }
    }

    // Check disk cache using exact hash match
    const diskCachePath = path.join(ViewHierarchy.cacheDir, `${screenshotHash}.json`);
    if (!fs.existsSync(diskCachePath)) {
      return null;
    }

    try {
      const fileStats = await statAsync(diskCachePath);
      const fileAge = Date.now() - fileStats.mtimeMs;

      if (fileAge < cacheTtl) {
        logger.debug(`Using disk cached view hierarchy for screenshot hash ${screenshotHash}`);
        const cacheData = await readFileAsync(diskCachePath, "utf8");
        const cachedViewHierarchy = JSON.parse(cacheData);

        // Also update the in-memory cache
        ViewHierarchy.viewHierarchyCache.set(screenshotHash, {
          timestamp: Date.now(),
          activityHash: screenshotHash,
          viewHierarchy: cachedViewHierarchy
        });

        return cachedViewHierarchy;
      } else {
        logger.debug(`Disk cache file expired (age: ${fileAge}ms > TTL: ${cacheTtl}ms)`);
      }
    } catch (err) {
      logger.warn(`Failed to load disk cached view hierarchy: ${err}`);
    }

    logger.debug(`No cached result found for hash ${screenshotHash}`);
    return null;
  }

  /**
   * Cache view hierarchy result
   * @param timestamp - Timestamp for unique filename
   * @param viewHierarchy - View hierarchy to cache
   */
  public async cacheViewHierarchy(timestamp: number, viewHierarchy: ViewHierarchyResult): Promise<void> {
    // Cache the result using the timestamp
    logger.debug(`Caching view hierarchy with timestamp ${timestamp}, in-memory cache size will be: ${ViewHierarchy.viewHierarchyCache.size + 1}`);

    const timestampKey = timestamp.toString();
    ViewHierarchy.viewHierarchyCache.set(timestampKey, {
      timestamp: Date.now(),
      activityHash: timestampKey,
      viewHierarchy
    });

    // Save to disk cache
    await this.saveToDiskCache(timestampKey, viewHierarchy);
    this.maintainCacheSize();
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param queryOptions - Optional query options for targeted element retrieval
   * @returns Promise with parsed XML view hierarchy
   */
  async getViewHierarchy(queryOptions?: ViewHierarchyQueryOptions): Promise<ViewHierarchyResult> {
    switch (this.device.platform) {
      case "ios":
        return this.getiOSViewHierarchy();
      case "android":
        return this.getAndroidViewHierarchy(queryOptions);
      default:
        throw new Error("Unsupported platform");
    }
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @returns Promise with parsed XML view hierarchy
   */
  async getiOSViewHierarchy(): Promise<ViewHierarchyResult> {
    const startTime = Date.now();
    logger.info(`[VIEW_HIERARCHY] Starting getViewHierarchy for iOS`);
    const viewHierarchy = await this.webdriver.getViewHierarchy(this.device);
    const duration = Date.now() - startTime;
    logger.info(`[VIEW_HIERARCHY] Successfully retrieved hierarchy from accessibility service in ${duration}ms`);
    return await this.augmentWithSourceIndexing(viewHierarchy as ExtendedViewHierarchyResult);
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param queryOptions - Optional query options for targeted element retrieval
   * @returns Promise with parsed XML view hierarchy
   */
  async getAndroidViewHierarchy(queryOptions?: ViewHierarchyQueryOptions): Promise<ViewHierarchyResult> {
    const startTime = Date.now();
    logger.debug(`[VIEW_HIERARCHY] Starting Android getViewHierarchy`);

    // First try accessibility service if available and not skipped
    try {
      const accessibilityHierarchy = await this.accessibilityServiceClient.getAccessibilityHierarchy(queryOptions);
      if (accessibilityHierarchy) {
        const accessibilityDuration = Date.now() - startTime;
        logger.debug(`[VIEW_HIERARCHY] Successfully retrieved hierarchy from accessibility service in ${accessibilityDuration}ms`);
        return await this.augmentWithSourceIndexing(accessibilityHierarchy as ExtendedViewHierarchyResult);
      }
    } catch (err) {
      logger.warn(`[VIEW_HIERARCHY] Failed to get hierarchy from accessibility service: ${err}`);
    }

    try {
      // Get fresh view hierarchy
      const freshStartTime = Date.now();
      const viewHierarchy = await this._getViewHierarchyWithoutCache();
      const freshDuration = Date.now() - freshStartTime;
      logger.debug(`[VIEW_HIERARCHY] Fresh hierarchy fetched in ${freshDuration}ms`);

      // Augment with source indexing information
      const sourceStartTime = Date.now();
      const extendedViewHierarchy = await this.augmentWithSourceIndexing(viewHierarchy as ExtendedViewHierarchyResult);
      const sourceDuration = Date.now() - sourceStartTime;
      logger.debug(`[VIEW_HIERARCHY] Source indexing augmentation took ${sourceDuration}ms`);

      // Cache the result using a timestamp
      const cacheStartTime = Date.now();
      const timestamp = Date.now();
      logger.debug(`[VIEW_HIERARCHY] Caching view hierarchy with timestamp: ${timestamp}`);
      await this.cacheViewHierarchy(timestamp, extendedViewHierarchy);
      const cacheDuration = Date.now() - cacheStartTime;
      logger.debug(`[VIEW_HIERARCHY] Caching completed in ${cacheDuration}ms`);

      const totalDuration = Date.now() - startTime;
      logger.debug(`[VIEW_HIERARCHY] *** FRESH HIERARCHY: getViewHierarchy completed in ${totalDuration}ms (fresh hierarchy) ***`);
      return viewHierarchy;
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      logger.warn(`[VIEW_HIERARCHY] getViewHierarchy failed after ${totalDuration}ms:`, err);

      // If the error is one of the specific ADB errors, re-call _getViewHierarchyWithoutCache
      // to ensure its specific error message is returned.
      if (err instanceof Error &&
        (err.message.includes("null root node returned by UiTestAutomationBridge") ||
          err.message.includes("cat:") ||
          err.message.includes("No such file or directory"))) {
        logger.debug("[VIEW_HIERARCHY] Specific ADB error detected, calling _getViewHierarchyWithoutCache to get its specific error message.");
        return await this._getViewHierarchyWithoutCache();
      }

      // If screenshot-related error, fall back to getting view hierarchy without cache
      // (this might also lead to one of the specific errors above if _getViewHierarchyWithoutCache fails)
      if (err instanceof Error && err.message.includes("screenshot")) {
        logger.debug("[VIEW_HIERARCHY] Screenshot error detected, falling back to view hierarchy without cache");
        const fallbackResult = await this._getViewHierarchyWithoutCache();
        // If the fallback result has a specific error message, preserve it
        if (fallbackResult.hierarchy && (fallbackResult.hierarchy as any).error) {
          return fallbackResult;
        }
        return fallbackResult;
      }

      // For all other unhandled errors from getViewHierarchy itself, return the generic message.
      logger.debug("[VIEW_HIERARCHY] Unhandled error in getViewHierarchy, returning generic error message.");
      return {
        hierarchy: {
          error: "Failed to retrieve view hierarchy"
        }
      } as unknown as ViewHierarchyResult;
    }
  }

  /**
   * Find a fuzzy match with cache by scanning up to 100 recent screenshots
   * @param targetBuffer - Screenshot buffer to compare against
   * @param limit - Number of recent screenshots to scan
   * @returns Promise with cached view hierarchy or null if not found
   */
  private async findFuzzyMatchWithCache(targetBuffer: Buffer, limit: number): Promise<ViewHierarchyResult | null> {
    logger.debug(`Scanning up to ${limit} recent screenshots for fuzzy match with cached view hierarchy`);

    try {
      // Get list of recent screenshots (up to limit, sorted by modification time)
      const screenshotFiles = await ScreenshotUtils.getScreenshotFiles(ViewHierarchy.screenshotCacheDir);
      if (screenshotFiles.length === 0) {
        logger.debug("No recent screenshots found for fuzzy comparison");
        return null;
      }

      // Sort files by modification time (newest first) and limit
      const filesWithStats = await Promise.all(
        screenshotFiles.map(async filePath => {
          const stats = await statAsync(filePath);
          return { filePath, mtime: stats.mtime.getTime() };
        })
      );
      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      const recentFiles = filesWithStats.slice(0, limit);

      logger.debug(`Pre-filtering ${recentFiles.length} recent screenshots for cached data availability`);

      // Pre-filter: Find files that have cached view hierarchy data (parallel check)
      const filesWithCachePromises = recentFiles.map(async ({ filePath }) => {
        const hash = ScreenshotUtils.extractHashFromFilename(filePath);
        if (!hash) {return null;}

        const cachedResult = await this.checkCacheHierarchy(hash);
        return cachedResult ? { filePath, hash, cachedResult } : null;
      });

      const filesWithCache = (await Promise.all(filesWithCachePromises))
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (filesWithCache.length === 0) {
        logger.debug("No recent screenshots have valid cached view hierarchy data");
        return null;
      }

      logger.debug(`Found ${filesWithCache.length} screenshots with valid cached data, starting parallel fuzzy matching`);

      // Use optimized batch comparison for even better performance
      const filePaths = filesWithCache.map(item => item.filePath);
      const batchComparisonResults = await ScreenshotUtils.optimizedBatchCompareScreenshots(
        targetBuffer,
        filePaths,
        DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
        true // Use fast mode for bulk comparisons
      );

      // Match comparison results back to cached data
      for (const comparisonResult of batchComparisonResults) {
        const matchingFile = filesWithCache.find(item => item.filePath === comparisonResult.filePath);
        if (matchingFile && comparisonResult.matchFound) {
          logger.debug(`✓ Found fuzzy match with cached data: ${matchingFile.hash} (${comparisonResult.similarity.toFixed(2)}% similarity)`);
          return matchingFile.cachedResult;
        }
      }

      // Log all comparison results for debugging
      batchComparisonResults.forEach(result => {
        logger.debug(`${path.basename(result.filePath)}: ${result.similarity.toFixed(2)}% similarity (cached data available)`);
      });

      logger.debug("No fuzzy match found with cached view hierarchy data");
      return null;
    } catch (error) {
      logger.warn(`Error in findFuzzyMatchWithCache: ${(error as Error).message}`);
      return null;
    }
  }

  async getMostRecentCachedViewHierarchy(): Promise<ViewHierarchyResult> {
    if (ViewHierarchy.viewHierarchyCache.size === 0) {
      logger.debug("View hierarchy cache is empty.");
      // Consider if a more specific error or a different return type for "not found" is appropriate.
      // For now, returning a structure indicating an error, similar to other methods.
      return {
        hierarchy: {
          error: "No cached view hierarchy available"
        }
      } as unknown as ViewHierarchyResult;
    }

    let mostRecentEntry: ViewHierarchyCache | null = null;

    for (const entry of ViewHierarchy.viewHierarchyCache.values()) {
      if (!mostRecentEntry || entry.timestamp > mostRecentEntry.timestamp) {
        mostRecentEntry = entry;
      }
    }

    if (mostRecentEntry) {
      logger.debug(`Returning most recent cached view hierarchy from timestamp: ${new Date(mostRecentEntry.timestamp).toISOString()}`);
      return mostRecentEntry.viewHierarchy;
    }

    // This case should ideally not be reached if cache.size > 0, but as a fallback:
    return {
      hierarchy: {
        error: "Failed to retrieve most recent cached view hierarchy"
      }
    } as unknown as ViewHierarchyResult;
  }

  /**
   * Execute uiautomator dump command and get XML content (optimized version)
   * @returns Promise with XML data string
   */
  public async executeUiAutomatorDump(): Promise<string> {
    // Optimized: Use /data/local/tmp which is more reliable than /sdcard
    const tempFile = "/data/local/tmp/window_dump.xml";

    // Use shell subcommand to ensure atomicity and avoid separate rm command
    const { stdout } = await this.adb.executeCommand(`shell "(uiautomator dump ${tempFile} >/dev/null 2>&1 && cat ${tempFile}; rm -f ${tempFile}) 2>/dev/null"`);

    return this.extractXmlFromAdbOutput(stdout, tempFile);
  }

  /**
   * Process XML data into view hierarchy result
   * @param xmlData - XML string to process
   * @returns Promise with processed view hierarchy result
   */
  public async processXmlData(xmlData: string): Promise<ViewHierarchyResult> {
    // Check that we have valid XML data
    if (!this.validateXmlData(xmlData)) {
      logger.warn("Invalid XML data received from uiautomator");
      return {
        hierarchy: {
          error: "Failed to retrieve view hierarchy"
        }
      } as unknown as ViewHierarchyResult;
    }

    logger.debug("Starting analysis on view hierarchy");
    const analysisStart = Date.now();
    const result = await this.parseXmlToViewHierarchy(xmlData);

    // Add Z-index accessibility analysis
    this.analyzeZIndexAccessibility(result);

    logger.debug(`hierarchy analysis took ${Date.now() - analysisStart}ms`);

    return result;
  }

  /**
   * Check if node meets filter criteria (either string or boolean based)
   * @param props - Node properties
   * @returns True if node meets any filter criteria
   */
  public meetsFilterCriteria(props: any): boolean {
    return this.meetsStringFilterCriteria(props) || this.meetsBooleanFilterCriteria(props);
  }

  /**
   * Filter a single node and its children
   * @param node - Node to filter
   * @param isRootNode - Whether this is the root node
   * @returns Filtered node or null
   */
  public filterSingleNode(node: any, isRootNode: boolean = false): any | null {
    if (!node) {
      return null;
    }

    if (isRootNode) {
      const rootCopy = JSON.parse(JSON.stringify(node));

      if (node.node) {
        const processedChildren = this.processNodeChildren(node, child => this.filterSingleNode(child));

        if (processedChildren.length > 0) {
          rootCopy.node = this.normalizeNodeStructure(processedChildren);
        }
      }

      return rootCopy;
    }

    const props = node.$ || node;
    const meetsFilterCriteria = this.meetsFilterCriteria(props);
    const relevantChildren = this.processNodeChildren(node, child => this.filterSingleNode(child));

    if (meetsFilterCriteria) {
      const cleanedNode = this.cleanNodeProperties(node);

      if (relevantChildren.length > 0) {
        cleanedNode.node = this.normalizeNodeStructure(relevantChildren);
      }

      return cleanedNode;
    }

    if (relevantChildren.length > 0) {
      return relevantChildren;
    }

    return null;
  }

  /**
   * Filter the view hierarchy to only include elements that meet specific criteria:
   * - Have resourceId, text, or contentDesc
   * - OR have clickable, scrollable, or focused set to true
   * - Include descendants that meet criteria even if parents don't
   * - Omit boolean fields not set to true and class="android.view.View"
   * @param viewHierarchy - The view hierarchy to filter
   * @returns Filtered view hierarchy
   */
  filterViewHierarchy(viewHierarchy: any): any {
    if (!viewHierarchy || !viewHierarchy.hierarchy) {
      logger.debug("No hierarchy found");
      return viewHierarchy;
    }

    const result = JSON.parse(JSON.stringify(viewHierarchy));
    result.hierarchy = this.filterSingleNode(viewHierarchy.hierarchy, true);
    return result;
  }

  /**
   * Extract XML content from ADB output
   * @param stdout - Raw stdout from ADB command
   * @param tempFile - Temp file path used in command
   * @returns Cleaned XML data
   */
  extractXmlFromAdbOutput(stdout: string, tempFile: string): string {
    let xmlData = stdout;
    const uiHierarchyMessage = "UI hierchary dumped to:";
    if (xmlData.includes(uiHierarchyMessage)) {
      const prefixEnd = xmlData.indexOf(uiHierarchyMessage) + uiHierarchyMessage.length + tempFile.length + 1;
      xmlData = xmlData.substring(prefixEnd);
    }
    return xmlData;
  }

  /**
   * Validate XML data
   * @param xmlData - XML string to validate
   * @returns True if valid XML data
   */
  validateXmlData(xmlData: string): boolean {
    return !!(xmlData && xmlData.trim() && xmlData.includes("<hierarchy"));
  }

  /**
   * Parse XML to view hierarchy
   * @param xmlData - XML string to parse
   * @returns Promise with parsed and filtered view hierarchy
   */
  async parseXmlToViewHierarchy(xmlData: string): Promise<ViewHierarchyResult> {
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);
    return this.filterViewHierarchy(result);
  }

  /**
   * Calculate and log filtering statistics
   * @param original - Original view hierarchy
   * @param filtered - Filtered view hierarchy
   */
  calculateFilteringStats(original: any, filtered: any): void {
    const originalResultSize = Buffer.byteLength(JSON.stringify(original), "utf8");
    const filteredResultSize = Buffer.byteLength(JSON.stringify(filtered), "utf8");
    logger.debug(`filtering ${originalResultSize} bytes down to ${filteredResultSize} bytes`);
  }

  /**
   * Check if node meets string-based filter criteria
   * @param props - Node properties
   * @returns True if node has meaningful string properties
   */
  meetsStringFilterCriteria(props: any): boolean {
    return Boolean(
      (props.resourceId && props.resourceId !== "") ||
      (props["resource-id"] && props["resource-id"] !== "") ||
      (props.text && props.text !== "") ||
      (props.contentDesc && props.contentDesc !== "") ||
      (props["content-desc"] && props["content-desc"] !== "")
    );
  }

  /**
   * Check if node meets boolean-based filter criteria
   * @param props - Node properties
   * @returns True if node has meaningful boolean properties
   */
  meetsBooleanFilterCriteria(props: any): boolean {
    return Boolean(
      (props.clickable === "true") ||
      (props.scrollable === "true") ||
      (props.focused === "true")
    );
  }

  /**
   * Process node children with filter function
   * @param node - Parent node
   * @param filterFn - Filter function to apply to children
   * @returns Array of filtered children
   */
  processNodeChildren(node: any, filterFn: (child: any) => any): any[] {
    const relevantChildren: any[] = [];

    if (node.node) {
      const children = (Array.isArray(node.node) ? node.node : [node.node]).slice(0, 64);
      for (const child of children) {
        const filteredChild = filterFn(child);
        if (filteredChild) {
          if (Array.isArray(filteredChild)) {
            relevantChildren.push(...filteredChild);
          } else {
            relevantChildren.push(filteredChild);
          }
        }
      }
    }

    return relevantChildren;
  }

  /**
   * Normalize node structure for filtered children
   * @param filteredChildren - Array of filtered children
   * @returns Normalized node structure (single item or array)
   */
  normalizeNodeStructure(filteredChildren: any[]): any {
    return filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren;
  }

  /**
   * Retrieve the view hierarchy of the current screen without using cache
   * @returns Promise with parsed XML view hierarchy
   */
  async _getViewHierarchyWithoutCache(): Promise<ViewHierarchyResult> {
    const dumpStart = Date.now();

    try {
      // Run uiautomator dump and dumpsys activity top in parallel
      const [xmlData, dumpsysResult] = await Promise.all([
        this.executeUiAutomatorDump(), // Returns string
        this.adb.executeCommand("shell dumpsys activity top") // Returns ExecResult
      ]);
      const dumpsysOutput = dumpsysResult.stdout || "";

      logger.debug(`uiautomator dump && dumpsys activity top took ${Date.now() - dumpStart}ms`);

      // Process XML data into view hierarchy result
      const hierarchyResult = await this.processXmlData(xmlData);

      // Augment the view hierarchy with class and fragment info from dumpsys output
      const activityTopData = this.parseDumpsysActivityTop(dumpsysOutput);
      logger.debug(`Found ${activityTopData.classOverrides.size} class overrides, ${activityTopData.fragmentData.size} fragments, and ${activityTopData.viewData.size} custom views from dumpsys activity top`);

      this.augmentViewHierarchyWithClassAndFragment(hierarchyResult, activityTopData);

      return hierarchyResult;
    } catch (err) {
      logger.warn("Failed to get view hierarchy:", err);

      // Check for specific error that indicates screen is off or device is locked
      const errStr = String(err);
      if (errStr.includes("null root node returned by UiTestAutomationBridge")) {
        return {
          hierarchy: {
            error: "Failed to retrieve view hierarchy - screen appears to be off or device is locked"
          }
        } as unknown as ViewHierarchyResult;
      }
      if (errStr.includes("cat:") && errStr.includes("No such file or directory")) {
        return {
          hierarchy: {
            error: "Failed to retrieve view hierarchy - screen appears to be off or device is locked"
          }
        } as unknown as ViewHierarchyResult;
      }

      // For all other errors, return generic error message
      return {
        hierarchy: {
          error: "Failed to retrieve view hierarchy data"
        }
      } as unknown as ViewHierarchyResult;
    }
  }

  /**
   * Maintain the view hierarchy cache size
   * If cache exceeds MAX_CACHE_SIZE_BYTES, removes oldest entries
   */
  async maintainCacheSize(): Promise<void> {
    try {
      // Get all files in the cache directory
      const files = await readdirAsync(ViewHierarchy.cacheDir);
      let totalSize = 0;
      const fileStats: { path: string, size: number, mtime: Date }[] = [];

      // Collect file stats
      for (const file of files) {
        if (file.endsWith(".json")) {
          const filePath = path.join(ViewHierarchy.cacheDir, file);
          const stats = await statAsync(filePath);
          totalSize += stats.size;
          fileStats.push({ path: filePath, size: stats.size, mtime: stats.mtime });
        }
      }

      // If cache is too large, remove oldest files
      if (totalSize > ViewHierarchy.MAX_CACHE_SIZE_BYTES) {
        // Sort by modification time (oldest first)
        fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

        // Remove oldest files until we're under the limit
        let sizeToFree = totalSize - ViewHierarchy.MAX_CACHE_SIZE_BYTES;
        for (const file of fileStats) {
          await fs.remove(file.path);
          sizeToFree -= file.size;
          if (sizeToFree <= 0) {break;}
        }

        logger.debug(`Cleared ${fileStats.length} old cache files to maintain cache size limit`);
      }
    } catch (err) {
      logger.warn(`Error maintaining cache size: ${err}`);
    }
  }

  /**
   * Save view hierarchy to disk cache
   * @param timestamp - Timestamp for filename
   * @param viewHierarchy - View hierarchy to save
   */
  public async saveToDiskCache(timestamp: string, viewHierarchy: ViewHierarchyResult): Promise<void> {
    try {
      await writeFileAsync(
        path.join(ViewHierarchy.cacheDir, `hierarchy_${timestamp}.json`),
        JSON.stringify(viewHierarchy)
      );
      logger.debug(`Saved view hierarchy to disk cache with timestamp ${timestamp}`);
    } catch (err) {
      logger.warn(`Failed to save view hierarchy to disk cache: ${err}`);
    }
  }

  /**
   * Get or create screenshot buffer
   * @param screenshotPath - Optional existing screenshot path
   * @returns Promise with buffer and path
   */
  public async getOrCreateScreenshotBuffer(screenshotPath: string | null): Promise<{ buffer: Buffer; path: string }> {
    const startTime = Date.now();

    if (screenshotPath) {
      logger.debug(`[VIEW_HIERARCHY] Using provided screenshot for view hierarchy caching: ${screenshotPath}`);
      const readStartTime = Date.now();
      const buffer = await readFileAsync(screenshotPath);
      const readDuration = Date.now() - readStartTime;
      const totalDuration = Date.now() - startTime;
      logger.debug(`[VIEW_HIERARCHY] Read existing screenshot in ${readDuration}ms, total getOrCreateScreenshotBuffer: ${totalDuration}ms`);
      return { buffer, path: screenshotPath };
    } else {
      logger.debug("[VIEW_HIERARCHY] Taking new screenshot for view hierarchy caching");
      const screenshotStartTime = Date.now();
      const screenshotResult = await this.takeScreenshot.execute();
      const screenshotDuration = Date.now() - screenshotStartTime;

      if (!screenshotResult.success || !screenshotResult.path) {
        throw new Error(screenshotResult.error || "Failed to take screenshot for view hierarchy caching");
      }

      const readStartTime = Date.now();
      const buffer = await readFileAsync(screenshotResult.path);
      const readDuration = Date.now() - readStartTime;
      const totalDuration = Date.now() - startTime;

      logger.debug(`[VIEW_HIERARCHY] Screenshot capture: ${screenshotDuration}ms, file read: ${readDuration}ms, total getOrCreateScreenshotBuffer: ${totalDuration}ms`);
      return { buffer, path: screenshotResult.path };
    }
  }

  /**
   * Find the focused element in the view hierarchy
   * @param viewHierarchy - The view hierarchy to search
   * @returns The focused element or null if none found
   */
  findFocusedElement(viewHierarchy: any): Element | null {
    if (!viewHierarchy || !viewHierarchy.hierarchy) {
      return null;
    }

    let focusedElement: Element | null = null;

    const traverseNode = (node: any): void => {
      if (focusedElement) {
        return; // Already found focused element, stop traversing
      }

      // Check if current node is focused
      const props = node.$ || node;
      if (props.focused === "true" || props.focused === true) {
        // Parse the node into an Element
        const element = this.parseNodeBounds(node);
        if (element) {
          // Ensure focused property is a boolean
          element.focused = true;
          focusedElement = element;
          return;
        }
      }

      // Continue traversing children
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          traverseNode(child);
          if (focusedElement) {
            break; // Stop if we found the focused element
          }
        }
      }
    };

    traverseNode(viewHierarchy.hierarchy);
    return focusedElement;
  }

  /**
   * Calculate the center coordinates of an element
   * @param element - The element to calculate center for
   * @returns The center coordinates
   */
  getElementCenter(element: Element): { x: number, y: number } {
    return this.elementUtils.getElementCenter(element);
  }

  /**
   * Parse a node's bounds if they're in string format
   * @param node - The node to parse
   * @returns The node with parsed bounds or null
   */
  parseNodeBounds(node: any): Element | null {
    return this.elementUtils.parseNodeBounds(node);
  }

  /**
   * Traverse the view hierarchy and process each node with a provided function
   * @param node - The node to start traversal from
   * @param processNode - Function to process each node
   */
  traverseViewHierarchy(node: any, processNode: (node: any) => void): void {
    this.elementUtils.traverseNode(node, processNode);
  }

  cleanNodeProperties(node: any): any {
    const result: any = {};
    const allowedProperties = ["text", "resourceId", "resource-id", "contentDesc", "content-desc", "clickable", "scrollable", "enabled", "bounds", "accessible"];

    if (node["$"]) {
      const cleanedProps: any = {};
      for (const key in node.$) {
        if (allowedProperties.includes(key)) {
          const normalizedKey = key === "resourceId" ? "resource-id" : key === "contentDesc" ? "content-desc" : key;
          if (node.$[key] === "") {continue;}
          if (key === "enabled" && (node.$[key] === true || node.$[key] === "true")) {continue;}
          if (key !== "enabled" && (node.$[key] === false || node.$[key] === "false")) {continue;}
          cleanedProps[normalizedKey] = node.$[key];
        }
      }

      if (Object.keys(cleanedProps).length > 0) {
        for (const key in cleanedProps) {
          result[key] = cleanedProps[key];
        }
      }

      for (const key in node) {
        if (key !== "$" && key !== "node") {
          result[key] = node[key];
        }
      }
    } else {
      for (const key in node) {
        if (key === "node") {continue;}
        if (!allowedProperties.includes(key)) {continue;}
        if (node[key] === "") {continue;}
        if (key === "enabled" && (node[key] === true || node[key] === "true")) {continue;}
        if (key !== "enabled" && (node[key] === false || node[key] === "false")) {continue;}
        result[key] = node[key];
      }
    }

    return result;
  }

  /**
   * Save screenshot for fuzzy matching
   * @param screenshotBuffer - Buffer of the screenshot
   * @param timestamp - Timestamp to use for the filename
   */
  private async saveScreenshotForFuzzyMatching(screenshotBuffer: Buffer, timestamp: string): Promise<void> {
    try {
      const screenshotPath = path.join(ViewHierarchy.screenshotCacheDir, `screenshot_${timestamp}.png`);
      await fs.writeFile(screenshotPath, screenshotBuffer);
      logger.debug(`Saved screenshot for fuzzy matching with timestamp ${timestamp}`);
    } catch (err) {
      logger.warn(`Failed to save screenshot for fuzzy matching: ${err}`);
    }
  }

  /**
   * Parse dumpsys activity top output to extract class and fragment information
   * @param dumpsysOutput - Raw output from dumpsys activity top
   * @returns ActivityTopData containing class and fragment mappings
   */
  private parseDumpsysActivityTop(dumpsysOutput: string): ActivityTopData {
    const classOverrides = new Map<string, string>();
    const fragmentData = new Map<string, string>();
    const viewData = new Map<string, string>();

    const lines = dumpsysOutput.split("\n");
    let inViewHierarchy = false;
    let inActiveFragments = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if we're entering the View Hierarchy section
      if (line.includes("View Hierarchy:")) {
        inViewHierarchy = true;
        continue;
      }

      // Check if we're leaving the View Hierarchy section
      if (inViewHierarchy && line.includes("Looper (main")) {
        inViewHierarchy = false;
        continue;
      }

      // Check if we're entering the Active Fragments section
      if (line.includes("Active Fragments:")) {
        inActiveFragments = true;
        continue;
      }

      // Reset when we hit other major sections after Active Fragments
      if (inActiveFragments && line.match(/^[A-Z][a-zA-Z\s]+:/)) {
        inActiveFragments = false;
      }

      // Parse View Hierarchy for class names that don't match standard Android patterns
      if (inViewHierarchy) {
        // Look for lines with class definitions like:
        // com.zillow.android.ui.base.ZillowToolbar{9958b11 VFE...... ........ 0,0-1080,173 #7f0a078a app:id/search_toolbar aid=1073742017}
        const classMatch = line.match(/^\s*([a-zA-Z][a-zA-Z0-9._$]*)\{[^}]+\}/);
        if (classMatch) {
          const className = classMatch[1];
          // Check if class doesn't match android.*, com.android.*, or androidx.* patterns
          if (!className.match(/^(android\.|com\.android\.|androidx\.)/)) {
            // Extract resource-id from the same line if present
            const resourceIdMatch = line.match(/#([a-zA-Z0-9_:]+)\s+app:id\/([a-zA-Z0-9_]+)/);
            const boundsMatch = line.match(/(\d+,\d+-\d+,\d+)/);

            if (resourceIdMatch) {
              const resourceId = `${resourceIdMatch[1]}`;
              classOverrides.set(resourceId, className);

              // Detect if this is a custom View class (not Fragment or Activity)
              if (!className.includes("Fragment") && !className.includes("Activity")) {
                viewData.set(resourceId, className);
              }
            } else if (boundsMatch) {
              const bounds = boundsMatch[1];
              classOverrides.set(bounds, className);

              // Detect if this is a custom View class (not Fragment or Activity)
              if (!className.includes("Fragment") && !className.includes("Activity")) {
                viewData.set(bounds, className);
              }
            }
          }
        }
      }

      // Parse Active Fragments for fragment information
      if (inActiveFragments) {
        // Look for fragment definitions like:
        // SearchTabContainerFragment{fc93440} (92eba8cc-8e59-4c67-9dcf-2f98fc626dd1 id=0x7f0a012b tag=8ba7a0d8-1d7d-4159-ab80-e3adbf1888ca)
        const fragmentMatch = line.match(/(\w*Fragment)\{[^}]+\}\s+\([^)]*id=(0x[0-9a-fA-F]+)/);
        if (fragmentMatch) {
          const fragmentName = fragmentMatch[1];
          const fragmentId = fragmentMatch[2];
          fragmentData.set(fragmentId, fragmentName);
        }

        // Alternative format for fragments like:
        // #0: SearchTabContainerFragment{fc93440} (92eba8cc-8e59-4c67-9dcf-2f98fc626dd1 id=0x7f0a012b tag=...)
        const altFragmentMatch = line.match(/#\d+:\s+(\w*Fragment)\{[^}]+\}\s+\([^)]*id=(0x[0-9a-fA-F]+)/);
        if (altFragmentMatch) {
          const fragmentName = altFragmentMatch[1];
          const fragmentId = altFragmentMatch[2];
          fragmentData.set(fragmentId, fragmentName);
        }
      }
    }

    return { classOverrides, fragmentData, viewData };
  }

  /**
   * Augment view hierarchy with source indexing information
   * @param viewHierarchy - The view hierarchy to augment
   * @returns Augmented view hierarchy with source information
   */
  private async augmentWithSourceIndexing(viewHierarchy: ExtendedViewHierarchyResult): Promise<ExtendedViewHierarchyResult> {
    try {
      // Skip if already has source info or if hierarchy has error
      if (viewHierarchy.sourceInfo || (viewHierarchy.hierarchy as any)?.error) {
        return viewHierarchy;
      }

      logger.debug("[SOURCE_INDEXING] Attempting to augment view hierarchy with source information");

      // Extract activity information from the current activity
      const currentActivity = await this.getCurrentActivityInfo();
      if (!currentActivity) {
        logger.debug("[SOURCE_INDEXING] No current activity found");
        return viewHierarchy;
      }

      logger.debug(`[SOURCE_INDEXING] Current activity: ${currentActivity.activityName}, package: ${currentActivity.packageName}`);

      const matchingConfig = this.sourceMapper.getMatchingAppConfig(currentActivity.packageName);

      if (!matchingConfig) {
        logger.debug(`[SOURCE_INDEXING] No app configuration found for package: ${currentActivity.packageName}`);
        return viewHierarchy;
      }

      logger.debug(`[SOURCE_INDEXING] Found matching app config: ${matchingConfig.appId}`);

      // Find activity source information
      let activity: ActivityInfo | null = null;
      try {
        activity = await this.sourceMapper.findActivityInfo(
          matchingConfig.appId,
          currentActivity.activityName
        );

        if (activity) {
          logger.debug(`[SOURCE_INDEXING] Found activity source: ${activity.sourceFile}`);
        }
      } catch (error) {
        logger.warn(`[SOURCE_INDEXING] Error finding activity source: ${error}`);
      }

      // Find fragment source information
      const fragments: FragmentInfo[] = [];
      const fragmentNames = this.extractFragmentNames(viewHierarchy);

      for (const fragmentName of fragmentNames) {
        try {
          const fragmentInfo = await this.sourceMapper.findFragmentInfo(
            matchingConfig.appId,
            fragmentName,
            activity
          );

          if (fragmentInfo) {
            fragments.push(fragmentInfo);
            logger.debug(`[SOURCE_INDEXING] Found fragment source: ${fragmentInfo.sourceFile}`);
          }
        } catch (error) {
          logger.warn(`[SOURCE_INDEXING] Error finding fragment source for ${fragmentName}: ${error}`);
        }
      }

      // Find custom View source information
      const views: ViewInfo[] = [];
      const viewNames = this.extractViewNames(viewHierarchy);

      for (const viewName of viewNames) {
        try {
          const viewInfo = await this.sourceMapper.findViewInfo(
            matchingConfig.appId,
            viewName,
            activity || undefined,
            fragments.length > 0 ? fragments[0] : undefined
          );

          if (viewInfo) {
            views.push(viewInfo);
            logger.debug(`[SOURCE_INDEXING] Found view source: ${viewInfo.sourceFile}`);
          }
        } catch (error) {
          logger.warn(`[SOURCE_INDEXING] Error finding view source for ${viewName}: ${error}`);
        }
      }

      // Find composable source information
      const composables: ComposableInfo[] = [];
      const composableNames = this.extractComposableNames(viewHierarchy);
      for (const composableName of composableNames) {
        try {
          const composableInfo = await this.sourceMapper.findComposableInfo(
            matchingConfig.appId,
            composableName,
            activity || undefined,
            fragments.length > 0 ? fragments[0] : undefined
          );

          if (composableInfo) {
            composables.push(composableInfo);
            logger.debug(`[SOURCE_INDEXING] Found composable source: ${composableInfo.sourceFile}`);
          }
        } catch (error) {
          logger.warn(`[SOURCE_INDEXING] Error finding composable source for ${composableName}: ${error}`);
        }
      }

      // Add source information to the result
      viewHierarchy.sourceInfo = {
        activity: activity || undefined,
        fragments: fragments.length > 0 ? fragments : undefined,
        views: views.length > 0 ? views : undefined,
        composables: composables.length > 0 ? composables : undefined,
        appId: matchingConfig.appId
      };

      logger.debug(`[SOURCE_INDEXING] Augmented view hierarchy with ${activity ? 1 : 0} activity, ${fragments.length} fragment, ${views.length} view, and ${composables.length} composable source references`);

    } catch (error) {
      logger.warn(`[SOURCE_INDEXING] Error during source indexing augmentation: ${error}`);
    }

    return viewHierarchy;
  }

  /**
   * Get current activity information from the device
   * @returns Current activity info or null
   */
  private async getCurrentActivityInfo(): Promise<{ activityName: string; packageName: string } | null> {
    try {
      const result = await this.adb.executeCommand("shell dumpsys activity activities | grep -E 'mResumedActivity|mFocusedActivity' | head -1");
      const output = result.stdout;

      // Parse the current activity from dumpsys output
      // Example: mResumedActivity: ActivityRecord{abc123 u0 com.example.myapp/.MainActivity t12345}
      const activityMatch = output.match(/ActivityRecord\{[^}]+\s+([^\s]+)\/([^\s]+)\s+/);

      if (activityMatch) {
        const packageName = activityMatch[1];
        const activityPath = activityMatch[2];

        // Extract class name from activity path (e.g., ".MainActivity" -> "MainActivity")
        const activityName = activityPath.startsWith(".") ?
          `${packageName}${activityPath}` :
          activityPath;

        return { activityName, packageName };
      }

      logger.warn("[SOURCE_INDEXING] Could not parse current activity from dumpsys output");
      return null;
    } catch (error) {
      logger.warn(`[SOURCE_INDEXING] Error getting current activity: ${error}`);
      return null;
    }
  }

  /**
   * Extract fragment names from view hierarchy augmentation data
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of fragment class names
   */
  private extractFragmentNames(viewHierarchy: ViewHierarchyResult): string[] {
    const fragmentNames: string[] = [];

    // Traverse the hierarchy looking for fragment information added by augmentViewHierarchyWithClassAndFragment
    const traverseNode = (node: any): void => {
      if (node.fragment) {
        fragmentNames.push(node.fragment);
      }

      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          traverseNode(child);
        }
      }
    };

    if (viewHierarchy.hierarchy) {
      traverseNode(viewHierarchy.hierarchy);
    }

    // Remove duplicates
    return Array.from(new Set(fragmentNames));
  }

  /**
   * Extract custom View class names from view hierarchy augmentation data
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of custom View class names
   */
  private extractViewNames(viewHierarchy: ViewHierarchyResult): string[] {
    const viewNames: string[] = [];

    // Traverse the hierarchy looking for custom view class information added by augmentViewHierarchyWithClassAndFragment
    const traverseNode = (node: any): void => {
      // Check for custom view class from augmentation
      if (node.customView) {
        viewNames.push(node.customView);
      }

      // Check for class property that doesn't match Android framework patterns
      if (node.class && !node.class.match(/^(android\.|com\.android\.|androidx\.)/)) {
        // Exclude fragments and activities as they are handled separately
        if (!node.class.includes("Fragment") && !node.class.includes("Activity")) {
          viewNames.push(node.class);
        }
      }

      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          traverseNode(child);
        }
      }
    };

    if (viewHierarchy.hierarchy) {
      traverseNode(viewHierarchy.hierarchy);
    }

    // Remove duplicates
    return Array.from(new Set(viewNames));
  }

  /**
   * Augment view hierarchy with class and fragment and custom view information from dumpsys activity top
   * @param viewHierarchy - The view hierarchy to augment
   * @param activityTopData - Class, fragment and view data from dumpsys activity top
   */
  private augmentViewHierarchyWithClassAndFragment(viewHierarchy: ExtendedViewHierarchyResult, activityTopData: ActivityTopData): void {
    if (!viewHierarchy || !viewHierarchy.hierarchy) {
      return;
    }

    // Function to recursively augment nodes with class, fragment, view, and composable information
    const augmentNode = (node: any): void => {
      if (!node) {
        return;
      }

      // Check for class override based on resource-id
      const resourceId = node["resource-id"];
      if (resourceId && activityTopData.classOverrides.has(resourceId)) {
        const customClass = activityTopData.classOverrides.get(resourceId);
        if (customClass) {
          node["class"] = customClass;
        }
      }

      // Check for class override based on bounds
      const bounds = node["bounds"];
      if (bounds && activityTopData.classOverrides.has(bounds)) {
        const customClass = activityTopData.classOverrides.get(bounds);
        if (customClass) {
          node["class"] = customClass;
        }
      }

      // Add fragment information if the resource-id matches a fragment container
      if (resourceId && activityTopData.fragmentData.has(resourceId)) {
        const fragmentClass = activityTopData.fragmentData.get(resourceId);
        if (fragmentClass) {
          node["fragment"] = fragmentClass;
        }
      }

      // Add custom view information if the resource-id or bounds matches a custom view
      if (resourceId && activityTopData.viewData.has(resourceId)) {
        const viewClass = activityTopData.viewData.get(resourceId);
        if (viewClass) {
          node["customView"] = viewClass;
        }
      } else if (bounds && activityTopData.viewData.has(bounds)) {
        const viewClass = activityTopData.viewData.get(bounds);
        if (viewClass) {
          node["customView"] = viewClass;
        }
      }

      // Mark composable if node has "composable" property
      if (node.composable && typeof node.composable === "string" && node.composable.length > 0) {
        node["isComposable"] = true;
        // Optionally, establish a standard property for composable name
        node["composableName"] = node.composable;
      }

      // Recursively augment child nodes
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          augmentNode(child);
        }
      }
    };

    // Start augmentation from the root node
    augmentNode(viewHierarchy.hierarchy);
  }

  /**
   * Extract composable names from view hierarchy augmentation data
   * @param viewHierarchy - The view hierarchy to search
   * @returns Array of composable names
   */
  private extractComposableNames(viewHierarchy: ViewHierarchyResult): string[] {
    const composableNames: string[] = [];

    // Traverse the hierarchy looking for composable information
    const traverseNode = (node: any): void => {
      // Best-effort heuristic: look for nodes marked as composable or having a composable name
      if (node.composable && typeof node.composable === "string" && node.composable.length > 0) {
        composableNames.push(node.composable);
      } else if (node.composableName && typeof node.composableName === "string" && node.composableName.length > 0) {
        composableNames.push(node.composableName);
      }

      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          traverseNode(child);
        }
      }
    };

    if (viewHierarchy.hierarchy) {
      traverseNode(viewHierarchy.hierarchy);
    }

    // Remove duplicates
    return Array.from(new Set(composableNames));
  }
}
