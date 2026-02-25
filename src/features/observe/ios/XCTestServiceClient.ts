/**
 * XCTestServiceClient - Main client for iOS XCTestService.
 *
 * This client provides a unified interface to the iOS XCTestService
 * via WebSocket connection. It uses composition with delegate modules to handle
 * specific functionality:
 *
 * - XCTestServiceGestures: Swipe, tap, drag, pinch operations
 * - XCTestServiceText: setText, clearText, IME actions, select all
 * - XCTestServiceHierarchy: Hierarchy retrieval, caching, conversion
 * - XCTestServiceScreenshot: Screenshot capture
 * - XCTestServiceNavigation: pressHome, launchApp
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import {
  BootedDevice,
  ViewHierarchyResult,
} from "../../../models";
import { ViewHierarchyQueryOptions } from "../../../models/ViewHierarchyQueryOptions";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../../utils/SystemTimer";
import { PortManager } from "../../../utils/PortManager";
import { shouldUseHostControl, getHostControlHost } from "../../../utils/hostControlClient";
import { isRunningInDocker } from "../../../utils/dockerEnv";
import { IOSXCTestServiceManager, XCTestServiceManager } from "../../../utils/XCTestServiceManager";
import { NavigationGraphManager } from "../../navigation/NavigationGraphManager";
import {
  HierarchyNavigationDetector,
  HierarchyNavigationUpdateMetrics
} from "../../navigation/HierarchyNavigationDetector";
import { AccessibilityHierarchy } from "../../navigation/ScreenFingerprint";
import {
  DeviceServiceClient,
  WebSocketFactory,
  defaultWebSocketFactory,
} from "../DeviceServiceClient";
import { getDeviceDataStreamServer, PerformanceStreamData } from "../../../daemon/deviceDataStreamSocketServer";
import { getPerformanceMonitor } from "../../performance/PerformanceMonitor";
import {
  ScreenshotBackoffScheduler,
  DefaultScreenshotBackoffScheduler,
  ScreenshotCaptureResult,
} from "../ScreenshotBackoffScheduler";

/**
 * Factory function type for creating XCTestServiceManager instances.
 * Used for testing to inject fake service managers.
 */
export type ServiceManagerFactory = (device: BootedDevice) => XCTestServiceManager;

/** Default production factory that delegates to the real singleton. */
const defaultServiceManagerFactory: ServiceManagerFactory = d => IOSXCTestServiceManager.getInstance(d);

/**
 * No-op factory used by createForTesting so that tests which don't supply
 * a factory never trigger real XCTestService setup on connection failure.
 */
class NoOpXCTestServiceManager implements XCTestServiceManager {
  async setup(): Promise<{ success: false; message: string }> { return { success: false, message: "no-op test stub" }; }
  async isInstalled(): Promise<boolean> { return false; }
  async isRunning(): Promise<boolean> { return false; }
  async isAvailable(): Promise<boolean> { return false; }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  getServicePort(): number { return 0; }
  setAutoRestart(): void {}
  isAutoRestartEnabled(): boolean { return false; }
  async forceRestart(): Promise<void> {}
}

const noOpServiceManagerFactory: ServiceManagerFactory = () => new NoOpXCTestServiceManager();

// Import delegates
import { XCTestServiceGestures } from "./XCTestServiceGestures";
import { XCTestServiceText } from "./XCTestServiceText";
import { XCTestServiceHierarchy } from "./XCTestServiceHierarchy";
import { XCTestServiceScreenshot } from "./XCTestServiceScreenshot";
import { XCTestServiceNavigation } from "./XCTestServiceNavigation";

// Import types
import type {
  DelegateContext,
  HierarchyDelegateContext,
  XCTestNode,
  XCTestHierarchy,
  XCTestHierarchyResponse,
  XCTestScreenshotResult,
  XCTestSwipeResult,
  XCTestTapResult,
  XCTestDragResult,
  XCTestPinchResult,
  XCTestSetTextResult,
  XCTestImeActionResult,
  XCTestSelectAllResult,
  XCTestPressHomeResult,
  XCTestLaunchAppResult,
  XCTestPerfTiming,
  XCTestPerformanceSnapshot,
  CachedHierarchy,
  WebSocketMessage,
} from "./types";


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
    x1: number, y1: number, x2: number, y2: number,
    duration?: number, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestSwipeResult>;

  requestTapCoordinates(
    x: number, y: number, duration?: number, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestTapResult>;

  requestDrag(
    x1: number, y1: number, x2: number, y2: number,
    pressDurationMs: number, dragDurationMs: number, holdDurationMs: number, timeoutMs: number
  ): Promise<XCTestDragResult>;

  requestPinch(
    centerX: number, centerY: number,
    distanceStart: number, distanceEnd: number, rotationDegrees: number,
    duration?: number, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestPinchResult>;

  requestSetText(
    text: string, resourceId?: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult>;

  requestClearText(
    resourceId?: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult>;

  requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestImeActionResult>;

  requestSelectAll(
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestSelectAllResult>;

  requestPressHome(
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestPressHomeResult>;

  requestLaunchApp(
    bundleId: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestLaunchAppResult>;

  requestScreenshot(
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<XCTestScreenshotResult>;

  ensureConnected(perf?: PerformanceTracker): Promise<boolean>;
  isConnected(): boolean;
  waitForConnection(maxAttempts?: number, delayMs?: number): Promise<boolean>;
  verifyServiceReady(maxAttempts?: number, delayMs?: number, timeoutMs?: number): Promise<boolean>;
  hasCachedHierarchy(): boolean;
  invalidateCache(): void;
  close(): Promise<void>;

  onPushUpdate(callback: (hierarchy: XCTestHierarchy) => void): () => void;
}

/**
 * XCTestServiceClient - WebSocket client for iOS XCTestService
 * Provides iOS UI hierarchy and interaction capabilities matching Android CtrlProxyClient
 *
 * Extends DeviceServiceClient for shared connection lifecycle management.
 */
export class XCTestServiceClient extends DeviceServiceClient implements XCTestService {
  private static instances: Map<string, XCTestServiceClient> = new Map();

  // Default port matches XCTestService on iOS
  public static readonly DEFAULT_PORT = 8765;

  /**
   * NOT using TTLCache: "fresh" state managed by push updates + minTimestamp
   * validation, not simple TTL expiration. The cache is invalidated based on
   * WebSocket push events and explicit invalidateCache() calls after actions.
   */
  private cachedHierarchy: CachedHierarchy | null = null;
  private static readonly CACHE_FRESH_TTL_MS = 500;
  private hierarchyNavigationDetector: HierarchyNavigationDetector | null = null;

  // Push update callbacks
  private onPushUpdateCallbacks: Set<(hierarchy: XCTestHierarchy) => void> = new Set();

  // Track last foreground bundle for performance monitoring
  private lastForegroundBundleId: string | null = null;

  // Platform-specific dependencies
  private readonly device: BootedDevice;
  private readonly port: number;

  // Delegate instances (lazy initialized)
  private _gestures: XCTestServiceGestures | null = null;
  private _text: XCTestServiceText | null = null;
  private _hierarchy: XCTestServiceHierarchy | null = null;
  private _screenshot: XCTestServiceScreenshot | null = null;
  private _navigation: XCTestServiceNavigation | null = null;

  // Logging tag for base class
  protected readonly logTag = "XCTestServiceClient";

  // Screenshot backoff scheduler for real-time screenshot streaming
  private screenshotBackoffScheduler: ScreenshotBackoffScheduler | null = null;
  private cachedScreenDimensions: { width: number; height: number } | null = null;

  // Connection failure tracking for auto-restart
  private consecutiveConnectionFailures: number = 0;
  private isRequestingServiceRestart: boolean = false;
  private static readonly MAX_FAILURES_BEFORE_RESTART = 3;

  // Auto-setup on connection failure
  private readonly serviceManagerFactory: ServiceManagerFactory;
  private isAttemptingAutoSetup: boolean = false;

  private constructor(
    device: BootedDevice,
    port: number = XCTestServiceClient.DEFAULT_PORT,
    wsFactory: WebSocketFactory = defaultWebSocketFactory,
    timer: Timer = defaultTimer,
    serviceManagerFactory: ServiceManagerFactory = defaultServiceManagerFactory
  ) {
    super(timer, wsFactory);
    this.device = device;
    this.port = port;
    this.serviceManagerFactory = serviceManagerFactory;
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
    timer: Timer,
    serviceManagerFactory: ServiceManagerFactory = noOpServiceManagerFactory
  ): XCTestServiceClient {
    return new XCTestServiceClient(device, port, wsFactory, timer, serviceManagerFactory);
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

  // ===========================================================================
  // Auto-setup on connection failure
  // ===========================================================================

  /**
   * Override ensureConnected to automatically set up XCTestService when
   * the WebSocket connection fails. This covers all tool calls (observe, tap, etc.).
   */
  public override async ensureConnected(
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<boolean> {
    const connected = await super.ensureConnected(perf);
    if (connected) {
      return true;
    }

    // Prevent re-entry during auto-setup
    if (this.isAttemptingAutoSetup) {
      return false;
    }

    this.isAttemptingAutoSetup = true;
    try {
      logger.info(`[XCTestServiceClient] WebSocket connection failed, attempting auto-setup of XCTestService`);
      const manager = this.serviceManagerFactory(this.device);
      const result = await manager.setup(true, perf);

      if (!result.success) {
        logger.warn(`[XCTestServiceClient] Auto-setup failed: ${result.message}`);
        return false;
      }

      logger.info(`[XCTestServiceClient] Auto-setup succeeded, retrying WebSocket connection`);
      // Reset connection attempts to allow fresh connection attempts
      this.connectionAttempts = 0;
      return await super.ensureConnected(perf);
    } catch (error) {
      logger.warn(`[XCTestServiceClient] Auto-setup error: ${error}`);
      return false;
    } finally {
      this.isAttemptingAutoSetup = false;
    }
  }

  // ===========================================================================
  // Delegate Context Factories
  // ===========================================================================

  private createDelegateContext(): DelegateContext {
    return {
      getWebSocket: () => this.ws,
      requestManager: this.requestManager,
      timer: this.timer,
      ensureConnected: perf => this.ensureConnected(perf),
      cancelScreenshotBackoff: () => this.cancelScreenshotBackoff(),
    };
  }

  private createHierarchyDelegateContext(): HierarchyDelegateContext {
    return {
      ...this.createDelegateContext(),
      cacheFreshTtlMs: XCTestServiceClient.CACHE_FRESH_TTL_MS,
      getCachedHierarchy: () => this.cachedHierarchy,
      setCachedHierarchy: h => { this.cachedHierarchy = h; },
    };
  }

  // ===========================================================================
  // Delegate Getters (lazy initialization)
  // ===========================================================================

  private get gestures(): XCTestServiceGestures {
    if (!this._gestures) {
      this._gestures = new XCTestServiceGestures(this.createDelegateContext());
    }
    return this._gestures;
  }

  private get text(): XCTestServiceText {
    if (!this._text) {
      this._text = new XCTestServiceText(this.createDelegateContext());
    }
    return this._text;
  }

  private get hierarchy(): XCTestServiceHierarchy {
    if (!this._hierarchy) {
      this._hierarchy = new XCTestServiceHierarchy(this.createHierarchyDelegateContext());
    }
    return this._hierarchy;
  }

  private get screenshot(): XCTestServiceScreenshot {
    if (!this._screenshot) {
      this._screenshot = new XCTestServiceScreenshot(this.createDelegateContext());
    }
    return this._screenshot;
  }

  private get navigation(): XCTestServiceNavigation {
    if (!this._navigation) {
      this._navigation = new XCTestServiceNavigation(this.createDelegateContext());
    }
    return this._navigation;
  }

  // ===========================================================================
  // DeviceServiceClient abstract method implementations
  // ===========================================================================

  protected getWebSocketUrl(): string {
    const wsHost = this.resolveWebSocketHost();
    return `ws://${wsHost}:${this.port}/ws`;
  }

  protected handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      this.processMessage(message);
    } catch (error) {
      logger.warn(`[XCTestServiceClient] Failed to parse message: ${error}`);
    }
  }

  protected onConnectionEstablished(): void {
    // Reset failure counter on successful connection
    this.consecutiveConnectionFailures = 0;
    this.isRequestingServiceRestart = false;
    logger.info(`[XCTestServiceClient] Connection established, reset failure counter`);
  }

  protected onConnectionClosed(): void {
    this.cachedHierarchy = null;

    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.dispose();
      this.hierarchyNavigationDetector = null;
    }

    // Track connection failure and potentially trigger service restart
    this.consecutiveConnectionFailures++;
    logger.info(`[XCTestServiceClient] Connection closed (failure count: ${this.consecutiveConnectionFailures})`);

    if (this.consecutiveConnectionFailures >= XCTestServiceClient.MAX_FAILURES_BEFORE_RESTART &&
        !this.isRequestingServiceRestart) {
      this.triggerServiceRestart();
    }
  }

  /**
   * Trigger XCTestService restart through the manager.
   * This is called when repeated WebSocket connection failures indicate
   * that the XCTestService process may have crashed.
   */
  private triggerServiceRestart(): void {
    if (this.isRequestingServiceRestart) {
      return;
    }

    this.isRequestingServiceRestart = true;
    logger.info(`[XCTestServiceClient] Triggering XCTestService restart after ${this.consecutiveConnectionFailures} connection failures`);

    const manager = this.serviceManagerFactory(this.device);

    // Check if service is actually not running before restarting
    void manager.isRunning().then(running => {
      if (!running) {
        logger.info(`[XCTestServiceClient] XCTestService not running, requesting restart`);
        void manager.forceRestart().then(() => {
          logger.info(`[XCTestServiceClient] XCTestService restart completed`);
          this.consecutiveConnectionFailures = 0;
          this.isRequestingServiceRestart = false;
        }).catch(error => {
          logger.warn(`[XCTestServiceClient] XCTestService restart failed: ${error}`);
          this.isRequestingServiceRestart = false;
        });
      } else {
        logger.info(`[XCTestServiceClient] XCTestService is running, connection issue may be transient`);
        this.isRequestingServiceRestart = false;
      }
    }).catch(error => {
      logger.warn(`[XCTestServiceClient] Failed to check XCTestService status: ${error}`);
      this.isRequestingServiceRestart = false;
    });
  }

  protected async setupBeforeConnect(_perf: PerformanceTracker): Promise<void> {
    // No port forwarding needed for iOS simulator
    // For real devices, iproxy may be needed in the future
  }

  // ===========================================================================
  // Platform-specific methods
  // ===========================================================================

  private resolveWebSocketHost(): string {
    if (shouldUseHostControl() && isRunningInDocker()) {
      return getHostControlHost();
    }
    return "localhost";
  }

  private processMessage(message: WebSocketMessage): void {
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
        case "launch_app_result":
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
        perfTiming: message.perfTiming as XCTestPerfTiming | undefined
      };
      logger.info(`[XCTestServiceClient] Received hierarchy push update - UI changed`);

      // Convert and push to observation stream for IDE plugins
      const viewHierarchyResult = this.convertToViewHierarchyResult(message.data);
      this.pushHierarchyToObservationStream(viewHierarchyResult);

      // Start screenshot backoff sequence for real-time screenshot streaming
      this.startScreenshotBackoff();

      // Performance monitoring is handled in handleHierarchyUpdateForNavigation
      // which runs for ALL hierarchy_update messages (both push and request-response)

      // Notify listeners (e.g., ObserveScreen to clear its cache)
      this.notifyPushUpdateListeners(message.data);
      return;
    }

    // Handle performance update push messages from CADisplayLink FPS monitoring
    if (type === "performance_update") {
      if (message.performanceData) {
        this.handlePerformanceUpdate(message.performanceData);
      } else {
        logger.warn(`[XCTestServiceClient] Received performance_update but no performanceData field`);
      }
      return;
    }
  }

  /**
   * Handle performance update push messages from iOS XCTestService.
   * Converts the iOS performance snapshot to PerformanceStreamData and pushes to IDE.
   */
  private handlePerformanceUpdate(snapshot: XCTestPerformanceSnapshot): void {
    const server = getDeviceDataStreamServer();
    if (!server) {
      return;
    }

    // Convert iOS performance snapshot to PerformanceStreamData format
    const streamData: PerformanceStreamData = {
      fps: snapshot.fps ?? 0,
      frameTimeMs: snapshot.frameTimeMs ?? 0,
      jankFrames: snapshot.jankFrames ?? 0,
      droppedFrames: 0, // iOS doesn't report this separately
      memoryUsageMb: snapshot.memoryUsageMb ?? 0,
      cpuUsagePercent: snapshot.cpuUsagePercent ?? 0,
      touchLatencyMs: snapshot.touchLatencyMs ?? null,
      timeToInteractiveMs: snapshot.ttiMs ?? null,
      screenName: snapshot.screenName ?? null,
      isResponsive: (snapshot.fps ?? 0) >= 50, // Consider responsive if FPS >= 50
    };

    try {
      server.pushPerformanceUpdate(this.device.deviceId, streamData);
      // Log occasionally to avoid spam
      if (this.timer.now() % 5000 < 600) {
        logger.info(`[XCTestServiceClient] iOS FPS: ${streamData.fps.toFixed(1)}, frameTime: ${streamData.frameTimeMs.toFixed(1)}ms, memory: ${streamData.memoryUsageMb.toFixed(1)}MB`);
      }
    } catch (error) {
      logger.warn(`[XCTestServiceClient] Failed to push performance update: ${error}`);
    }
  }

  // ===========================================================================
  // Delegated Public Methods - Hierarchy
  // ===========================================================================

  async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    disableAllFiltering?: boolean
  ): Promise<ViewHierarchyResult | null> {
    return this.hierarchy.getAccessibilityHierarchy(queryOptions, perf, skipWaitForFresh, minTimestamp, disableAllFiltering);
  }

  async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 15000,
    perf?: PerformanceTracker,
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<XCTestHierarchyResponse> {
    return this.hierarchy.getLatestHierarchy(waitForFresh, timeout, perf, skipWaitForFresh, minTimestamp);
  }

  async requestHierarchySync(
    perf?: PerformanceTracker,
    disableAllFiltering?: boolean,
    signal?: AbortSignal,
    timeoutMs: number = 5000
  ): Promise<{ hierarchy: XCTestHierarchy; perfTiming?: XCTestPerfTiming } | null> {
    return this.hierarchy.requestHierarchySync(perf, disableAllFiltering, signal, timeoutMs);
  }

  convertToViewHierarchyResult(hierarchy: XCTestHierarchy): ViewHierarchyResult {
    return this.hierarchy.convertToViewHierarchyResult(hierarchy);
  }

  hasCachedHierarchy(): boolean {
    return this.hierarchy.hasCachedHierarchy();
  }

  invalidateCache(): void {
    return this.hierarchy.invalidateCache();
  }

  // ===========================================================================
  // Delegated Public Methods - Gestures
  // ===========================================================================

  async requestTapCoordinates(
    x: number, y: number, duration: number = 0, timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestTapResult> {
    return this.gestures.requestTapCoordinates(x, y, duration, timeoutMs, perf);
  }

  async requestSwipe(
    x1: number, y1: number, x2: number, y2: number,
    duration: number = 300, timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestSwipeResult> {
    return this.gestures.requestSwipe(x1, y1, x2, y2, duration, timeoutMs, perf);
  }

  async requestDrag(
    x1: number, y1: number, x2: number, y2: number,
    pressDurationMs: number, dragDurationMs: number, holdDurationMs: number, timeoutMs: number
  ): Promise<XCTestDragResult> {
    return this.gestures.requestDrag(x1, y1, x2, y2, pressDurationMs, dragDurationMs, holdDurationMs, timeoutMs);
  }

  async requestPinch(
    centerX: number, centerY: number,
    distanceStart: number, distanceEnd: number, rotationDegrees: number,
    duration: number = 300, timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestPinchResult> {
    return this.gestures.requestPinch(centerX, centerY, distanceStart, distanceEnd, rotationDegrees, duration, timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Text
  // ===========================================================================

  async requestSetText(
    text: string, resourceId?: string, timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult> {
    return this.text.requestSetText(text, resourceId, timeoutMs, perf);
  }

  async requestClearText(
    resourceId?: string, timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult> {
    return this.text.requestClearText(resourceId, timeoutMs, perf);
  }

  async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestImeActionResult> {
    return this.text.requestImeAction(action, timeoutMs, perf);
  }

  async requestSelectAll(
    timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestSelectAllResult> {
    return this.text.requestSelectAll(timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Navigation
  // ===========================================================================

  async requestPressHome(
    timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestPressHomeResult> {
    return this.navigation.requestPressHome(timeoutMs, perf);
  }

  async requestLaunchApp(
    bundleId: string, timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestLaunchAppResult> {
    return this.navigation.requestLaunchApp(bundleId, timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Screenshot
  // ===========================================================================

  async requestScreenshot(
    timeoutMs: number = 5000, perf?: PerformanceTracker
  ): Promise<XCTestScreenshotResult> {
    return this.screenshot.requestScreenshot(timeoutMs, perf);
  }

  // ===========================================================================
  // Service Verification
  // ===========================================================================

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

  // ===========================================================================
  // Push Update Callbacks
  // ===========================================================================

  public onPushUpdate(callback: (hierarchy: XCTestHierarchy) => void): () => void {
    this.onPushUpdateCallbacks.add(callback);
    return () => {
      this.onPushUpdateCallbacks.delete(callback);
    };
  }

  private notifyPushUpdateListeners(hierarchy: XCTestHierarchy): void {
    for (const callback of this.onPushUpdateCallbacks) {
      try {
        callback(hierarchy);
      } catch (error) {
        logger.warn(`[XCTestServiceClient] Push update callback error: ${error}`);
      }
    }
  }

  /**
   * Push hierarchy update to the device data stream for IDE plugins.
   */
  private pushHierarchyToObservationStream(hierarchy: ViewHierarchyResult): void {
    const server = getDeviceDataStreamServer();
    if (!server) {
      return;
    }

    try {
      server.pushHierarchyUpdate(this.device.deviceId, hierarchy);
    } catch (error) {
      logger.warn(`[XCTestServiceClient] Failed to push hierarchy to observation stream: ${error}`);
    }
  }

  /**
   * Push screenshot update to the device data stream for IDE plugins.
   */
  private pushScreenshotToObservationStream(screenshotBase64: string, screenWidth: number, screenHeight: number): void {
    const server = getDeviceDataStreamServer();
    if (!server) {
      return;
    }

    try {
      server.pushScreenshotUpdate(this.device.deviceId, screenshotBase64, screenWidth, screenHeight);
    } catch (error) {
      logger.debug(`[XCTestServiceClient] Failed to push screenshot to observation stream: ${error}`);
    }
  }

  // ===========================================================================
  // Screenshot Backoff for Real-time Streaming
  // ===========================================================================

  /**
   * Start screenshot backoff sequence for real-time screenshot streaming to IDE.
   * Called when a hierarchy push update is received to capture corresponding screenshots.
   */
  private startScreenshotBackoff(): void {
    const server = getDeviceDataStreamServer();
    if (!server || server.getSubscriberCount() === 0) {
      return;
    }

    const scheduler = this.getScreenshotBackoffScheduler();
    scheduler.startBackoffSequence();
  }

  private getScreenshotBackoffScheduler(): ScreenshotBackoffScheduler {
    if (!this.screenshotBackoffScheduler) {
      this.screenshotBackoffScheduler = new DefaultScreenshotBackoffScheduler(
        async (): Promise<ScreenshotCaptureResult> => {
          return this.captureScreenshotForBackoff();
        },
        (data: string) => {
          // Get screen dimensions from cached hierarchy or use defaults
          const screenWidth = this.cachedScreenDimensions?.width ?? 1170;
          const screenHeight = this.cachedScreenDimensions?.height ?? 2532;
          this.pushScreenshotToObservationStream(data, screenWidth, screenHeight);
        },
        undefined, // Use default config
        this.timer
      );
    }
    return this.screenshotBackoffScheduler;
  }

  private async captureScreenshotForBackoff(): Promise<ScreenshotCaptureResult> {
    try {
      const result = await this.requestScreenshot(5000);
      if (!result.success || !result.data) {
        return { success: false, error: result.error || "No screenshot data" };
      }

      // Cache screen dimensions from hierarchy if available.
      // screenWidth/screenHeight are in iOS points — multiply by screenScale to get pixels,
      // matching the screenshot image resolution and the TakeScreenshot path (which reads PNG header pixels).
      if (this.cachedHierarchy?.hierarchy?.screenWidth && this.cachedHierarchy?.hierarchy?.screenHeight) {
        const scale = this.cachedHierarchy.hierarchy.screenScale ?? 1;
        this.cachedScreenDimensions = {
          width: Math.round(this.cachedHierarchy.hierarchy.screenWidth * scale),
          height: Math.round(this.cachedHierarchy.hierarchy.screenHeight * scale),
        };
      }

      return {
        success: true,
        data: result.data,
      };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  }

  /**
   * Cancel any pending screenshot captures.
   */
  cancelScreenshotBackoff(): void {
    if (this.screenshotBackoffScheduler) {
      this.screenshotBackoffScheduler.cancelPendingCaptures();
    }
  }

  // ===========================================================================
  // Navigation Detector
  // ===========================================================================

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

    // Track foreground bundle and start performance monitoring when app changes
    const bundleId = hierarchy.packageName;
    logger.debug(`[XCTestServiceClient] Hierarchy update - bundleId: "${bundleId}", lastForeground: "${this.lastForegroundBundleId}"`);
    if (bundleId && bundleId !== this.lastForegroundBundleId) {
      this.lastForegroundBundleId = bundleId;
      // Start performance monitoring for this device/bundle
      const monitor = getPerformanceMonitor();
      monitor.startMonitoring(this.device.deviceId, bundleId, "ios");
      logger.info(`[XCTestServiceClient] Started performance monitoring for ${bundleId} on ${this.device.deviceId}`);
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
  ): Record<string, unknown> | Record<string, unknown>[] {
    if (Array.isArray(node)) {
      return node.map(child => this.convertNodeForNavigation(child));
    }

    const converted: Record<string, unknown> = {};

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
}
