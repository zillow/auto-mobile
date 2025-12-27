import WebSocket from "ws";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice, ViewHierarchyResult } from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { AccessibilityServiceManager } from "../../utils/accessibilityServiceManager";

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
  timestamp: number;
  packageName: string;
  hierarchy: AccessibilityNode;
}

/**
 * Interface for WebSocket message from accessibility service
 */
interface WebSocketMessage {
  type: string;
  timestamp?: number;
  data?: AccessibilityHierarchy;
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
 */
export class AccessibilityServiceClient {
  private device: BootedDevice;
  private adb: AdbUtils;
  private static readonly PACKAGE_NAME = "dev.jasonpearson.automobile.accessibilityservice";
  private static readonly WEBSOCKET_PORT = 8765;
  private static readonly WEBSOCKET_URL = `ws://localhost:${AccessibilityServiceClient.WEBSOCKET_PORT}/ws`;

  private ws: WebSocket | null = null;
  private cachedHierarchy: CachedHierarchy | null = null;
  private isConnecting: boolean = false;
  private connectionAttempts: number = 0;
  private readonly maxConnectionAttempts: number = 3;
  private portForwardingSetup: boolean = false;

  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    AccessibilityServiceManager.getInstance(device, adb);
  }

  /**
   * Setup ADB port forwarding for WebSocket connection
   */
  private async setupPortForwarding(): Promise<void> {
    if (this.portForwardingSetup) {
      return;
    }

    try {
      logger.info(`[ACCESSIBILITY_SERVICE] Setting up port forwarding for WebSocket: localhost:${AccessibilityServiceClient.WEBSOCKET_PORT} → device:${AccessibilityServiceClient.WEBSOCKET_PORT}`);

      // Clear any existing forwarding for this port
      await this.adb.executeCommand(`forward --remove tcp:${AccessibilityServiceClient.WEBSOCKET_PORT}`).catch(() => {
        // Ignore errors if no forwarding exists
      });

      // Setup new forwarding
      await this.adb.executeCommand(`forward tcp:${AccessibilityServiceClient.WEBSOCKET_PORT} tcp:${AccessibilityServiceClient.WEBSOCKET_PORT}`);

      this.portForwardingSetup = true;
      logger.info("[ACCESSIBILITY_SERVICE] Port forwarding setup complete");
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to setup port forwarding: ${error}`);
      throw error;
    }
  }

  /**
   * Connect to the WebSocket server
   */
  private async connectWebSocket(): Promise<boolean> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return true;
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

    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Max connection attempts (${this.maxConnectionAttempts}) reached`);
      return false;
    }

    this.isConnecting = true;
    this.connectionAttempts++;

    try {
      // Ensure port forwarding is setup
      await this.setupPortForwarding();

      logger.info(`[ACCESSIBILITY_SERVICE] Connecting to WebSocket at ${AccessibilityServiceClient.WEBSOCKET_URL} (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);

      return await new Promise((resolve, reject) => {
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
        });
      });
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
        logger.debug(`[ACCESSIBILITY_SERVICE] Received hierarchy update (timestamp: ${message.data.timestamp})`);

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

        logger.debug(`[ACCESSIBILITY_SERVICE] Cached fresh hierarchy (updatedAt: ${message.data.timestamp})`);
      }
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error handling WebSocket message: ${error}`);
    }
  }

  /**
   * Get the latest hierarchy from cache or wait for fresh data
   * @param waitForFresh - If true, wait up to timeout for fresh data
   * @param timeout - Maximum time to wait for fresh data in milliseconds
   * @returns Promise<AccessibilityHierarchyResponse>
   */
  async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 1000
  ): Promise<AccessibilityHierarchyResponse> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await this.connectWebSocket();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection");
        return {
          hierarchy: null,
          fresh: false
          // updatedAt not included - no device data available
        };
      }

      // If we have cached data and not waiting for fresh, return immediately
      if (this.cachedHierarchy && !waitForFresh) {
        const duration = Date.now() - startTime;
        logger.info(`[ACCESSIBILITY_SERVICE] Returning cached hierarchy in ${duration}ms (fresh: ${this.cachedHierarchy.fresh}, updatedAt: ${this.cachedHierarchy.hierarchy.timestamp})`);

        return {
          hierarchy: this.cachedHierarchy.hierarchy,
          fresh: this.cachedHierarchy.fresh,
          updatedAt: this.cachedHierarchy.hierarchy.timestamp
        };
      }

      // Wait for fresh data if requested
      if (waitForFresh) {
        logger.debug(`[ACCESSIBILITY_SERVICE] Waiting up to ${timeout}ms for fresh hierarchy data`);

        // Mark current cache as stale to detect new data
        if (this.cachedHierarchy) {
          this.cachedHierarchy.fresh = false;
        }

        const freshData = await this.waitForFreshData(timeout);
        const duration = Date.now() - startTime;

        if (freshData) {
          logger.info(`[ACCESSIBILITY_SERVICE] Received fresh hierarchy in ${duration}ms (updatedAt: ${freshData.hierarchy.timestamp})`);
          return {
            hierarchy: freshData.hierarchy,
            fresh: true,
            updatedAt: freshData.hierarchy.timestamp
          };
        } else {
          logger.warn(`[ACCESSIBILITY_SERVICE] Timeout waiting for fresh data after ${duration}ms`);

          // Return cached data if available, even if stale
          if (this.cachedHierarchy) {
            return {
              hierarchy: this.cachedHierarchy.hierarchy,
              fresh: false,
              updatedAt: this.cachedHierarchy.hierarchy.timestamp
            };
          }
        }
      }

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
   */
  private async waitForFreshData(timeout: number): Promise<CachedHierarchy | null> {
    return new Promise(resolve => {
      const startTime = Date.now();
      const checkInterval = 50; // Check every 50ms

      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // Check if we received fresh data
        if (this.cachedHierarchy && this.cachedHierarchy.fresh) {
          clearInterval(intervalId);
          resolve(this.cachedHierarchy);
          return;
        }

        // Check if timeout exceeded
        if (elapsed >= timeout) {
          clearInterval(intervalId);
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
        hierarchy: convertedHierarchy
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
     * @returns Promise<ViewHierarchyResult | null> - The hierarchy or null if service unavailable
     */
  async getAccessibilityHierarchy(queryOptions?: ViewHierarchyQueryOptions): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();

    try {
      // Check if service is available
      const available = await AccessibilityServiceManager.getInstance(this.device, this.adb).isAvailable();
      if (!available) {
        logger.info("[ACCESSIBILITY_SERVICE] Service not available, will use fallback");
        return null;
      }

      // Get hierarchy from WebSocket service (wait for fresh data on first request)
      const waitForFresh = this.cachedHierarchy === null;
      const response = await this.getLatestHierarchy(waitForFresh, 1000);

      if (!response.hierarchy) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to get hierarchy from service, will use fallback");
        return null;
      }

      // Convert to expected format
      const convertedHierarchy = this.convertToViewHierarchyResult(response.hierarchy);

      const duration = Date.now() - startTime;
      logger.info(`[ACCESSIBILITY_SERVICE] Successfully retrieved and converted hierarchy in ${duration}ms (fresh: ${response.fresh}, updatedAt: ${response.updatedAt})`);

      return convertedHierarchy;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] getAccessibilityHierarchy failed after ${duration}ms: ${error}`);
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
}
