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
import { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../../utils/SystemTimer";
import { PortManager } from "../../../utils/PortManager";
import { shouldUseHostControl, getHostControlHost } from "../../../utils/hostControlClient";
import { isRunningInDocker } from "../../../utils/dockerEnv";
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
  CachedHierarchy,
  WebSocketMessage,
} from "./types";

// Re-export types for backward compatibility
export type {
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
};

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
 * Provides iOS UI hierarchy and interaction capabilities matching Android AccessibilityServiceClient
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

  private constructor(
    device: BootedDevice,
    port: number = XCTestServiceClient.DEFAULT_PORT,
    wsFactory: WebSocketFactory = defaultWebSocketFactory,
    timer: Timer = defaultTimer
  ) {
    super(timer, wsFactory);
    this.device = device;
    this.port = port;
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

  // ===========================================================================
  // Delegate Context Factories
  // ===========================================================================

  private createDelegateContext(): DelegateContext {
    return {
      getWebSocket: () => this.ws,
      requestManager: this.requestManager,
      timer: this.timer,
      ensureConnected: perf => this.ensureConnected(perf),
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
    // No additional setup needed for iOS
  }

  protected onConnectionClosed(): void {
    this.cachedHierarchy = null;

    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.dispose();
      this.hierarchyNavigationDetector = null;
    }
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

      // Notify listeners (e.g., ObserveScreen to clear its cache)
      this.notifyPushUpdateListeners(message.data);
      return;
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
