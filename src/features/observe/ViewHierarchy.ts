import fs from "fs-extra";
import path from "path";
import xml2js from "xml2js";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { NodeCryptoService } from "../../utils/crypto";
import { BootedDevice, ViewHierarchyCache } from "../../models";
import { Element } from "../../models";
import { ViewHierarchyResult } from "../../models";
import { TakeScreenshot } from "./TakeScreenshot";
import { ElementUtils } from "../utility/ElementUtils";
import { readdirAsync, readFileAsync, statAsync, writeFileAsync } from "../../utils/io";
import { ScreenshotUtils } from "../../utils/screenshot/ScreenshotUtils";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "../../utils/constants";
import { ViewHierarchyQueryOptions, HierarchySource } from "../../models";
import { AccessibilityServiceClient } from "./AccessibilityServiceClient";
import { XCTestServiceClient } from "./XCTestServiceClient";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { serverConfig } from "../../utils/ServerConfig";
import { attachRawViewHierarchy } from "../../utils/viewHierarchySearch";
import { getTempDir, TEMP_SUBDIRS } from "../../utils/tempDir";

/**
 * Interface for element bounds
 */
interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class ViewHierarchy {
  private device: BootedDevice;
  private readonly adb: AdbExecutor;
  private adbFactory: AdbClientFactory;
  private takeScreenshot: TakeScreenshot;
  private elementUtils: ElementUtils;
  private accessibilityServiceClient: AccessibilityServiceClient;
  private static viewHierarchyCache: Map<string, ViewHierarchyCache> = new Map();
  private static cacheDir: string = getTempDir(TEMP_SUBDIRS.VIEW_HIERARCHY);
  private static screenshotCacheDir: string = getTempDir(TEMP_SUBDIRS.SCREENSHOTS);
  private static readonly MAX_CACHE_SIZE_BYTES = 128 * 1024 * 1024; // 128MB
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Create a ViewHierarchy instance
   * @param device - Optional device
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   * @param takeScreenshot - Optional TakeScreenshot instance for testing
   * @param accessibilityServiceClient - Optional AccessibilityServiceClient instance for testing
   */
  constructor(
    device: BootedDevice,
    adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory,
    takeScreenshot: TakeScreenshot | null = null,
    accessibilityServiceClient: AccessibilityServiceClient | null = null,
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
    this.takeScreenshot = takeScreenshot || new TakeScreenshot(device, this.adbFactory);
    this.elementUtils = new ElementUtils();
    this.accessibilityServiceClient = accessibilityServiceClient || AccessibilityServiceClient.getInstance(device, this.adbFactory);

    // Ensure cache directories exist
    if (!fs.existsSync(ViewHierarchy.cacheDir)) {
      fs.mkdirSync(ViewHierarchy.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(ViewHierarchy.screenshotCacheDir)) {
      fs.mkdirSync(ViewHierarchy.screenshotCacheDir, { recursive: true });
    }
  }

  async configureRecompositionTracking(
    enabled: boolean,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<void> {
    if (this.device.platform !== "android") {
      return;
    }

    await this.accessibilityServiceClient.setRecompositionTrackingEnabled(enabled, perf);
  }

  /**
   * Calculate screenshot hash from buffer
   * @param screenshotBuffer - Buffer containing screenshot data
   * @returns MD5 hash of the screenshot
   */
  calculateScreenshotHash(screenshotBuffer: Buffer): string {
    return NodeCryptoService.generateCacheKey(screenshotBuffer);
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
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise with parsed XML view hierarchy
   */
  async getViewHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult> {
    switch (this.device.platform) {
      case "ios":
        return this.getiOSViewHierarchy(perf, skipWaitForFresh, minTimestamp);
      case "android":
        return this.getAndroidViewHierarchy(queryOptions, perf, skipWaitForFresh, minTimestamp, signal);
      default:
        throw new Error("Unsupported platform");
    }
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip waiting for fresh data and use cache if available
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise with parsed XML view hierarchy
   */
  async getiOSViewHierarchy(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<ViewHierarchyResult> {
    const startTime = Date.now();
    logger.info(`[VIEW_HIERARCHY] Starting getViewHierarchy for iOS (skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp})`);

    perf.serial("ios_viewHierarchy");

    const xcTestClient = XCTestServiceClient.getInstance(this.device);
    const viewHierarchy = await perf.track("xcTestService", async () => {
      // Use getLatestHierarchy which properly handles skipWaitForFresh and minTimestamp
      const result = await xcTestClient.getLatestHierarchy(
        !skipWaitForFresh, // waitForFresh = opposite of skipWaitForFresh
        15000,             // timeout
        perf,
        skipWaitForFresh,
        minTimestamp
      );

      if (!result || !result.hierarchy) {
        return {
          hierarchy: {
            error: "Failed to retrieve iOS view hierarchy from XCTestService"
          }
        } as unknown as ViewHierarchyResult;
      }

      // Convert XCTestHierarchy to ViewHierarchyResult format
      return this.convertXCTestHierarchy(result.hierarchy, result.updatedAt);
    });

    perf.end();

    const duration = Date.now() - startTime;
    logger.info(`[VIEW_HIERARCHY] Successfully retrieved hierarchy from XCTestService in ${duration}ms`);
    return viewHierarchy;
  }

  /**
   * Convert XCTestHierarchy to ViewHierarchyResult format
   */
  private convertXCTestHierarchy(hierarchy: any, updatedAt?: number): ViewHierarchyResult {
    return {
      ...hierarchy,
      updatedAt: updatedAt ?? hierarchy.updatedAt ?? Date.now()
    };
  }

  /**
   * Window types that should be excluded from hierarchy (conservative filtering).
   * These are overlay types that don't contain meaningful UI content.
   */
  private static readonly EXCLUDED_WINDOW_TYPES = new Set([
    "accessibility_overlay",
    "magnification_overlay"
  ]);

  /**
   * Generate a hash key for a node based on its identifying properties.
   * Used for deduplication when merging hierarchies from multiple sources.
   *
   * The hash identifies the "same" element across sources. Interaction properties
   * (clickable, scrollable, etc.) are NOT included because the same element may
   * have different capability metadata in different sources.
   *
   * @param node - The node to generate a hash for
   * @returns A string hash key representing the node's identity
   */
  generateNodeHash(node: any): string {
    if (!node) {
      return "";
    }

    const props = node.$ || node;
    const bounds = props.bounds || "";
    const resourceId = props["resource-id"] || props.resourceId || "";
    const text = props.text || "";
    const contentDesc = props["content-desc"] || props.contentDesc || "";
    const className = props.class || props.className || "";

    // Identity is based on position (bounds), identifiers (resource-id), and content (text, content-desc).
    // Interaction properties are intentionally excluded so that the same element
    // with different capability metadata is still treated as a duplicate.
    return `${bounds}|${resourceId}|${text}|${contentDesc}|${className}`;
  }

  /**
   * Check if a node has zero bounds (invisible or not rendered).
   *
   * @param node - The node to check
   * @returns True if the node has zero bounds
   */
  hasZeroBounds(node: any): boolean {
    if (!node) {
      return true;
    }

    const props = node.$ || node;
    const bounds = props.bounds;

    if (!bounds) {
      return false; // No bounds info, don't filter
    }

    // Parse bounds string format "[left,top][right,bottom]"
    if (typeof bounds === "string") {
      const match = bounds.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
      if (match) {
        const left = parseInt(match[1], 10);
        const top = parseInt(match[2], 10);
        const right = parseInt(match[3], 10);
        const bottom = parseInt(match[4], 10);
        return left === right || top === bottom;
      }
    }

    // Handle object format { left, top, right, bottom }
    if (typeof bounds === "object") {
      const { left, top, right, bottom } = bounds;
      return left === right || top === bottom;
    }

    return false;
  }

  /**
   * Check if a node is explicitly marked as invisible.
   *
   * @param node - The node to check
   * @returns True if the node is marked as not visible
   */
  isInvisible(node: any): boolean {
    if (!node) {
      return true;
    }

    const props = node.$ || node;
    const visible = props.visible;

    // Only filter if explicitly marked as false
    return visible === "false" || visible === false;
  }

  /**
   * Check if a node is interactable (clickable, scrollable, etc.).
   *
   * @param node - The node to check
   * @returns True if the node has any interactive properties
   */
  isInteractable(node: any): boolean {
    if (!node) {
      return false;
    }

    const props = node.$ || node;
    return (
      props.clickable === "true" ||
      props.scrollable === "true" ||
      props["long-clickable"] === "true" ||
      props.focusable === "true" ||
      props.checkable === "true"
    );
  }

  /**
   * Deduplicate nodes by their hash, preferring a11y data and interactable nodes.
   *
   * @param nodes - Array of nodes to deduplicate
   * @param sourcePreference - Source to prefer when deduping ("a11y" or "uiautomator")
   * @returns Deduplicated array of nodes
   */
  deduplicateNodes(nodes: any[], sourcePreference: "a11y" | "uiautomator" = "a11y"): any[] {
    const seen = new Map<string, { node: any; isA11y: boolean; isInteractable: boolean }>();

    for (const node of nodes) {
      const hash = this.generateNodeHash(node);
      if (!hash) {
        continue;
      }

      // Skip zero-bounds and invisible nodes
      if (this.hasZeroBounds(node) || this.isInvisible(node)) {
        continue;
      }

      const existing = seen.get(hash);
      const nodeIsInteractable = this.isInteractable(node);
      // Nodes from the first part of the array are from a11y when merging
      const nodeIsA11y = nodes.indexOf(node) < nodes.length / 2 && sourcePreference === "a11y";

      if (!existing) {
        seen.set(hash, { node, isA11y: nodeIsA11y, isInteractable: nodeIsInteractable });
      } else {
        // Prefer a11y over uiautomator, and interactable over non-interactable
        const shouldReplace =
          (sourcePreference === "a11y" && nodeIsA11y && !existing.isA11y) ||
          (nodeIsInteractable && !existing.isInteractable);

        if (shouldReplace) {
          seen.set(hash, { node, isA11y: nodeIsA11y, isInteractable: nodeIsInteractable });
        }
      }
    }

    return Array.from(seen.values()).map(entry => entry.node);
  }

  /**
   * Recursively deduplicate nodes throughout a hierarchy tree.
   *
   * @param node - Root node of the hierarchy
   * @returns Node with deduplicated children
   */
  deduplicateHierarchyTree(node: any): any {
    if (!node) {
      return node;
    }

    // Skip zero-bounds and invisible nodes
    if (this.hasZeroBounds(node) || this.isInvisible(node)) {
      return null;
    }

    const result = { ...node };

    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];

      // Recursively process children first
      const processedChildren = children
        .map((child: any) => this.deduplicateHierarchyTree(child))
        .filter((child: any) => child !== null);

      // Deduplicate at this level
      const dedupedChildren = this.deduplicateNodes(processedChildren);

      if (dedupedChildren.length === 0) {
        delete result.node;
      } else if (dedupedChildren.length === 1) {
        result.node = dedupedChildren[0];
      } else {
        result.node = dedupedChildren;
      }
    }

    return result;
  }

  /**
   * Filter out windows that are overlay types (conservative filtering).
   *
   * @param windows - Array of window info objects
   * @returns Filtered array excluding overlay windows
   */
  filterOverlayWindows(windows: any[] | undefined): any[] | undefined {
    if (!windows) {
      return undefined;
    }

    return windows.filter(window => {
      const windowType = window.windowType || window.type;
      if (typeof windowType === "string") {
        return !ViewHierarchy.EXCLUDED_WINDOW_TYPES.has(windowType);
      }
      // Numeric type codes: 4 = accessibility_overlay, 5 = magnification_overlay
      if (typeof windowType === "number") {
        return windowType !== 4 && windowType !== 5;
      }
      return true;
    });
  }

  /**
   * Merge accessibility service hierarchy with uiautomator hierarchy.
   * When accessibility service returns incomplete data (e.g., active window has null root),
   * we supplement it with uiautomator data.
   *
   * @param accessibilityHierarchy - Hierarchy from accessibility service
   * @param uiautomatorHierarchy - Hierarchy from uiautomator
   * @returns Merged hierarchy with combined root nodes
   */
  mergeHierarchies(
    accessibilityHierarchy: ViewHierarchyResult,
    uiautomatorHierarchy: ViewHierarchyResult
  ): ViewHierarchyResult {
    const a11yNode = accessibilityHierarchy.hierarchy?.node;
    const uiautomatorNode = uiautomatorHierarchy.hierarchy?.node;

    // If one is missing, use the other
    if (!a11yNode && !uiautomatorNode) {
      return {
        ...accessibilityHierarchy,
        hierarchy: { error: "No hierarchy data available from either source" },
        sources: ["accessibility-service", "uiautomator"]
      };
    }

    if (!a11yNode) {
      return {
        ...uiautomatorHierarchy,
        // Preserve metadata from accessibility service
        "packageName": accessibilityHierarchy.packageName || uiautomatorHierarchy.packageName,
        "windows": accessibilityHierarchy.windows,
        "intentChooserDetected": accessibilityHierarchy.intentChooserDetected,
        "notificationPermissionDetected": accessibilityHierarchy.notificationPermissionDetected,
        "accessibility-focused-element": accessibilityHierarchy["accessibility-focused-element"],
        "accessibilityServiceIncomplete": true,
        "sources": ["accessibility-service", "uiautomator"]
      };
    }

    if (!uiautomatorNode) {
      return {
        ...accessibilityHierarchy,
        sources: ["accessibility-service", "uiautomator"]
      };
    }

    // Both have data - combine and deduplicate root nodes
    // Accessibility service nodes come first to get preference in deduplication
    const combinedNodes: any[] = [];

    // Add accessibility service nodes first (they get preference)
    if (Array.isArray(a11yNode)) {
      combinedNodes.push(...a11yNode);
    } else {
      combinedNodes.push(a11yNode);
    }

    const a11yCount = combinedNodes.length;

    // Add uiautomator nodes
    if (Array.isArray(uiautomatorNode)) {
      combinedNodes.push(...uiautomatorNode);
    } else {
      combinedNodes.push(uiautomatorNode);
    }

    logger.debug(`[VIEW_HIERARCHY] Before deduplication: ${combinedNodes.length} root nodes (${a11yCount} a11y, ${combinedNodes.length - a11yCount} uiautomator)`);

    // Deduplicate root nodes, preferring a11y data
    const deduplicatedNodes = this.deduplicateNodes(combinedNodes, "a11y");

    // Recursively deduplicate within each root node's tree
    const processedNodes = deduplicatedNodes
      .map(node => this.deduplicateHierarchyTree(node))
      .filter(node => node !== null);

    logger.debug(`[VIEW_HIERARCHY] After deduplication: ${processedNodes.length} root nodes`);

    // Filter overlay windows from the windows metadata
    const filteredWindows = this.filterOverlayWindows(accessibilityHierarchy.windows);

    return {
      ...accessibilityHierarchy,
      windows: filteredWindows,
      hierarchy: {
        node: processedNodes.length === 1 ? processedNodes[0] : processedNodes
      },
      accessibilityServiceIncomplete: true,
      sources: ["accessibility-service", "uiautomator"]
    };
  }

  /**
   * Get uiautomator hierarchy for fallback/merge scenarios.
   * This is a public method that can be used by other components.
   */
  async getUiAutomatorHierarchy(
    signal?: AbortSignal,
    filter: boolean = true
  ): Promise<ViewHierarchyResult> {
    const result = await this._getViewHierarchyWithoutCache(signal, filter);
    return {
      ...result,
      sources: ["uiautomator"] as HierarchySource[]
    };
  }

  /**
   * Retrieve the view hierarchy of the current screen
   * @param queryOptions - Optional query options for targeted element retrieval
   * @param perf - Performance tracker for timing data
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise with parsed XML view hierarchy
   */
  async getAndroidViewHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult> {
    const startTime = Date.now();
    logger.debug(`[VIEW_HIERARCHY] Starting Android getViewHierarchy (skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp})`);

    perf.serial("android_viewHierarchy");
    const useRawElementSearch = serverConfig.isRawElementSearchEnabled();

    // First try accessibility service if available and not skipped
    try {
      const accessibilityHierarchy = await this.accessibilityServiceClient.getAccessibilityHierarchy(
        queryOptions,
        perf,
        skipWaitForFresh,
        minTimestamp,
        useRawElementSearch,
        signal
      );
      if (accessibilityHierarchy) {
        // Check if accessibility service hierarchy is incomplete
        if (accessibilityHierarchy.accessibilityServiceIncomplete) {
          logger.info("[VIEW_HIERARCHY] Accessibility service returned incomplete hierarchy, fetching uiautomator fallback");
          try {
            const uiautomatorHierarchy = await perf.track("uiautomatorFallback", () =>
              this._getViewHierarchyWithoutCache(signal, !useRawElementSearch)
            );
            const mergedHierarchy = this.mergeHierarchies(accessibilityHierarchy, uiautomatorHierarchy);
            perf.end();
            const accessibilityDuration = Date.now() - startTime;
            logger.info(`[VIEW_HIERARCHY] Retrieved merged hierarchy (a11y + uiautomator) in ${accessibilityDuration}ms`);
            return this.prepareHierarchyForResponse(mergedHierarchy);
          } catch (fallbackErr) {
            logger.warn(`[VIEW_HIERARCHY] Failed to get uiautomator fallback: ${fallbackErr}`);
            // Fall through to return incomplete accessibility hierarchy
          }
        }

        perf.end();
        const accessibilityDuration = Date.now() - startTime;
        logger.debug(`[VIEW_HIERARCHY] Successfully retrieved hierarchy from accessibility service in ${accessibilityDuration}ms`);
        return this.prepareHierarchyForResponse(accessibilityHierarchy);
      }
    } catch (err) {
      logger.warn(`[VIEW_HIERARCHY] Failed to get hierarchy from accessibility service: ${err}`);
    }

    try {
      // Get fresh view hierarchy via uiautomator
      const viewHierarchy = await perf.track("uiautomatorFallback", () =>
        this._getViewHierarchyWithoutCache(signal, !useRawElementSearch)
      );
      const freshDuration = Date.now() - startTime;
      logger.debug(`[VIEW_HIERARCHY] Fresh hierarchy fetched in ${freshDuration}ms`);

      const preparedHierarchy = this.prepareHierarchyForResponse(viewHierarchy);

      // Cache the result using a timestamp
      const timestamp = Date.now();
      logger.debug(`[VIEW_HIERARCHY] Caching view hierarchy with timestamp: ${timestamp}`);
      await perf.track("cacheHierarchy", () =>
        this.cacheViewHierarchy(timestamp, preparedHierarchy)
      );

      perf.end();

      const totalDuration = Date.now() - startTime;
      logger.debug(`[VIEW_HIERARCHY] *** FRESH HIERARCHY: getViewHierarchy completed in ${totalDuration}ms (fresh hierarchy) ***`);
      return preparedHierarchy;
    } catch (err) {
      perf.end();
      const totalDuration = Date.now() - startTime;
      logger.warn(`[VIEW_HIERARCHY] getViewHierarchy failed after ${totalDuration}ms:`, err);

      // If the error is one of the specific ADB errors, re-call _getViewHierarchyWithoutCache
      // to ensure its specific error message is returned.
      if (err instanceof Error &&
        (err.message.includes("null root node returned by UiTestAutomationBridge") ||
          err.message.includes("cat:") ||
          err.message.includes("No such file or directory"))) {
        logger.debug("[VIEW_HIERARCHY] Specific ADB error detected, calling _getViewHierarchyWithoutCache to get its specific error message.");
        const fallbackHierarchy = await this._getViewHierarchyWithoutCache(signal, !useRawElementSearch);
        return this.prepareHierarchyForResponse(fallbackHierarchy);
      }

      // If screenshot-related error, fall back to getting view hierarchy without cache
      // (this might also lead to one of the specific errors above if _getViewHierarchyWithoutCache fails)
      if (err instanceof Error && err.message.includes("screenshot")) {
        logger.debug("[VIEW_HIERARCHY] Screenshot error detected, falling back to view hierarchy without cache");
        const fallbackResult = await this._getViewHierarchyWithoutCache(signal, !useRawElementSearch);
        // If the fallback result has a specific error message, preserve it
        if (fallbackResult.hierarchy && (fallbackResult.hierarchy as any).error) {
          return fallbackResult;
        }
        return this.prepareHierarchyForResponse(fallbackResult);
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
  public async executeUiAutomatorDump(signal?: AbortSignal): Promise<string> {
    // Optimized: Use /data/local/tmp which is more reliable than /sdcard
    const tempFile = "/data/local/tmp/window_dump.xml";

    // Use shell subcommand to ensure atomicity and avoid separate rm command
    const result = await this.adb.executeCommand(
      `shell "(uiautomator dump ${tempFile} >/dev/null 2>&1 && cat ${tempFile}; rm -f ${tempFile}) 2>/dev/null"`,
      undefined,
      undefined,
      undefined,
      signal
    );

    // Check for any error indicators in stderr and throw if found
    if (result.stderr) {
      const stderrStr = String(result.stderr);
      if (stderrStr.trim().length > 0) {
        throw new Error(stderrStr);
      }
    }

    return this.extractXmlFromAdbOutput(result.stdout, tempFile);
  }

  /**
   * Process XML data into view hierarchy result
   * @param xmlData - XML string to process
   * @returns Promise with processed view hierarchy result
   */
  public async processXmlData(xmlData: string, filter: boolean = true): Promise<ViewHierarchyResult> {
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
    const result = await this.parseXmlToViewHierarchy(xmlData, filter);

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
   * - OR have clickable, scrollable, focused, or selected set to true
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

  private prepareHierarchyForResponse(rawHierarchy: ViewHierarchyResult): ViewHierarchyResult {
    if (!serverConfig.isRawElementSearchEnabled()) {
      return rawHierarchy;
    }

    if (
      rawHierarchy?.hierarchy &&
      typeof rawHierarchy.hierarchy === "object" &&
      "error" in rawHierarchy.hierarchy &&
      rawHierarchy.hierarchy.error
    ) {
      return rawHierarchy;
    }

    if (this.device.platform !== "android") {
      return rawHierarchy;
    }

    const filtered = this.filterViewHierarchy(rawHierarchy);
    attachRawViewHierarchy(filtered, rawHierarchy);
    return filtered;
  }

  /**
   * Parse bounds string to numeric coordinates, handling negative values
   * @param boundsStr - Bounds string in format [left,top][right,bottom]
   * @returns Parsed bounds or null if invalid
   */
  private parseBoundsString(boundsStr: string): ElementBounds | null {
    if (!boundsStr || typeof boundsStr !== "string") {
      return null;
    }
    // Handle negative coordinates with -? prefix
    const match = boundsStr.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!match) {
      return null;
    }
    return {
      left: parseInt(match[1], 10),
      top: parseInt(match[2], 10),
      right: parseInt(match[3], 10),
      bottom: parseInt(match[4], 10)
    };
  }

  /**
   * Check if bounds are completely offscreen
   * @param bounds - Element bounds
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @param margin - Extra margin around screen to keep near-visible elements (default 100px)
   * @returns True if element is completely offscreen
   */
  private isCompletelyOffscreen(
    bounds: ElementBounds,
    screenWidth: number,
    screenHeight: number,
    margin: number = 100
  ): boolean {
    // Element is offscreen if it's completely outside the screen + margin
    return (
      bounds.right < -margin ||           // Completely left of screen
      bounds.left > screenWidth + margin ||  // Completely right of screen
      bounds.bottom < -margin ||          // Completely above screen
      bounds.top > screenHeight + margin     // Completely below screen
    );
  }

  /**
   * Recursively filter out offscreen nodes from the hierarchy
   * @param node - Node to filter
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @param margin - Extra margin to keep near-visible elements
   * @returns Filtered node or null if completely offscreen with no visible children
   */
  private filterOffscreenNode(
    node: any,
    screenWidth: number,
    screenHeight: number,
    margin: number = 100
  ): any | null {
    if (!node) {
      return null;
    }

    // Parse bounds from string if present
    const boundsStr = node.bounds || (node.$ && node.$.bounds);
    let bounds: ElementBounds | null = null;

    if (typeof boundsStr === "string") {
      bounds = this.parseBoundsString(boundsStr);
    } else if (boundsStr && typeof boundsStr === "object") {
      bounds = boundsStr as ElementBounds;
    }

    // Check if this node is completely offscreen
    const isOffscreen = bounds && this.isCompletelyOffscreen(bounds, screenWidth, screenHeight, margin);

    // Process children
    const children = node.node;
    const filteredChildren: any[] = [];

    if (children) {
      const childArray = Array.isArray(children) ? children : [children];
      for (const child of childArray) {
        const filteredChild = this.filterOffscreenNode(child, screenWidth, screenHeight, margin);
        if (filteredChild !== null) {
          if (Array.isArray(filteredChild)) {
            filteredChildren.push(...filteredChild);
          } else {
            filteredChildren.push(filteredChild);
          }
        }
      }
    }

    // If node is offscreen but has visible children, return just the children
    if (isOffscreen && filteredChildren.length > 0) {
      return filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren;
    }

    // If node is offscreen and has no visible children, filter it out
    if (isOffscreen && filteredChildren.length === 0) {
      return null;
    }

    // Node is visible - return it with filtered children
    const result = { ...node };
    if (filteredChildren.length > 0) {
      result.node = filteredChildren.length === 1 ? filteredChildren[0] : filteredChildren;
    } else if (node.node) {
      delete result.node;
    }

    return result;
  }

  /**
   * Filter out completely offscreen nodes from the view hierarchy
   * This reduces hierarchy size significantly for scrollable content (like YouTube)
   * @param viewHierarchy - The view hierarchy to filter
   * @param screenWidth - Screen width in pixels
   * @param screenHeight - Screen height in pixels
   * @param margin - Extra margin around screen to keep near-visible elements (default 100px)
   * @returns Filtered view hierarchy with offscreen nodes removed
   */
  filterOffscreenNodes(
    viewHierarchy: any,
    screenWidth: number,
    screenHeight: number,
    margin: number = 100
  ): any {
    if (!viewHierarchy || !viewHierarchy.hierarchy || screenWidth <= 0 || screenHeight <= 0) {
      return viewHierarchy;
    }

    const originalSize = JSON.stringify(viewHierarchy.hierarchy).length;

    const result = { ...viewHierarchy };
    result.hierarchy = this.filterOffscreenNode(viewHierarchy.hierarchy, screenWidth, screenHeight, margin);

    const filteredSize = JSON.stringify(result.hierarchy).length;
    const reduction = Math.round((1 - filteredSize / originalSize) * 100);

    if (reduction > 10) {
      logger.debug(`Offscreen filtering reduced hierarchy by ${reduction}% (${originalSize} -> ${filteredSize} bytes)`);
    }

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
  async parseXmlToViewHierarchy(xmlData: string, filter: boolean = true): Promise<ViewHierarchyResult> {
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xmlData);
    return filter ? this.filterViewHierarchy(result) : result;
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
      (props["content-desc"] && props["content-desc"] !== "") ||
      (props["test-tag"] && props["test-tag"] !== "") ||
      props.recomposition ||
      props.recompositionMetrics
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
      (props.focused === "true") ||
      (props.selected === "true") ||
      (props.selected === true)
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
  async _getViewHierarchyWithoutCache(signal?: AbortSignal, filter: boolean = true): Promise<ViewHierarchyResult> {
    const dumpStart = Date.now();

    try {
      // Run uiautomator dump
      const xmlData = await this.executeUiAutomatorDump(signal);

      logger.debug(`uiautomator dump took ${Date.now() - dumpStart}ms`);

      // Process XML data into view hierarchy result
      const hierarchyResult = await this.processXmlData(xmlData, filter);

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
    if (!viewHierarchy) {
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

    // Search in main hierarchy first
    if (viewHierarchy.hierarchy) {
      traverseNode(viewHierarchy.hierarchy);
    }

    return focusedElement;
  }

  /**
   * Find the accessibility-focused element (TalkBack cursor position) in the view hierarchy.
   * First checks the top-level accessibility-focused-element field, then traverses if needed.
   */
  findAccessibilityFocusedElement(viewHierarchy: any): Element | null {
    if (!viewHierarchy) {
      return null;
    }

    // First check if accessibility-focused-element is provided at the top level (from Kotlin)
    if (viewHierarchy["accessibility-focused-element"]) {
      const element = this.parseNodeBounds(viewHierarchy["accessibility-focused-element"]);
      if (element) {
        element["accessibility-focused"] = true;
        return element;
      }
    }

    // Fallback: traverse the hierarchy to find the accessibility-focused element
    let accessibilityFocusedElement: Element | null = null;

    const traverseNode = (node: any): void => {
      if (accessibilityFocusedElement) {
        return; // Already found accessibility-focused element, stop traversing
      }

      // Check if current node has accessibility focus
      const props = node.$ || node;
      if (props["accessibility-focused"] === "true" || props["accessibility-focused"] === true) {
        // Parse the node into an Element
        const element = this.parseNodeBounds(node);
        if (element) {
          // Ensure accessibility-focused property is a boolean
          element["accessibility-focused"] = true;
          accessibilityFocusedElement = element;
          return;
        }
      }

      // Continue traversing children
      if (node.node) {
        const children = Array.isArray(node.node) ? node.node : [node.node];
        for (const child of children) {
          traverseNode(child);
          if (accessibilityFocusedElement) {
            break; // Stop if we found the accessibility-focused element
          }
        }
      }
    };

    // Search in main hierarchy first
    if (viewHierarchy.hierarchy) {
      traverseNode(viewHierarchy.hierarchy);
    }

    return accessibilityFocusedElement;
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
    const allowedProperties = [
      "text",
      "resourceId",
      "resource-id",
      "contentDesc",
      "content-desc",
      "clickable",
      "scrollable",
      "enabled",
      "selected",
      "bounds",
      "test-tag",
      "extras",
      "recomposition",
      "recompositionMetrics"
    ];

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

}
