import WebSocket from "ws";
import { logger } from "../../utils/logger";
import {
  BootedDevice,
  ViewHierarchyResult,
  ViewHierarchyWindowInfo
} from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { RequestManager } from "../../utils/RequestManager";
import { PortManager } from "../../utils/PortManager";
import { shouldUseHostControl, getHostControlHost } from "../../utils/hostControlClient";
import { isRunningInDocker } from "../../utils/dockerEnv";
import { NavigationGraphManager } from "../navigation/NavigationGraphManager";
import {
  HierarchyNavigationDetector,
  HierarchyNavigationUpdateMetrics
} from "../navigation/HierarchyNavigationDetector";
import { AccessibilityHierarchy } from "../navigation/ScreenFingerprint";

/**
 * Interface for iOS accessibility node format (matching Android format)
 */
export interface XCTestNode {
  text?: string;
  textSize?: number;
  contentDesc?: string;
  resourceId?: string;
  className?: string;
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
  accessibilityFocused?: string;
  scrollable?: string;
  password?: string;
  checkable?: string;
  checked?: string;
  selected?: string;
  longClickable?: string;
  testTag?: string;
  role?: string;
  stateDescription?: string;
  errorMessage?: string;
  hintText?: string;
  actions?: string[];
  node?: XCTestNode | XCTestNode[];
}

/**
 * Interface for iOS view hierarchy (matching Android format)
 */
export interface XCTestHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: XCTestNode;
  windows?: ViewHierarchyWindowInfo[];
  error?: string;
}

/**
 * Interface for WebSocket message from XCTestService
 */
interface WebSocketMessage {
  type: string;
  timestamp?: number;
  requestId?: string;
  data?: XCTestHierarchy;
  format?: string;
  success?: boolean;
  totalTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming | XCTestPerfTiming[];
}

/**
 * Interface for iOS-side performance timing data - hierarchical format matching Android
 */
export interface XCTestPerfTiming {
  name: string;
  durationMs: number;
  children?: XCTestPerfTiming[];
}

/**
 * Interface for screenshot result
 */
export interface XCTestScreenshotResult {
  success: boolean;
  data?: string; // Base64 encoded PNG
  format?: string;
  timestamp?: number;
  error?: string;
}

/**
 * Interface for swipe result from XCTestService
 */
export interface XCTestSwipeResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for tap coordinates result
 */
export interface XCTestTapResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for drag result from XCTestService
 */
export interface XCTestDragResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for pinch result from XCTestService
 */
export interface XCTestPinchResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for set text result from XCTestService
 */
export interface XCTestSetTextResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for IME action result from XCTestService
 */
export interface XCTestImeActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for select all result from XCTestService
 */
export interface XCTestSelectAllResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for press home result from XCTestService
 */
export interface XCTestPressHomeResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for action result from XCTestService
 */
export interface XCTestActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for cached hierarchy with metadata
 */
interface CachedHierarchy {
  hierarchy: XCTestHierarchy;
  receivedAt: number;
  fresh: boolean;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for hierarchy response with freshness indicator
 */
export interface XCTestHierarchyResponse {
  hierarchy: XCTestHierarchy | null;
  fresh: boolean;
  updatedAt?: number;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for XCTestService providing iOS UI hierarchy and interaction capabilities
 * via WebSocket connection to iOS XCTestService
 */
export interface XCTestService {
  getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    disableAllFiltering?: boolean
  ): Promise<ViewHierarchyResult | null>;

  getLatestHierarchy(
    waitForFresh?: boolean,
    timeout?: number,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number
  ): Promise<XCTestHierarchyResponse>;

  requestHierarchySync(
    perf?: PerformanceTracker,
    disableAllFiltering?: boolean,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<{ hierarchy: XCTestHierarchy; perfTiming?: XCTestPerfTiming } | null>;

  convertToViewHierarchyResult(hierarchy: XCTestHierarchy): ViewHierarchyResult;

  requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestSwipeResult>;

  requestTapCoordinates(
    x: number,
    y: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestTapResult>;

  requestDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pressDurationMs: number,
    dragDurationMs: number,
    holdDurationMs: number,
    timeoutMs: number
  ): Promise<XCTestDragResult>;

  requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestPinchResult>;

  requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult>;

  requestClearText(
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult>;

  requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestImeActionResult>;

  requestSelectAll(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestSelectAllResult>;

  requestPressHome(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestPressHomeResult>;

  requestScreenshot(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<XCTestScreenshotResult>;

  ensureConnected(perf?: PerformanceTracker): Promise<boolean>;
  isConnected(): boolean;
  waitForConnection(maxAttempts?: number, delayMs?: number): Promise<boolean>;
  verifyServiceReady(maxAttempts?: number, delayMs?: number, timeoutMs?: number): Promise<boolean>;
  hasCachedHierarchy(): boolean;
  invalidateCache(): void;
  close(): Promise<void>;

  /**
   * Register a callback to be notified when push updates arrive from iOS.
   * Returns a function to unregister the callback.
   */
  onPushUpdate(callback: (hierarchy: XCTestHierarchy) => void): () => void;
}

/**
 * Factory type for creating WebSocket instances (for testing)
 */
export type WebSocketFactory = (url: string) => WebSocket;

/**
 * Default WebSocket factory
 */
const defaultWebSocketFactory: WebSocketFactory = (url: string) => new WebSocket(url);

/**
 * XCTestServiceClient - WebSocket client for iOS XCTestService
 * Provides iOS UI hierarchy and interaction capabilities matching Android AccessibilityServiceClient
 */
export class XCTestServiceClient implements XCTestService {
  private static instances: Map<string, XCTestServiceClient> = new Map();

  // Default port matches XCTestService on iOS
  public static readonly DEFAULT_PORT = 8765;

  // Connection state
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private connectionAttempts: number = 0;
  private lastConnectionAttempt: number = 0;
  private static readonly CONNECTION_ATTEMPT_RESET_MS = 10000;
  private static readonly MAX_CONNECTION_ATTEMPTS = 3;

  // Hierarchy caching
  private cachedHierarchy: CachedHierarchy | null = null;
  private static readonly CACHE_FRESH_TTL_MS = 500;
  private hierarchyNavigationDetector: HierarchyNavigationDetector | null = null;

  // Push update callbacks
  private onPushUpdateCallbacks: Set<(hierarchy: XCTestHierarchy) => void> = new Set();

  // Auto-reconnect
  private autoReconnectEnabled: boolean = true;
  private reconnectTimeoutId: ReturnType<Timer["setTimeout"]> | null = null;
  private static readonly RECONNECT_DELAY_MS = 2000;

  // Health check
  private healthCheckIntervalId: ReturnType<Timer["setInterval"]> | null = null;
  private static readonly HEALTH_CHECK_INTERVAL_MS = 30000;

  // Request management
  private requestManager: RequestManager;

  // Dependencies
  private readonly device: BootedDevice;
  private readonly port: number;
  private readonly timer: Timer;
  private readonly wsFactory: WebSocketFactory;

  private constructor(
    device: BootedDevice,
    port: number = XCTestServiceClient.DEFAULT_PORT,
    wsFactory: WebSocketFactory = defaultWebSocketFactory,
    timer: Timer = defaultTimer
  ) {
    this.device = device;
    this.port = port;
    this.wsFactory = wsFactory;
    this.timer = timer;
    this.requestManager = new RequestManager(timer);
  }

  /**
   * Get singleton instance for a device
   */
  public static getInstance(
    device: BootedDevice,
    port?: number
  ): XCTestServiceClient {
    const resolvedPort = port ?? (
      device.platform === "ios" ? PortManager.allocate(device.deviceId) : XCTestServiceClient.DEFAULT_PORT
    );
    const key = `${device.deviceId}:${resolvedPort}`;
    if (!XCTestServiceClient.instances.has(key)) {
      XCTestServiceClient.instances.set(key, new XCTestServiceClient(device, resolvedPort));
    }
    return XCTestServiceClient.instances.get(key)!;
  }

  /**
   * Create instance for testing with injected dependencies
   */
  public static createForTesting(
    device: BootedDevice,
    port: number,
    wsFactory: WebSocketFactory,
    timer: Timer
  ): XCTestServiceClient {
    return new XCTestServiceClient(device, port, wsFactory, timer);
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    for (const instance of XCTestServiceClient.instances.values()) {
      void instance.close();
    }
    XCTestServiceClient.instances.clear();
  }

  // MARK: - Connection Management

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async ensureConnected(perf?: PerformanceTracker): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    return this.connectWebSocket(perf ?? new NoOpPerformanceTracker());
  }

  private resolveWebSocketHost(): string {
    if (shouldUseHostControl() && isRunningInDocker()) {
      return getHostControlHost();
    }
    return "localhost";
  }

  private async connectWebSocket(perf: PerformanceTracker): Promise<boolean> {
    if (this.isConnecting) {
      // Wait for current connection attempt
      await this.timer.sleep(100);
      return this.isConnected();
    }

    // Reset connection attempts if enough time has passed
    const now = this.timer.now();
    if (now - this.lastConnectionAttempt > XCTestServiceClient.CONNECTION_ATTEMPT_RESET_MS) {
      this.connectionAttempts = 0;
    }

    if (this.connectionAttempts >= XCTestServiceClient.MAX_CONNECTION_ATTEMPTS) {
      logger.warn(`[XCTestServiceClient] Max connection attempts (${XCTestServiceClient.MAX_CONNECTION_ATTEMPTS}) reached`);
      return false;
    }

    this.isConnecting = true;
    this.lastConnectionAttempt = now;
    this.connectionAttempts++;

    try {
      // For iOS simulator, we connect directly to localhost
      // TODO: For real devices, may need port forwarding via iproxy
      const wsHost = this.resolveWebSocketHost();
      const wsUrl = `ws://${wsHost}:${this.port}/ws`;
      logger.info(`[XCTestServiceClient] Connecting to ${wsUrl}`);

      return await new Promise<boolean>(resolve => {
        const ws = this.wsFactory(wsUrl);
        let resolved = false;

        const connectionTimeout = this.timer.setTimeout(() => {
          if (!resolved) {
            resolved = true;
            ws.close();
            logger.warn(`[XCTestServiceClient] Connection timeout`);
            resolve(false);
          }
        }, 5000);

        ws.on("open", () => {
          if (resolved) {return;}
          resolved = true;
          this.timer.clearTimeout(connectionTimeout);
          this.ws = ws;
          this.setupMessageHandler(ws);
          this.startHealthCheck();
          logger.info(`[XCTestServiceClient] Connected to ${wsUrl}`);
          resolve(true);
        });

        ws.on("error", error => {
          if (!resolved) {
            resolved = true;
            this.timer.clearTimeout(connectionTimeout);
            logger.warn(`[XCTestServiceClient] Connection error: ${error.message}`);
            resolve(false);
          }
        });

        ws.on("close", () => {
          if (!resolved) {
            resolved = true;
            this.timer.clearTimeout(connectionTimeout);
            resolve(false);
          }
          this.handleDisconnect();
        });
      });
    } finally {
      this.isConnecting = false;
    }
  }

  private setupMessageHandler(ws: WebSocket): void {
    ws.on("message", data => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(message);
      } catch (error) {
        logger.warn(`[XCTestServiceClient] Failed to parse message: ${error}`);
      }
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    const { type, requestId } = message;

    // Handle push messages (no requestId)
    if (type === "connected") {
      logger.info(`[XCTestServiceClient] Received connected message`);
      return;
    }

    if (type === "hierarchy_update" && message.data) {
      this.handleHierarchyUpdateForNavigation(message.data, message.perfTiming);
    }

    // Handle request/response messages (with requestId) first
    if (requestId) {
      // Build result based on message type
      let result: unknown;

      switch (type) {
        case "hierarchy_update":
          result = {
            hierarchy: message.data,
            perfTiming: message.perfTiming
          };
          break;

        case "screenshot":
          result = {
            success: true,
            data: message.data,
            format: message.format ?? "png",
            timestamp: message.timestamp
          };
          break;

        case "tap_coordinates_result":
        case "swipe_result":
        case "drag_result":
        case "pinch_result":
        case "set_text_result":
        case "select_all_result":
        case "press_home_result":
          result = {
            success: message.success ?? true,
            totalTimeMs: message.totalTimeMs ?? 0,
            error: message.error,
            perfTiming: message.perfTiming
          };
          break;

        case "ime_action_result":
        case "action_result":
          result = {
            success: message.success ?? true,
            action: (message as { action?: string }).action,
            totalTimeMs: message.totalTimeMs ?? 0,
            error: message.error,
            perfTiming: message.perfTiming
          };
          break;

        default:
          // Handle error responses
          if (message.error) {
            result = {
              success: false,
              totalTimeMs: message.totalTimeMs ?? 0,
              error: message.error
            };
          } else {
            result = message;
          }
      }

      this.requestManager.resolve(requestId, result);
      return;
    }

    // Handle push messages (no requestId)
    if (type === "hierarchy_update" && message.data) {
      // Push update from server
      const now = this.timer.now();
      this.cachedHierarchy = {
        hierarchy: message.data,
        receivedAt: now,
        fresh: true,
        perfTiming: message.perfTiming
      };
      logger.info(`[XCTestServiceClient] Received hierarchy push update - UI changed`);

      // Notify listeners (e.g., ObserveScreen to clear its cache)
      this.notifyPushUpdateListeners(message.data);
      return;
    }
  }

  private handleDisconnect(): void {
    this.ws = null;
    this.stopHealthCheck();

    if (this.autoReconnectEnabled) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) {
      return;
    }

    this.reconnectTimeoutId = this.timer.setTimeout(() => {
      this.reconnectTimeoutId = null;
      void this.connectWebSocket(new NoOpPerformanceTracker());
    }, XCTestServiceClient.RECONNECT_DELAY_MS);
  }

  private startHealthCheck(): void {
    if (this.healthCheckIntervalId) {
      return;
    }

    this.healthCheckIntervalId = this.timer.setInterval(() => {
      if (!this.isConnected()) {
        void this.connectWebSocket(new NoOpPerformanceTracker());
      }
    }, XCTestServiceClient.HEALTH_CHECK_INTERVAL_MS);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckIntervalId) {
      this.timer.clearInterval(this.healthCheckIntervalId);
      this.healthCheckIntervalId = null;
    }
  }

  public async close(): Promise<void> {
    this.autoReconnectEnabled = false;
    this.stopHealthCheck();

    if (this.reconnectTimeoutId) {
      this.timer.clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.requestManager.cancelAll(new Error("Client closed"));

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.cachedHierarchy = null;

    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.dispose();
      this.hierarchyNavigationDetector = null;
    }
  }

  public getHierarchyNavigationDetector(): HierarchyNavigationDetector {
    if (!this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector = new HierarchyNavigationDetector(
        NavigationGraphManager.getInstance(),
        { timer: this.timer }
      );
    }
    return this.hierarchyNavigationDetector;
  }

  public resetHierarchyNavigationDetector(): void {
    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.reset();
    }
  }

  public async waitForConnection(maxAttempts: number = 3, delayMs: number = 1000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.ensureConnected()) {
        return true;
      }
      await this.timer.sleep(delayMs);
    }
    return false;
  }

  public async verifyServiceReady(
    maxAttempts: number = 3,
    delayMs: number = 1000,
    timeoutMs: number = 5000
  ): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (!await this.ensureConnected()) {
        await this.timer.sleep(delayMs);
        continue;
      }

      // Try to get hierarchy to verify service is working
      try {
        const result = await this.requestHierarchySync(undefined, false, undefined, timeoutMs);
        if (result?.hierarchy) {
          return true;
        }
      } catch {
        // Continue retrying
      }

      await this.timer.sleep(delayMs);
    }
    return false;
  }

  // MARK: - Hierarchy

  public hasCachedHierarchy(): boolean {
    return this.cachedHierarchy !== null;
  }

  public invalidateCache(): void {
    if (this.cachedHierarchy) {
      this.cachedHierarchy.fresh = false;
    }
  }

  /**
   * Register a callback to be notified when push updates arrive from iOS.
   * This allows higher-level caches to be invalidated when the UI changes.
   */
  public onPushUpdate(callback: (hierarchy: XCTestHierarchy) => void): () => void {
    this.onPushUpdateCallbacks.add(callback);
    return () => {
      this.onPushUpdateCallbacks.delete(callback);
    };
  }

  /**
   * Notify all registered callbacks about a push update
   */
  private notifyPushUpdateListeners(hierarchy: XCTestHierarchy): void {
    for (const callback of this.onPushUpdateCallbacks) {
      try {
        callback(hierarchy);
      } catch (error) {
        logger.warn(`[XCTestServiceClient] Push update callback error: ${error}`);
      }
    }
  }

  public async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    disableAllFiltering?: boolean
  ): Promise<ViewHierarchyResult | null> {
    const response = await this.getLatestHierarchy(
      !skipWaitForFresh,
      15000, // Increased from 2000ms - XCUITest hierarchy extraction is slow
      perf,
      skipWaitForFresh,
      minTimestamp
    );

    if (!response.hierarchy) {
      return null;
    }

    return this.convertToViewHierarchyResult(response.hierarchy);
  }

  private handleHierarchyUpdateForNavigation(
    hierarchy: XCTestHierarchy,
    perfTiming?: XCTestPerfTiming | XCTestPerfTiming[]
  ): void {
    if (!hierarchy.hierarchy) {
      logger.warn("[XCTestServiceClient] Skipping navigation detection: hierarchy missing in update");
      return;
    }

    if (hierarchy.error) {
      logger.warn(`[XCTestServiceClient] Skipping navigation detection due to hierarchy error: ${hierarchy.error}`);
      return;
    }

    const conversionStart = this.timer.now();
    const convertedHierarchy = this.convertHierarchyForNavigation(hierarchy);
    const conversionMs = this.timer.now() - conversionStart;

    const metrics: HierarchyNavigationUpdateMetrics = {
      source: "ios",
      conversionMs,
      externalTiming: perfTiming
    };

    this.getHierarchyNavigationDetector().onHierarchyUpdate(convertedHierarchy, metrics);
  }

  private convertHierarchyForNavigation(hierarchy: XCTestHierarchy): AccessibilityHierarchy {
    return {
      updatedAt: hierarchy.updatedAt,
      packageName: hierarchy.packageName,
      hierarchy: this.convertNodeForNavigation(hierarchy.hierarchy) as AccessibilityHierarchy["hierarchy"],
    };
  }

  private convertNodeForNavigation(
    node: XCTestNode | XCTestNode[]
  ): Record<string, any> | Record<string, any>[] {
    if (Array.isArray(node)) {
      return node.map(child => this.convertNodeForNavigation(child));
    }

    const converted: Record<string, any> = {};

    const contentDesc = this.readNodeField<string>(node, "contentDesc", "content-desc");
    const resourceId = this.readNodeField<string>(node, "resourceId", "resource-id");
    const testTag = this.readNodeField<string>(node, "testTag", "test-tag");

    if (node.text) {
      converted.text = node.text;
    }
    if (contentDesc) {
      converted["content-desc"] = contentDesc;
    }
    if (resourceId) {
      converted["resource-id"] = resourceId;
    }
    if (testTag) {
      converted["test-tag"] = testTag;
    }
    if (node.className) {
      converted.className = node.className;
    }
    if (node.scrollable) {
      converted.scrollable = node.scrollable;
    }
    if (node.selected) {
      converted.selected = node.selected;
    }

    if (node.node) {
      converted.node = this.convertNodeForNavigation(node.node);
    }

    return converted;
  }

  public async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 15000, // Increased from 2000ms - XCUITest hierarchy extraction is slow
    perf?: PerformanceTracker,
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<XCTestHierarchyResponse> {
    // Check cache first
    if (this.cachedHierarchy) {
      const cacheAge = this.timer.now() - this.cachedHierarchy.receivedAt;
      const isFresh = cacheAge < XCTestServiceClient.CACHE_FRESH_TTL_MS;
      const meetsMinTimestamp = minTimestamp === 0 || this.cachedHierarchy.hierarchy.updatedAt >= minTimestamp;

      if (isFresh && meetsMinTimestamp) {
        return {
          hierarchy: this.cachedHierarchy.hierarchy,
          fresh: true,
          updatedAt: this.cachedHierarchy.hierarchy.updatedAt,
          perfTiming: this.cachedHierarchy.perfTiming
        };
      }
    }

    // Need fresh data
    if (!skipWaitForFresh) {
      const result = await this.requestHierarchySync(perf, false, undefined, timeout);
      if (result) {
        return {
          hierarchy: result.hierarchy,
          fresh: true,
          updatedAt: result.hierarchy.updatedAt,
          perfTiming: result.perfTiming
        };
      }
    }

    // Return cached (stale) data if available
    if (this.cachedHierarchy) {
      return {
        hierarchy: this.cachedHierarchy.hierarchy,
        fresh: false,
        updatedAt: this.cachedHierarchy.hierarchy.updatedAt,
        perfTiming: this.cachedHierarchy.perfTiming
      };
    }

    return { hierarchy: null, fresh: false };
  }

  public async requestHierarchySync(
    perf?: PerformanceTracker,
    disableAllFiltering?: boolean,
    signal?: AbortSignal,
    timeoutMs: number = 5000
  ): Promise<{ hierarchy: XCTestHierarchy; perfTiming?: XCTestPerfTiming } | null> {
    if (!await this.ensureConnected(perf)) {
      return null;
    }

    const requestId = this.requestManager.generateId("hierarchy");
    const promise = this.requestManager.register<{ hierarchy?: XCTestHierarchy; perfTiming?: XCTestPerfTiming }>(
      requestId,
      "hierarchy",
      timeoutMs,
      () => ({ hierarchy: undefined, perfTiming: undefined })
    );

    const message = {
      type: disableAllFiltering ? "request_hierarchy" : "request_hierarchy_if_stale",
      requestId
    };

    this.ws?.send(JSON.stringify(message));

    const result = await promise;

    if (result.hierarchy) {
      // Update cache
      this.cachedHierarchy = {
        hierarchy: result.hierarchy,
        receivedAt: this.timer.now(),
        fresh: true,
        perfTiming: result.perfTiming
      };

      return {
        hierarchy: result.hierarchy,
        perfTiming: result.perfTiming
      };
    }

    return null;
  }

  public convertToViewHierarchyResult(hierarchy: XCTestHierarchy): ViewHierarchyResult {
    // Convert to Android-compatible format
    const convertedNode = this.convertNode(hierarchy.hierarchy);

    // Apply filtering to reduce hierarchy size (similar to Android's optimizeHierarchy)
    const filteredNode = this.filterHierarchyNode(convertedNode, true);

    return {
      hierarchy: {
        node: filteredNode
      },
      packageName: hierarchy.packageName,
      updatedAt: hierarchy.updatedAt,
      windows: hierarchy.windows
    };
  }

  /**
   * Check if a node has meaningful content (text, identifier, test-tag)
   */
  private hasContentProperties(attrs: Record<string, string>): boolean {
    return Boolean(
      (attrs["text"] && attrs["text"] !== "") ||
      (attrs["resource-id"] && attrs["resource-id"] !== "") ||
      (attrs["content-desc"] && attrs["content-desc"] !== "") ||
      (attrs["test-tag"] && attrs["test-tag"] !== "")
    );
  }

  /**
   * Check if a node has meaningful interaction properties
   * Note: iOS marks many containers as clickable, so we're more selective here
   */
  private hasInteractionProperties(attrs: Record<string, string>): boolean {
    return Boolean(
      attrs["scrollable"] === "true" ||
      attrs["focused"] === "true" ||
      attrs["selected"] === "true" ||
      attrs["checked"] === "true"
    );
  }

  /**
   * Check if a node is a structural wrapper (UIView with no meaningful properties)
   */
  private isStructuralWrapper(attrs: Record<string, string>, hasChildren: boolean): boolean {
    const className = attrs["class"] || "";
    const isContainerClass = className === "UIView" || className === "UIImageView";

    // Not a wrapper if it has content or is focused/selected/scrollable
    if (this.hasContentProperties(attrs) || this.hasInteractionProperties(attrs)) {
      return false;
    }

    // Container classes without content are wrappers if they have children
    // UIImageView without text is decorative and can be collapsed
    return isContainerClass && hasChildren;
  }

  /**
   * Clean node attributes by removing false booleans and empty values
   */
  private cleanAttributes(attrs: Record<string, string>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    const booleanFields = ["clickable", "enabled", "focusable", "focused", "scrollable",
      "password", "checkable", "checked", "selected", "long-clickable"];

    for (const [key, value] of Object.entries(attrs)) {
      // Skip empty values
      if (value === "" || value === null || value === undefined) {
        continue;
      }

      // Skip false boolean values
      if (booleanFields.includes(key) && value === "false") {
        continue;
      }

      // Skip enabled=true (it's the default)
      if (key === "enabled" && value === "true") {
        continue;
      }

      cleaned[key] = value;
    }

    return cleaned;
  }

  /**
   * Filter hierarchy node - removes structural wrappers and nodes without meaningful properties
   * Similar to Android's optimizeHierarchy + filterViewHierarchy
   */
  private filterHierarchyNode(
    node: { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> },
    isRoot: boolean = false
  ): { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> } | null {
    const attrs = node.$ || {};
    const children = node.node || [];

    // Process children first (recursively)
    const filteredChildren: Array<{ $: Record<string, string> }> = [];
    for (const child of children) {
      const filtered = this.filterHierarchyNode(child as { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> });
      if (filtered) {
        // If child filtering returned an array (promoted grandchildren), flatten it
        if (Array.isArray(filtered)) {
          filteredChildren.push(...filtered);
        } else {
          filteredChildren.push(filtered);
        }
      }
    }

    // Root node is always kept
    if (isRoot) {
      const cleanedAttrs = this.cleanAttributes(attrs);
      const result: { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> } = { $: cleanedAttrs };
      if (filteredChildren.length > 0) {
        result.node = filteredChildren;
      }
      return result;
    }

    // Check if this node is a structural wrapper
    if (this.isStructuralWrapper(attrs, filteredChildren.length > 0)) {
      // Promote children (collapse this wrapper)
      if (filteredChildren.length > 0) {
        // Return children to be flattened into parent
        return filteredChildren as unknown as { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> };
      }
      // No children and no content - filter out completely
      return null;
    }

    // Check if node has any meaningful properties
    const hasContent = this.hasContentProperties(attrs);
    const hasInteraction = this.hasInteractionProperties(attrs);
    const isClickable = attrs["clickable"] === "true";

    // Keep node if:
    // 1. Has content (text, identifier, etc.)
    // 2. Has interaction properties (scrollable, focused, selected)
    // 3. Is clickable and is a leaf node (actual tappable element)
    // 4. Has meaningful filtered children
    const keepNode = hasContent || hasInteraction || (isClickable && filteredChildren.length === 0) || filteredChildren.length > 0;

    if (!keepNode) {
      return null;
    }

    const cleanedAttrs = this.cleanAttributes(attrs);
    const result: { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> } = { $: cleanedAttrs };
    if (filteredChildren.length > 0) {
      result.node = filteredChildren;
    }
    return result;
  }

  private convertNode(node: XCTestNode): { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> } {
    const attrs: Record<string, string> = {};

    if (node.text) {attrs["text"] = node.text;}
    const contentDesc = this.readNodeField<string>(node, "contentDesc", "content-desc");
    const resourceId = this.readNodeField<string>(node, "resourceId", "resource-id");
    const testTag = this.readNodeField<string>(node, "testTag", "test-tag");
    const accessibilityFocused = this.readNodeField<string>(node, "accessibilityFocused", "accessibility-focused");
    const longClickable = this.readNodeField<string>(node, "longClickable", "long-clickable");
    const stateDescription = this.readNodeField<string>(node, "stateDescription", "state-description");
    const errorMessage = this.readNodeField<string>(node, "errorMessage", "error-message");
    const hintText = this.readNodeField<string>(node, "hintText", "hint-text");

    if (contentDesc) {attrs["content-desc"] = contentDesc;}
    if (resourceId) {attrs["resource-id"] = resourceId;}
    if (node.className) {attrs["class"] = node.className;}
    if (testTag) {attrs["test-tag"] = testTag;}
    if (node.bounds) {
      attrs["bounds"] = `[${node.bounds.left},${node.bounds.top}][${node.bounds.right},${node.bounds.bottom}]`;
    }
    if (node.clickable) {attrs["clickable"] = node.clickable;}
    if (node.enabled) {attrs["enabled"] = node.enabled;}
    if (node.focusable) {attrs["focusable"] = node.focusable;}
    if (node.focused) {attrs["focused"] = node.focused;}
    if (accessibilityFocused) {attrs["accessibility-focused"] = accessibilityFocused;}
    if (node.scrollable) {attrs["scrollable"] = node.scrollable;}
    if (node.password) {attrs["password"] = node.password;}
    if (node.checkable) {attrs["checkable"] = node.checkable;}
    if (node.checked) {attrs["checked"] = node.checked;}
    if (node.selected) {attrs["selected"] = node.selected;}
    if (longClickable) {attrs["long-clickable"] = longClickable;}
    if (stateDescription) {attrs["state-description"] = stateDescription;}
    if (errorMessage) {attrs["error-message"] = errorMessage;}
    if (hintText) {attrs["hint-text"] = hintText;}

    const result: { $: Record<string, string>; node?: Array<{ $: Record<string, string> }> } = { $: attrs };

    if (node.node) {
      const children = Array.isArray(node.node) ? node.node : [node.node];
      result.node = children.map(child => this.convertNode(child));
    }

    return result;
  }

  private readNodeField<T>(node: XCTestNode, camelKey: keyof XCTestNode, dashedKey?: string): T | undefined {
    const record = node as Record<string, unknown>;
    if (record[camelKey as string] !== undefined) {
      return record[camelKey as string] as T;
    }
    if (dashedKey && record[dashedKey] !== undefined) {
      return record[dashedKey] as T;
    }
    return undefined;
  }

  // MARK: - Gestures

  public async requestTapCoordinates(
    x: number,
    y: number,
    duration: number = 0,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestTapResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("tap");
    const promise = this.requestManager.register<XCTestTapResult>(
      requestId,
      "tap_coordinates",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Tap timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_tap_coordinates",
      requestId,
      x,
      y,
      duration
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  public async requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSwipeResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("swipe");
    const promise = this.requestManager.register<XCTestSwipeResult>(
      requestId,
      "swipe",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Swipe timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_swipe",
      requestId,
      x1,
      y1,
      x2,
      y2,
      duration
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  public async requestDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pressDurationMs: number,
    dragDurationMs: number,
    holdDurationMs: number,
    timeoutMs: number
  ): Promise<XCTestDragResult> {
    if (!await this.ensureConnected()) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("drag");
    const promise = this.requestManager.register<XCTestDragResult>(
      requestId,
      "drag",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Drag timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_drag",
      requestId,
      x1,
      y1,
      x2,
      y2,
      pressDurationMs,
      dragDurationMs,
      holdDurationMs
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  public async requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestPinchResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("pinch");
    const promise = this.requestManager.register<XCTestPinchResult>(
      requestId,
      "pinch",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Pinch timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_pinch",
      requestId,
      centerX,
      centerY,
      distanceStart,
      distanceEnd,
      duration
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  // MARK: - Text Input

  public async requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("setText");
    const promise = this.requestManager.register<XCTestSetTextResult>(
      requestId,
      "set_text",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Set text timed out after ${timeout}ms`
      })
    );

    const message: Record<string, unknown> = {
      type: "request_set_text",
      requestId,
      text
    };

    if (resourceId) {
      message.resourceId = resourceId;
    }

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  public async requestClearText(
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult> {
    return this.requestSetText("", resourceId, timeoutMs, perf);
  }

  public async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestImeActionResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, action, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("imeAction");
    const promise = this.requestManager.register<XCTestImeActionResult>(
      requestId,
      "ime_action",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        action,
        totalTimeMs: timeout,
        error: `IME action timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_ime_action",
      requestId,
      action
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  public async requestSelectAll(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSelectAllResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("selectAll");
    const promise = this.requestManager.register<XCTestSelectAllResult>(
      requestId,
      "select_all",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Select all timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_select_all",
      requestId
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  public async requestPressHome(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestPressHomeResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("pressHome");
    const promise = this.requestManager.register<XCTestPressHomeResult>(
      requestId,
      "press_home",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Press home timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_press_home",
      requestId
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }

  // MARK: - Screenshot

  public async requestScreenshot(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestScreenshotResult> {
    if (!await this.ensureConnected(perf)) {
      return { success: false, error: "Not connected" };
    }

    const requestId = this.requestManager.generateId("screenshot");
    const promise = this.requestManager.register<XCTestScreenshotResult>(
      requestId,
      "screenshot",
      timeoutMs,
      (id, type, timeout) => ({
        success: false,
        error: `Screenshot timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_screenshot",
      requestId
    };

    this.ws?.send(JSON.stringify(message));
    return promise;
  }
}
