import WebSocket from "ws";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice, ViewHierarchyResult } from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { AccessibilityServiceManager } from "../../utils/accessibilityServiceManager";
import { IPerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

/**
 * Interface for accessibility service node format
 */
interface AccessibilityNode {
    text?: string;
    "content-desc"?: string;
    "resource-id"?: string;
    className?: string;
    packageName?: string;
    bounds?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    clickable?: string;
    enabled?: string;
    focusable?: string;
    focused?: string;
    scrollable?: string;
    password?: string;
    checkable?: string;
    checked?: string;
    selected?: string;
    "long-clickable"?: string;
  accessible?: number;
  node?: AccessibilityNode | AccessibilityNode[];
}

/**
 * Interface for accessibility service hierarchy format
 */
interface AccessibilityHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: AccessibilityNode;
}

/**
 * Interface for WebSocket message from accessibility service
 */
interface WebSocketMessage {
  type: string;
  timestamp?: number;
  requestId?: string;
  data?: AccessibilityHierarchy;
  format?: string;
  error?: string;
}

/**
 * Interface for screenshot result
 */
export interface ScreenshotResult {
  success: boolean;
  data?: string; // Base64 encoded JPEG
  format?: string;
  timestamp?: number;
  error?: string;
}

/**
 * Interface for cached hierarchy with metadata
 */
interface CachedHierarchy {
  hierarchy: AccessibilityHierarchy;
  receivedAt: number;
  fresh: boolean;
}

/**
 * Interface for hierarchy response with freshness indicator
 */
export interface AccessibilityHierarchyResponse {
  hierarchy: AccessibilityHierarchy | null;
  fresh: boolean;
  updatedAt?: number; // Timestamp from device (only present when hierarchy data exists)
}

/**
 * Client for interacting with the AutoMobile Accessibility Service via WebSocket
 * Uses singleton pattern per device to maintain persistent WebSocket connection
 */
export class AccessibilityServiceClient {
  private device: BootedDevice;
  private adb: AdbUtils;
  private static readonly PACKAGE_NAME = "dev.jasonpearson.automobile.accessibilityservice";
  private static readonly WEBSOCKET_PORT = 8765;
  private static readonly WEBSOCKET_URL = `ws://localhost:${AccessibilityServiceClient.WEBSOCKET_PORT}/ws`;

  // Singleton instances per device
  private static instances: Map<string, AccessibilityServiceClient> = new Map();

  private ws: WebSocket | null = null;
  private cachedHierarchy: CachedHierarchy | null = null;
  private isConnecting: boolean = false;
  private connectionAttempts: number = 0;
  private lastConnectionAttempt: number = 0;
  private readonly maxConnectionAttempts: number = 3;
  private static readonly CONNECTION_ATTEMPT_RESET_MS = 10000; // Reset attempts after 10 seconds
  private portForwardingSetup: boolean = false;
  private lastWebSocketTimeout: number = 0;
  private static readonly WEBSOCKET_TIMEOUT_COOLDOWN_MS = 5000; // Skip WebSocket wait for 5 seconds after timeout

  // Screenshot handling
  private pendingScreenshotResolve: ((result: ScreenshotResult) => void) | null = null;
  private pendingScreenshotRequestId: string | null = null;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(device: BootedDevice, adb: AdbUtils) {
    this.device = device;
    this.adb = adb;
    AccessibilityServiceManager.getInstance(device, adb);
  }

  /**
   * Get singleton instance for a device
   * @param device - The booted device
   * @param adb - Optional AdbUtils instance
   * @returns AccessibilityServiceClient instance
   */
  public static getInstance(device: BootedDevice, adb: AdbUtils | null = null): AccessibilityServiceClient {
    const deviceId = device.deviceId;
    if (!AccessibilityServiceClient.instances.has(deviceId)) {
      logger.debug(`[ACCESSIBILITY_SERVICE] Creating singleton for device: ${deviceId}`);
      AccessibilityServiceClient.instances.set(
        deviceId,
        new AccessibilityServiceClient(device, adb || new AdbUtils(device))
      );
    }
    return AccessibilityServiceClient.instances.get(deviceId)!;
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    for (const instance of AccessibilityServiceClient.instances.values()) {
      instance.close().catch(() => {});
    }
    AccessibilityServiceClient.instances.clear();
    logger.info("[ACCESSIBILITY_SERVICE] Reset all singleton instances");
  }

  /**
   * Check if WebSocket is currently connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Check if there is cached hierarchy data
   */
  public hasCachedHierarchy(): boolean {
    return this.cachedHierarchy !== null;
  }

  /**
   * Setup ADB port forwarding for WebSocket connection
   * @param perf - Performance tracker for timing
   */
  private async setupPortForwarding(
    perf: IPerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<void> {
    if (this.portForwardingSetup) {
      return;
    }

    try {
      logger.info(`[ACCESSIBILITY_SERVICE] Setting up port forwarding for WebSocket: localhost:${AccessibilityServiceClient.WEBSOCKET_PORT} → device:${AccessibilityServiceClient.WEBSOCKET_PORT}`);

      // Clear any existing forwarding for this port
      await perf.track("clearPortForward", () =>
        this.adb.executeCommand(`forward --remove tcp:${AccessibilityServiceClient.WEBSOCKET_PORT}`).catch(() => {
          // Ignore errors if no forwarding exists
        })
      );

      // Setup new forwarding
      await perf.track("setupPortForward", () =>
        this.adb.executeCommand(`forward tcp:${AccessibilityServiceClient.WEBSOCKET_PORT} tcp:${AccessibilityServiceClient.WEBSOCKET_PORT}`)
      );

      this.portForwardingSetup = true;
      logger.info("[ACCESSIBILITY_SERVICE] Port forwarding setup complete");
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to setup port forwarding: ${error}`);
      throw error;
    }
  }

  /**
   * Connect to the WebSocket server
   * @param perf - Performance tracker for timing
   */
  private async connectWebSocket(
    perf: IPerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.debug("[ACCESSIBILITY_SERVICE] WebSocket already connected (reusing connection)");
      return true;
    }

    // If WebSocket exists but is not OPEN (stale/closing), clean it up and reset attempts
    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
      logger.info(`[ACCESSIBILITY_SERVICE] Cleaning up stale WebSocket (state: ${this.ws.readyState})`);
      try {
        this.ws.close();
      } catch {
        // Ignore close errors on stale socket
      }
      this.ws = null;
      this.connectionAttempts = 0; // Reset to allow new connection attempts
    }

    if (this.isConnecting) {
      logger.debug("[ACCESSIBILITY_SERVICE] Connection already in progress, waiting...");
      // Wait for ongoing connection attempt
      return new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (!this.isConnecting) {
            clearInterval(checkInterval);
            resolve(this.ws?.readyState === WebSocket.OPEN);
          }
        }, 100);
      });
    }

    // Reset connection attempts if enough time has passed since last attempt
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      const timeSinceLastAttempt = Date.now() - this.lastConnectionAttempt;
      if (timeSinceLastAttempt >= AccessibilityServiceClient.CONNECTION_ATTEMPT_RESET_MS) {
        logger.info(`[ACCESSIBILITY_SERVICE] Resetting connection attempts after ${timeSinceLastAttempt}ms cooldown`);
        this.connectionAttempts = 0;
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Max connection attempts (${this.maxConnectionAttempts}) reached, cooldown remaining: ${AccessibilityServiceClient.CONNECTION_ATTEMPT_RESET_MS - timeSinceLastAttempt}ms`);
        return false;
      }
    }

    this.isConnecting = true;
    this.connectionAttempts++;
    this.lastConnectionAttempt = Date.now();

    try {
      // Ensure port forwarding is setup
      await perf.track("portForwarding", () => this.setupPortForwarding(perf));

      logger.info(`[ACCESSIBILITY_SERVICE] Connecting to WebSocket at ${AccessibilityServiceClient.WEBSOCKET_URL} (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);

      return await perf.track("wsConnect", () => new Promise<boolean>((resolve, reject) => {
        const ws = new WebSocket(AccessibilityServiceClient.WEBSOCKET_URL);
        const connectionTimeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        ws.on("open", () => {
          clearTimeout(connectionTimeout);
          logger.info("[ACCESSIBILITY_SERVICE] WebSocket connected successfully");
          this.ws = ws;
          this.isConnecting = false;
          this.connectionAttempts = 0; // Reset on successful connection
          resolve(true);
        });

        ws.on("message", (data: WebSocket.Data) => {
          this.handleWebSocketMessage(data);
        });

        ws.on("error", error => {
          clearTimeout(connectionTimeout);
          logger.warn(`[ACCESSIBILITY_SERVICE] WebSocket error: ${error.message}`);
          this.isConnecting = false;
          reject(error);
        });

        ws.on("close", () => {
          logger.info("[ACCESSIBILITY_SERVICE] WebSocket connection closed");
          this.ws = null;
          this.isConnecting = false;
          // Reset connection attempts on close to allow future retries
          this.connectionAttempts = 0;
        });
      }));
    } catch (error) {
      this.isConnecting = false;
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to connect to WebSocket: ${error}`);
      return false;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (message.type === "connected") {
        logger.debug(`[ACCESSIBILITY_SERVICE] Received connection confirmation`);
        return;
      }

      if (message.type === "hierarchy_update" && message.data) {
        const now = Date.now();
        logger.debug(`[ACCESSIBILITY_SERVICE] Received hierarchy update (updatedAt: ${message.data.updatedAt})`);

        // Mark previous cache as stale
        if (this.cachedHierarchy) {
          this.cachedHierarchy.fresh = false;
        }

        // Update cache with fresh data
        this.cachedHierarchy = {
          hierarchy: message.data,
          receivedAt: now,
          fresh: true
        };

        logger.debug(`[ACCESSIBILITY_SERVICE] Cached fresh hierarchy (updatedAt: ${message.data.updatedAt})`);
      }

      // Handle screenshot response
      if (message.type === "screenshot" && this.pendingScreenshotResolve) {
        logger.debug(`[ACCESSIBILITY_SERVICE] Received screenshot (requestId: ${message.requestId}, format: ${message.format})`);
        const resolve = this.pendingScreenshotResolve;
        this.pendingScreenshotResolve = null;
        this.pendingScreenshotRequestId = null;

        // Extract data from the message - it may be nested under 'data' key or directly on message
        const base64Data = (message as any).data as string;
        resolve({
          success: true,
          data: base64Data,
          format: message.format || "jpeg",
          timestamp: message.timestamp
        });
      }

      // Handle screenshot error
      if (message.type === "screenshot_error" && this.pendingScreenshotResolve) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Screenshot error (requestId: ${message.requestId}): ${message.error}`);
        const resolve = this.pendingScreenshotResolve;
        this.pendingScreenshotResolve = null;
        this.pendingScreenshotRequestId = null;
        resolve({
          success: false,
          error: message.error || "Unknown error"
        });
      }
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error handling WebSocket message: ${error}`);
    }
  }

  /**
   * Check if we should skip WebSocket wait due to recent timeout
   */
  private shouldSkipWebSocketWait(): boolean {
    if (this.lastWebSocketTimeout === 0) {
      return false;
    }
    const timeSinceTimeout = Date.now() - this.lastWebSocketTimeout;
    return timeSinceTimeout < AccessibilityServiceClient.WEBSOCKET_TIMEOUT_COOLDOWN_MS;
  }

  /**
   * Get the latest hierarchy from cache or wait for fresh data
   * @param waitForFresh - If true, wait up to timeout for fresh data
   * @param timeout - Maximum time to wait for fresh data in milliseconds
   * @param perf - Performance tracker for timing
   * @param skipWaitForFresh - If true, skip waiting for fresh data entirely (go straight to sync)
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value to be considered fresh
   * @returns Promise<AccessibilityHierarchyResponse>
   */
  async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 100,
    perf: IPerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<AccessibilityHierarchyResponse> {
    const startTime = Date.now();

    logger.debug(`[ACCESSIBILITY_SERVICE] getLatestHierarchy: cache=${this.cachedHierarchy ? "exists" : "null"}, waitForFresh=${waitForFresh}, skipWaitForFresh=${skipWaitForFresh}, minTimestamp=${minTimestamp}`);

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection");
        return {
          hierarchy: null,
          fresh: false
          // updatedAt not included - no device data available
        };
      }

      // If we have cached data and not waiting for fresh, return it immediately
      // This is the fast path for direct observe calls (skipWaitForFresh=true)
      // But if minTimestamp is set, we must verify the cached data is new enough
      if (this.cachedHierarchy && !waitForFresh) {
        const cacheAge = startTime - this.cachedHierarchy.receivedAt;
        const updatedAt = this.cachedHierarchy.hierarchy.updatedAt;

        // If minTimestamp is set, check if cached data is too old
        if (minTimestamp > 0 && updatedAt < minTimestamp) {
          logger.debug(`[ACCESSIBILITY_SERVICE] Cache rejected: updatedAt ${updatedAt} < minTimestamp ${minTimestamp} (stale by ${minTimestamp - updatedAt}ms)`);
          // Fall through to wait for fresh data or sync
        } else {
          const isFresh = cacheAge < 1000; // Consider fresh if less than 1 second old
          const duration = Date.now() - startTime;
          logger.debug(`[ACCESSIBILITY_SERVICE] Cache hit: ${duration}ms (age: ${cacheAge}ms, fresh: ${isFresh}, updatedAt: ${updatedAt})`);

          return {
            hierarchy: this.cachedHierarchy.hierarchy,
            fresh: isFresh,
            updatedAt: updatedAt
          };
        }
      }

      // Wait for fresh data if requested (unless skipped or recently timed out)
      // Also wait if cache was rejected due to minTimestamp
      const cacheRejected = minTimestamp > 0 && this.cachedHierarchy && this.cachedHierarchy.hierarchy.updatedAt < minTimestamp;
      if ((waitForFresh || cacheRejected) && !skipWaitForFresh && !this.shouldSkipWebSocketWait()) {
        // Use minTimestamp if provided, otherwise use startTime
        const waitMinTimestamp = minTimestamp > 0 ? minTimestamp : startTime;
        logger.debug(`[ACCESSIBILITY_SERVICE] Waiting up to ${timeout}ms for fresh hierarchy data (must be newer than ${waitMinTimestamp})`);

        const freshData = await perf.track("waitForFresh", () => this.waitForFreshData(timeout, waitMinTimestamp));
        const duration = Date.now() - startTime;

        if (freshData) {
          logger.info(`[ACCESSIBILITY_SERVICE] Received fresh hierarchy in ${duration}ms (updatedAt: ${freshData.hierarchy.updatedAt})`);
          return {
            hierarchy: freshData.hierarchy,
            fresh: true,
            updatedAt: freshData.hierarchy.updatedAt
          };
        } else {
          // Record timeout so we skip WebSocket wait for a while
          this.lastWebSocketTimeout = Date.now();
          logger.warn(`[ACCESSIBILITY_SERVICE] Timeout waiting for fresh data after ${duration}ms, will skip WebSocket wait for ${AccessibilityServiceClient.WEBSOCKET_TIMEOUT_COOLDOWN_MS}ms`);

          // Return cached data if available, mark as stale so caller knows to try sync method
          if (this.cachedHierarchy) {
            // Mark cache as stale since we couldn't get fresh push data
            this.cachedHierarchy.fresh = false;
            logger.info(`[ACCESSIBILITY_SERVICE] Returning stale cached data (updatedAt: ${this.cachedHierarchy.hierarchy.updatedAt}), marked cache as stale`);
            return {
              hierarchy: this.cachedHierarchy.hierarchy,
              fresh: false,
              updatedAt: this.cachedHierarchy.hierarchy.updatedAt
            };
          }
        }
      } else if (skipWaitForFresh || this.shouldSkipWebSocketWait()) {
        logger.debug(`[ACCESSIBILITY_SERVICE] Skipping WebSocket wait (skipWaitForFresh=${skipWaitForFresh}, recentTimeout=${this.shouldSkipWebSocketWait()})`);
      }

      // No cached data available
      logger.debug("[ACCESSIBILITY_SERVICE] No cached hierarchy data available");
      return {
        hierarchy: null,
        fresh: false
        // updatedAt not included - no device data available
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to get hierarchy after ${duration}ms: ${error}`);
      return {
        hierarchy: null,
        fresh: false
        // updatedAt not included - no device data available
      };
    }
  }

  /**
   * Wait for fresh data to arrive via WebSocket
   * @param timeout - Maximum time to wait in milliseconds
   * @param minTimestamp - Minimum timestamp the data must have (request start time)
   * @returns CachedHierarchy if fresh data received, null on timeout
   */
  private async waitForFreshData(timeout: number, minTimestamp: number): Promise<CachedHierarchy | null> {
    return new Promise(resolve => {
      const startTime = Date.now();
      const checkInterval = 50; // Check every 50ms

      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // Check if we received data that was updated AFTER our request started
        // This ensures we get fresh pushed data, not stale cached data
        if (this.cachedHierarchy) {
          const receivedAfterRequest = this.cachedHierarchy.receivedAt > minTimestamp;
          const updatedAfterRequest = this.cachedHierarchy.hierarchy.updatedAt > minTimestamp;

          if (receivedAfterRequest || updatedAfterRequest) {
            clearInterval(intervalId);
            logger.debug(`[ACCESSIBILITY_SERVICE] Fresh data received: receivedAt=${this.cachedHierarchy.receivedAt} (>${minTimestamp}? ${receivedAfterRequest}), updatedAt=${this.cachedHierarchy.hierarchy.updatedAt} (>${minTimestamp}? ${updatedAfterRequest})`);
            resolve(this.cachedHierarchy);
            return;
          }
        }

        // Check if timeout exceeded
        if (elapsed >= timeout) {
          clearInterval(intervalId);
          if (this.cachedHierarchy) {
            logger.debug(`[ACCESSIBILITY_SERVICE] Timeout: cached data receivedAt=${this.cachedHierarchy.receivedAt}, updatedAt=${this.cachedHierarchy.hierarchy.updatedAt}, minTimestamp=${minTimestamp}`);
          }
          resolve(null);
        }
      }, checkInterval);
    });
  }

  /**
     * Convert accessibility service hierarchy format to ViewHierarchyResult format
     * @param accessibilityHierarchy - The accessibility service hierarchy data
     * @returns ViewHierarchyResult - Converted hierarchy in the expected format
     */
  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult {
    const startTime = Date.now();

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Converting accessibility service format to ViewHierarchyResult format");

      // Convert the accessibility node format to match the existing XML-based format
      const convertedHierarchy = this.convertAccessibilityNode(accessibilityHierarchy.hierarchy);

      const result: ViewHierarchyResult = {
        hierarchy: convertedHierarchy,
        packageName: accessibilityHierarchy.packageName
      };

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Format conversion completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Format conversion failed after ${duration}ms: ${error}`);

      // Return error format consistent with existing error handling
      return {
        hierarchy: {
          error: "Failed to convert accessibility service hierarchy format"
        }
      } as ViewHierarchyResult;
    }
  }

  /**
     * Convert individual accessibility node to the expected format
     * @param node - The accessibility service node
     * @returns Converted node in XML-like format
     */
  private convertAccessibilityNode(node: AccessibilityNode | AccessibilityNode[]): any {
    // Handle array of nodes
    if (Array.isArray(node)) {
      const convertedArray = node.map(child => this.convertAccessibilityNode(child));
      // If there's only one element in the array, return it as a single object
      // This matches the expected behavior from the original XML parsing logic
      return convertedArray.length === 1 ? convertedArray[0] : convertedArray;
    }

    const converted: any = {};

    // Copy over all properties
    if (node.text) {
      converted.text = node.text;
    }
    if (node["content-desc"]) {
      converted["content-desc"] = node["content-desc"];
    }
    if (node["resource-id"]) {
      converted["resource-id"] = node["resource-id"];
    }
    if (node.className) {
      converted.className = node.className;
    }
    if (node.packageName) {
      converted.packageName = node.packageName;
    }
    if (node.clickable && node.clickable !== "false") {
      converted.clickable = node.clickable;
    }
    if (node.enabled && node.enabled !== "false") {
      converted.enabled = node.enabled;
    }
    if (node.focusable && node.focusable !== "false") {
      converted.focusable = node.focusable;
    }
    if (node.focused && node.focused !== "false") {
      converted.focused = node.focused;
    }
    if (node.scrollable && node.scrollable !== "false") {
      converted.scrollable = node.scrollable;
    }
    if (node.password && node.password !== "false") {
      converted.password = node.password;
    }
    if (node.checkable && node.checkable !== "false") {
      converted.checkable = node.checkable;
    }
    if (node.checked && node.checked !== "false") {
      converted.checked = node.checked;
    }
    if (node.selected && node.selected !== "false") {
      converted.selected = node.selected;
    }
    if (node["long-clickable"] && node["long-clickable"] !== "false") {
      converted["long-clickable"] = node["long-clickable"];
    }

    // Preserve the accessible property if it exists
    if ((node as any).accessible !== undefined) {
      converted.accessible = (node as any).accessible;
    }

    // Convert bounds from object format to string format to match XML parser output
    if (node.bounds) {
      converted.bounds = `[${node.bounds.left},${node.bounds.top}][${node.bounds.right},${node.bounds.bottom}]`;
    }

    // Convert child nodes recursively
    if (node.node) {
      converted.node = this.convertAccessibilityNode(node.node);
    }

    return converted;
  }

  /**
     * Get view hierarchy from accessibility service
     * This is the main entry point for getting hierarchy data from the accessibility service
   * @param queryOptions - Options to filter the view hierarchy
   * @param perf - Performance tracker for timing
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
     * @returns Promise<ViewHierarchyResult | null> - The hierarchy or null if service unavailable
     */
  async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: IPerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();

    perf.serial("a11yService");

    try {
      // Check if service is available
      const available = await perf.track("checkAvailable", () =>
        AccessibilityServiceManager.getInstance(this.device, this.adb).isAvailable()
      );
      if (!available) {
        logger.info("[ACCESSIBILITY_SERVICE] Service not available, will use fallback");
        perf.end();
        return null;
      }

      // Get hierarchy from WebSocket service (wait for fresh data on first request, unless skipped)
      const waitForFresh = !skipWaitForFresh && (this.cachedHierarchy === null || !this.cachedHierarchy.fresh);
      const response = await perf.track("getHierarchy", () =>
        this.getLatestHierarchy(waitForFresh, 100, perf, skipWaitForFresh, minTimestamp)
      );

      let hierarchyData = response.hierarchy;
      let isFresh = response.fresh;

      // If no hierarchy from WebSocket or data is stale, sync to get fresh data
      // observe should always return the current screen state
      const needsSync = !hierarchyData || !isFresh;
      if (needsSync) {
        logger.info(`[ACCESSIBILITY_SERVICE] WebSocket returned ${hierarchyData ? "stale" : "no"} data (fresh=${isFresh}), syncing for fresh data`);

        const syncHierarchy = await perf.track("syncRequest", () =>
          this.requestHierarchySync(perf)
        );

        if (syncHierarchy) {
          hierarchyData = syncHierarchy;
          isFresh = true;
          logger.info("[ACCESSIBILITY_SERVICE] Successfully retrieved hierarchy via sync ADB method");
        } else if (!hierarchyData) {
          // Both WebSocket and sync failed with no data at all
          logger.warn("[ACCESSIBILITY_SERVICE] Both WebSocket and sync methods failed, will use fallback");
          perf.end();
          return null;
        }
        // If sync failed but we have stale data from WebSocket, use that
      }

      // Convert to expected format
      const convertedHierarchy = await perf.track("convert", () =>
        Promise.resolve(this.convertToViewHierarchyResult(hierarchyData!))
      );

      // Add the device timestamp to the result
      if (hierarchyData!.updatedAt) {
        convertedHierarchy.updatedAt = hierarchyData!.updatedAt;
      }

      perf.end();

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Successfully retrieved and converted hierarchy in ${duration}ms (fresh: ${isFresh}, updatedAt: ${hierarchyData!.updatedAt})`);

      return convertedHierarchy;
    } catch (error) {
      perf.end();
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] getAccessibilityHierarchy failed after ${duration}ms: ${error}`);
      return null;
    }
  }

  /**
   * Send a message via WebSocket to request hierarchy extraction
   * @returns true if message was sent successfully
   */
  private sendHierarchyRequest(): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send request - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const message = JSON.stringify({ type: "request_hierarchy", requestId });
      this.ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent hierarchy request via WebSocket (requestId: ${requestId})`);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send WebSocket request: ${error}`);
      return false;
    }
  }

  /**
   * Request hierarchy synchronously via WebSocket message
   * Triggers extraction on device which pushes result via WebSocket
   * Falls back to ADB broadcast if WebSocket send fails
   * @param perf - Performance tracker for timing
   * @returns Promise<AccessibilityHierarchy | null>
   */
  async requestHierarchySync(
    perf: IPerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<AccessibilityHierarchy | null> {
    const startTime = Date.now();

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Requesting hierarchy sync via WebSocket");

      // Try WebSocket request first (faster path)
      const sentViaWebSocket = await perf.track("sendWsRequest", async () => {
        return this.sendHierarchyRequest();
      });

      // Fall back to ADB broadcast if WebSocket failed
      if (!sentViaWebSocket) {
        logger.info("[ACCESSIBILITY_SERVICE] Falling back to ADB broadcast");
        const uuid = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        await perf.track("sendBroadcast", async () => {
          await this.adb.executeCommand(
            `shell "am broadcast -a dev.jasonpearson.automobile.EXTRACT_HIERARCHY --es uuid ${uuid}"`
          );
        });
      }

      // Wait for WebSocket push (triggered by either method)
      // The Android service calls broadcastHierarchyUpdate() after extraction
      // Use 10 second timeout to handle long animations (switch toggles can trigger 10+ concurrent extractions)
      const freshData = await perf.track("waitForPush", () =>
        this.waitForFreshData(10000, startTime)
      );

      if (freshData) {
        const duration = Date.now() - startTime;
        logger.debug(`[ACCESSIBILITY_SERVICE] Sync complete: ${duration}ms (updatedAt: ${freshData.hierarchy.updatedAt})`);
        return freshData.hierarchy;
      }

      logger.warn("[ACCESSIBILITY_SERVICE] Timeout waiting for WebSocket push after request");
      return null;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Sync hierarchy request failed after ${duration}ms: ${error}`);
      return null;
    }
  }

  /**
   * Close WebSocket connection and cleanup
   */
  async close(): Promise<void> {
    try {
      if (this.ws) {
        logger.info("[ACCESSIBILITY_SERVICE] Closing WebSocket connection");
        this.ws.close();
        this.ws = null;
      }

      // Optionally remove port forwarding
      if (this.portForwardingSetup) {
        await this.adb.executeCommand(`forward --remove tcp:${AccessibilityServiceClient.WEBSOCKET_PORT}`).catch(() => {
          // Ignore errors
        });
        this.portForwardingSetup = false;
      }
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error during cleanup: ${error}`);
    }
  }

  /**
   * Request a screenshot from the accessibility service
   * @param timeoutMs - Maximum time to wait for screenshot in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<ScreenshotResult> - The screenshot result
   */
  async requestScreenshot(
    timeoutMs: number = 5000,
    perf: IPerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for screenshot");
        return {
          success: false,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send screenshot request
      const requestId = `screenshot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.pendingScreenshotRequestId = requestId;

      // Create promise that will be resolved when we receive the screenshot
      const screenshotPromise = new Promise<ScreenshotResult>(resolve => {
        this.pendingScreenshotResolve = resolve;

        // Set up timeout
        setTimeout(() => {
          if (this.pendingScreenshotResolve === resolve) {
            this.pendingScreenshotResolve = null;
            this.pendingScreenshotRequestId = null;
            resolve({
              success: false,
              error: `Screenshot timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "request_screenshot", requestId });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent screenshot request (requestId: ${requestId})`);
      });

      // Wait for response
      const result = await perf.track("waitForScreenshot", () => screenshotPromise);

      const duration = Date.now() - startTime;
      if (result.success) {
        const dataSize = result.data ? result.data.length : 0;
        logger.info(`[ACCESSIBILITY_SERVICE] Screenshot received in ${duration}ms (${dataSize} base64 chars)`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Screenshot failed after ${duration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Screenshot request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        error: `${error}`
      };
    }
  }
}
