/**
 * AccessibilityServiceClient - Main client for Android accessibility service.
 *
 * This client provides a unified interface to the Android accessibility service
 * via WebSocket connection. It uses composition with delegate modules to handle
 * specific functionality:
 *
 * - AccessibilityServiceGestures: Swipe, tap, drag, pinch operations
 * - AccessibilityServiceText: setText, clearText, IME actions, select all
 * - AccessibilityServiceHierarchy: Hierarchy retrieval, caching, conversion
 * - AccessibilityServiceStorage: SharedPreferences operations
 * - AccessibilityServiceCertificates: CA cert install/remove, permissions
 * - AccessibilityServiceFocus: TalkBack focus, traversal order
 * - AccessibilityServiceHighlights: Visual highlight overlays
 */

import WebSocket from "ws";
import { AdbClientFactory, defaultAdbClientFactory } from "../../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import type { AdbClient } from "../../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../../utils/logger";
import {
  BootedDevice,
  ViewHierarchyResult,
  CurrentFocusResult,
  TraversalOrderResult,
  Element,
  HighlightOperationResult,
  HighlightShape
} from "../../../models";
import { ViewHierarchyQueryOptions } from "../../../models/ViewHierarchyQueryOptions";
import { AndroidAccessibilityServiceManager } from "../../../utils/AccessibilityServiceManager";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../../utils/SystemTimer";
import { NavigationGraphManager, NavigationEvent } from "../../navigation/NavigationGraphManager";
import { NavigationScreenshotManager } from "../../navigation/NavigationScreenshotManager";
import { HierarchyNavigationDetector } from "../../navigation/HierarchyNavigationDetector";
import { InstalledAppsRepository, InstalledAppsStore } from "../../../db/installedAppsRepository";
import { DefaultWorkProfileMonitor, WorkProfileMonitor } from "../../../utils/WorkProfileMonitor";
import { PortManager } from "../../../utils/PortManager";
import { getDeviceDataStreamServer } from "../../../daemon/deviceDataStreamSocketServer";
import {
  ScreenshotBackoffScheduler,
  DefaultScreenshotBackoffScheduler,
  ScreenshotCaptureResult,
  computeChecksum,
} from "../ScreenshotBackoffScheduler";
import { getFailureRecorder } from "../../failures/FailureRecorder";
import { getPerformanceMonitor } from "../../performance/PerformanceMonitor";
import type { StackTraceElement } from "../../../server/failuresResources";
import type {
  PreferenceFile,
  KeyValueEntry,
  StorageSubscription,
  StorageChangedEvent,
} from "../../storage/storageTypes";
import {
  DeviceServiceClient,
  WebSocketFactory,
  defaultWebSocketFactory,
} from "../DeviceServiceClient";
import { RetryExecutor, defaultRetryExecutor } from "../../../utils/retry/RetryExecutor";

// Import delegates
import { AccessibilityServiceGestures } from "./AccessibilityServiceGestures";
import { AccessibilityServiceText } from "./AccessibilityServiceText";
import { AccessibilityServiceHierarchy } from "./AccessibilityServiceHierarchy";
import { AccessibilityServiceStorage } from "./AccessibilityServiceStorage";
import { AccessibilityServiceCertificates } from "./AccessibilityServiceCertificates";
import { AccessibilityServiceFocus } from "./AccessibilityServiceFocus";
import { AccessibilityServiceHighlights } from "./AccessibilityServiceHighlights";

// Import types
import type {
  DelegateContext,
  HierarchyDelegateContext,
  CertificatesDelegateContext,
  AccessibilityHierarchy,
  AccessibilityHierarchyResponse,
  CachedHierarchy,
  ScreenshotResult,
  A11ySwipeResult,
  A11yTapCoordinatesResult,
  A11yDragResult,
  A11yPinchResult,
  A11ySetTextResult,
  A11yImeActionResult,
  A11ySelectAllResult,
  A11yActionResult,
  A11yClipboardResult,
  A11yCaCertResult,
  A11yDeviceOwnerStatusResult,
  A11yPermissionResult,
  AndroidPerfTiming,
} from "./types";


/**
 * Interface for interaction event from accessibility service
 */
export interface InteractionEvent {
  type: "tap" | "longPress" | "swipe" | "inputText";
  timestamp: number;
  packageName?: string;
  screenClassName?: string;
  element?: Partial<Element>;
  text?: string;
  scrollDeltaX?: number;
  scrollDeltaY?: number;
}

/**
 * Interface for package event from accessibility service
 */
interface PackageEvent {
  action: "added" | "removed" | "replaced";
  packageName: string;
  userId: number;
  isSystem?: boolean | null;
  removedForAllUsers?: boolean | null;
}

/**
 * Interface for handled exception event from SDK
 */
interface HandledExceptionEvent {
  timestamp: number;
  exceptionClass: string;
  exceptionMessage?: string;
  stackTrace: string;
  customMessage?: string;
  currentScreen?: string;
  packageName: string;
  appVersion?: string;
  deviceInfo: {
    model: string;
    manufacturer: string;
    osVersion: string;
    sdkInt: number;
  };
}

/**
 * Interface for crash event from SDK
 */
interface CrashEvent {
  timestamp: number;
  exceptionClass: string;
  message?: string;
  stackTrace: string;
  threadName: string;
  currentScreen?: string;
  packageName: string;
  appVersion?: string;
  deviceInfo: {
    model: string;
    manufacturer: string;
    osVersion: string;
    sdkInt: number;
  };
}

/**
 * Interface for ANR event from SDK
 */
interface AnrEvent {
  timestamp: number;
  pid: number;
  processName: string;
  importance: string;
  trace?: string;
  reason: string;
  packageName?: string;
  appVersion?: string;
  deviceInfo: {
    model: string;
    manufacturer: string;
    osVersion: string;
    sdkInt: number;
  };
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
  success?: boolean;
  totalTimeMs?: number;
  permission?: string;
  granted?: boolean;
  requestLaunched?: boolean;
  canRequest?: boolean;
  requiresSettings?: boolean;
  instructions?: string;
  adbCommand?: string;
  error?: string;
  event?: InteractionEvent | NavigationEvent | PackageEvent;
  highlights?: any[];
}

/**
 * Interface for accessibility service providing Android UI hierarchy and interaction capabilities
 */
export interface AccessibilityService {
  getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    disableAllFiltering?: boolean
  ): Promise<ViewHierarchyResult | null>;

  setRecompositionTrackingEnabled(
    enabled: boolean,
    perf?: PerformanceTracker
  ): Promise<void>;

  getLatestHierarchy(
    waitForFresh?: boolean,
    timeout?: number,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number
  ): Promise<AccessibilityHierarchyResponse>;

  requestHierarchySync(
    perf?: PerformanceTracker,
    disableAllFiltering?: boolean,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<{ hierarchy: AccessibilityHierarchy; perfTiming?: AndroidPerfTiming[] } | null>;

  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult;

  requestSwipe(
    x1: number, y1: number, x2: number, y2: number,
    duration?: number, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11ySwipeResult>;

  requestDrag(
    x1: number, y1: number, x2: number, y2: number,
    pressDurationMs: number, dragDurationMs: number, holdDurationMs: number, timeoutMs: number
  ): Promise<A11yDragResult>;

  requestPinch(
    centerX: number, centerY: number,
    distanceStart: number, distanceEnd: number, rotationDegrees: number,
    duration?: number, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yPinchResult>;

  requestSetText(
    text: string, resourceId?: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11ySetTextResult>;

  requestClearText(
    resourceId?: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11ySetTextResult>;

  requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yImeActionResult>;

  requestSelectAll(
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11ySelectAllResult>;

  requestAction(
    action: string, resourceId?: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yActionResult>;

  requestClipboard(
    action: "copy" | "paste" | "clear" | "get",
    text?: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yClipboardResult>;

  requestInstallCaCertificate(
    certificate: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yCaCertResult>;

  requestInstallCaCertificateFromFile(
    certificatePath: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yCaCertResult>;

  requestRemoveCaCertificate(
    alias: string, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yCaCertResult>;

  requestDeviceOwnerStatus(
    timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yDeviceOwnerStatusResult>;

  requestPermission(
    permission: string, requestPermission?: boolean, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<A11yPermissionResult>;

  requestAddHighlight(
    id: string, shape: HighlightShape, timeoutMs?: number, perf?: PerformanceTracker
  ): Promise<HighlightOperationResult>;

  requestScreenshot(timeoutMs?: number, perf?: PerformanceTracker): Promise<ScreenshotResult>;

  ensureConnected(perf?: PerformanceTracker): Promise<boolean>;
  isConnected(): boolean;
  waitForConnection(maxAttempts?: number, delayMs?: number): Promise<boolean>;
  verifyServiceReady(maxAttempts?: number, delayMs?: number, timeoutMs?: number): Promise<boolean>;
  hasCachedHierarchy(): boolean;
  invalidateCache(): void;
  close(): Promise<void>;
}

/**
 * Client for interacting with the AutoMobile Accessibility Service via WebSocket.
 * Uses singleton pattern per device to maintain persistent WebSocket connection.
 */
export class AccessibilityServiceClient extends DeviceServiceClient implements AccessibilityService {
  private device: BootedDevice;
  private adb: AdbExecutor;

  // Per-instance port allocation for multi-device support
  private localPort: number;

  // Singleton instances per device
  private static instances: Map<string, AccessibilityServiceClient> = new Map();

  // Hierarchy caching (accessed by delegates via context)
  private cachedHierarchy: CachedHierarchy | null = null;

  // Android-specific state
  private portForwardingSetup: boolean = false;
  private lastWebSocketTimeout: number = 0;

  // Delegate instances (lazy initialized)
  private _gestures: AccessibilityServiceGestures | null = null;
  private _text: AccessibilityServiceText | null = null;
  private _hierarchy: AccessibilityServiceHierarchy | null = null;
  private _storage: AccessibilityServiceStorage | null = null;
  private _certificates: AccessibilityServiceCertificates | null = null;
  private _focus: AccessibilityServiceFocus | null = null;
  private _highlights: AccessibilityServiceHighlights | null = null;

  // Interaction listeners
  private interactionListeners: Set<(event: InteractionEvent) => void> = new Set();
  private installedAppsRepository: InstalledAppsStore | null = null;

  // Hierarchy navigation detector
  private hierarchyNavigationDetector: HierarchyNavigationDetector | null = null;
  private sdkNavigationAppIds: Set<string> = new Set();

  // Screenshot backoff scheduler
  private screenshotBackoffScheduler: ScreenshotBackoffScheduler | null = null;
  private cachedScreenDimensions: { width: number; height: number } | null = null;
  // Track whether the device supports accessibility service screenshots (API 30+).
  // null = unknown, true = supported, false = unsupported (fall back to ADB screencap).
  // Only marked unsupported after consecutive failures to avoid disabling on transient timeouts.
  private a11yScreenshotSupported: boolean | null = null;
  private a11yScreenshotFailures: number = 0;
  private static readonly A11Y_SCREENSHOT_MAX_FAILURES = 3;

  // Work profile monitor for polling profiles without accessibility service
  private workProfileMonitor: WorkProfileMonitor | null = null;

  // Track foreground package for crash monitoring
  private lastForegroundPackage: string | null = null;

  // Logging tag for base class
  protected readonly logTag = "ACCESSIBILITY_SERVICE";

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(
    device: BootedDevice,
    adb: AdbExecutor,
    webSocketFactory?: WebSocketFactory,
    timer?: Timer,
    installedAppsRepository?: InstalledAppsStore,
    retryExecutor?: RetryExecutor
  ) {
    super(timer ?? defaultTimer, webSocketFactory ?? defaultWebSocketFactory, {}, retryExecutor ?? defaultRetryExecutor);
    this.device = device;
    this.adb = adb;
    this.installedAppsRepository = installedAppsRepository ?? null;
    this.localPort = PortManager.allocate(device.deviceId);
    AndroidAccessibilityServiceManager.getInstance(device);
  }

  /**
   * Get singleton instance for a device
   */
  public static getInstance(device: BootedDevice, adbFactory: AdbClientFactory = defaultAdbClientFactory): AccessibilityServiceClient {
    const deviceId = device.deviceId;
    if (!AccessibilityServiceClient.instances.has(deviceId)) {
      logger.debug(`[ACCESSIBILITY_SERVICE] Creating singleton for device: ${deviceId}`);
      AccessibilityServiceClient.instances.set(
        deviceId,
        new AccessibilityServiceClient(device, adbFactory.create(device))
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
    PortManager.reset();
    logger.info("[ACCESSIBILITY_SERVICE] Reset all singleton instances and port allocations");
  }

  /**
   * Create instance for testing with custom WebSocket factory
   */
  public static createForTesting(
    device: BootedDevice,
    adb: AdbClient,
    webSocketFactory: (url: string) => WebSocket,
    timer?: Timer,
    installedAppsRepository?: InstalledAppsStore,
    retryExecutor?: RetryExecutor
  ): AccessibilityServiceClient {
    return new AccessibilityServiceClient(device, adb, webSocketFactory, timer, installedAppsRepository, retryExecutor);
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
      device: this.device,
      adb: this.adb,
      getCachedHierarchy: () => this.cachedHierarchy,
      setCachedHierarchy: h => { this.cachedHierarchy = h; },
      getLastWebSocketTimeout: () => this.lastWebSocketTimeout,
      setLastWebSocketTimeout: time => { this.lastWebSocketTimeout = time; },
    };
  }

  private createCertificatesDelegateContext(): CertificatesDelegateContext {
    return {
      ...this.createDelegateContext(),
      adb: this.adb,
    };
  }

  // ===========================================================================
  // Delegate Getters (lazy initialization)
  // ===========================================================================

  private get gestures(): AccessibilityServiceGestures {
    if (!this._gestures) {
      this._gestures = new AccessibilityServiceGestures(this.createDelegateContext());
    }
    return this._gestures;
  }

  private get text(): AccessibilityServiceText {
    if (!this._text) {
      this._text = new AccessibilityServiceText(this.createDelegateContext());
    }
    return this._text;
  }

  private get hierarchy(): AccessibilityServiceHierarchy {
    if (!this._hierarchy) {
      this._hierarchy = new AccessibilityServiceHierarchy(this.createHierarchyDelegateContext());
    }
    return this._hierarchy;
  }

  private get storage(): AccessibilityServiceStorage {
    if (!this._storage) {
      this._storage = new AccessibilityServiceStorage(this.createDelegateContext());
    }
    return this._storage;
  }

  private get certificates(): AccessibilityServiceCertificates {
    if (!this._certificates) {
      this._certificates = new AccessibilityServiceCertificates(this.createCertificatesDelegateContext());
    }
    return this._certificates;
  }

  private get focus(): AccessibilityServiceFocus {
    if (!this._focus) {
      this._focus = new AccessibilityServiceFocus(this.createDelegateContext());
    }
    return this._focus;
  }

  private get highlights(): AccessibilityServiceHighlights {
    if (!this._highlights) {
      this._highlights = new AccessibilityServiceHighlights(this.createDelegateContext());
    }
    return this._highlights;
  }

  // ===========================================================================
  // DeviceServiceClient abstract method implementations
  // ===========================================================================

  protected getWebSocketUrl(): string {
    return `ws://localhost:${this.localPort}/ws`;
  }

  protected async handleMessage(data: WebSocket.Data): Promise<void> {
    return this.handleWebSocketMessage(data);
  }

  protected onConnectionEstablished(): void {
    // No additional setup needed
  }

  protected onConnectionClosed(): void {
    void this.markInstalledAppsStale("websocket_closed");

    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.dispose();
      this.hierarchyNavigationDetector = null;
    }

    // Stop work profile monitor when connection closes
    this.stopWorkProfileMonitor();
  }

  protected async setupBeforeConnect(perf: PerformanceTracker): Promise<void> {
    await this.setupPortForwarding(perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Hierarchy
  // ===========================================================================

  async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    disableAllFiltering: boolean = false,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult | null> {
    return this.hierarchy.getAccessibilityHierarchy(queryOptions, perf, skipWaitForFresh, minTimestamp, disableAllFiltering, signal);
  }

  async setRecompositionTrackingEnabled(enabled: boolean, perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<void> {
    return this.hierarchy.setRecompositionTrackingEnabled(enabled, perf);
  }

  async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 100,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
  ): Promise<AccessibilityHierarchyResponse> {
    return this.hierarchy.getLatestHierarchy(waitForFresh, timeout, perf, skipWaitForFresh, minTimestamp, signal);
  }

  async requestHierarchySync(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    disableAllFiltering: boolean = false,
    signal?: AbortSignal,
    timeoutMs: number = 10000
  ): Promise<{ hierarchy: AccessibilityHierarchy; perfTiming?: AndroidPerfTiming[] } | null> {
    return this.hierarchy.requestHierarchySync(perf, disableAllFiltering, signal, timeoutMs);
  }

  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult {
    return this.hierarchy.convertToViewHierarchyResult(accessibilityHierarchy);
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

  async requestSwipe(
    x1: number, y1: number, x2: number, y2: number,
    duration: number = 300, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySwipeResult> {
    return this.gestures.requestSwipe(x1, y1, x2, y2, duration, timeoutMs, perf);
  }

  async requestTapCoordinates(
    x: number, y: number, duration: number = 10, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yTapCoordinatesResult> {
    return this.gestures.requestTapCoordinates(x, y, duration, timeoutMs, perf);
  }

  async requestTwoFingerSwipe(
    x1: number, y1: number, x2: number, y2: number,
    duration: number = 300, offset: number = 100, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySwipeResult> {
    return this.gestures.requestTwoFingerSwipe(x1, y1, x2, y2, duration, offset, timeoutMs, perf);
  }

  async requestDrag(
    x1: number, y1: number, x2: number, y2: number,
    pressDurationMs: number, dragDurationMs: number, holdDurationMs: number, timeoutMs: number
  ): Promise<A11yDragResult> {
    return this.gestures.requestDrag(x1, y1, x2, y2, pressDurationMs, dragDurationMs, holdDurationMs, timeoutMs);
  }

  async requestPinch(
    centerX: number, centerY: number,
    distanceStart: number, distanceEnd: number, rotationDegrees: number,
    duration: number = 300, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yPinchResult> {
    return this.gestures.requestPinch(centerX, centerY, distanceStart, distanceEnd, rotationDegrees, duration, timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Text
  // ===========================================================================

  async requestSetText(
    text: string, resourceId?: string, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySetTextResult> {
    return this.text.requestSetText(text, resourceId, timeoutMs, perf);
  }

  async requestClearText(
    resourceId?: string, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySetTextResult> {
    return this.text.requestClearText(resourceId, timeoutMs, perf);
  }

  async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yImeActionResult> {
    return this.text.requestImeAction(action, timeoutMs, perf);
  }

  async requestSelectAll(
    timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySelectAllResult> {
    return this.text.requestSelectAll(timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Certificates & Permissions
  // ===========================================================================

  async requestInstallCaCertificate(
    certificate: string, timeoutMs: number = 10000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    return this.certificates.requestInstallCaCertificate(certificate, timeoutMs, perf);
  }

  async requestInstallCaCertificateFromFile(
    certificatePath: string, timeoutMs: number = 10000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    return this.certificates.requestInstallCaCertificateFromFile(certificatePath, timeoutMs, perf);
  }

  async requestRemoveCaCertificate(
    alias: string, timeoutMs: number = 10000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    return this.certificates.requestRemoveCaCertificate(alias, timeoutMs, perf);
  }

  async requestDeviceOwnerStatus(
    timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yDeviceOwnerStatusResult> {
    return this.certificates.requestDeviceOwnerStatus(timeoutMs, perf);
  }

  async requestPermission(
    permission: string, requestPermission: boolean = true, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yPermissionResult> {
    return this.certificates.requestPermission(permission, requestPermission, timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Storage
  // ===========================================================================

  async listPreferenceFiles(packageName: string, timeoutMs: number = 5000): Promise<PreferenceFile[]> {
    return this.storage.listPreferenceFiles(packageName, timeoutMs);
  }

  async getPreferenceEntries(packageName: string, fileName: string, timeoutMs: number = 5000): Promise<KeyValueEntry[]> {
    return this.storage.getPreferenceEntries(packageName, fileName, timeoutMs);
  }

  async subscribeStorage(packageName: string, fileName: string, timeoutMs: number = 5000): Promise<StorageSubscription> {
    return this.storage.subscribeStorage(packageName, fileName, timeoutMs);
  }

  async unsubscribeStorage(subscriptionId: string, timeoutMs: number = 5000): Promise<void> {
    return this.storage.unsubscribeStorage(subscriptionId, timeoutMs);
  }

  addStorageChangeListener(callback: (event: StorageChangedEvent) => void): () => void {
    return this.storage.addStorageChangeListener(callback);
  }

  // ===========================================================================
  // Delegated Public Methods - Focus
  // ===========================================================================

  async clearAccessibilityFocus(): Promise<void> {
    return this.focus.clearAccessibilityFocus();
  }

  async setAccessibilityFocus(resourceId: string): Promise<void> {
    return this.focus.setAccessibilityFocus(resourceId);
  }

  async requestCurrentFocus(
    timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<CurrentFocusResult> {
    return this.focus.requestCurrentFocus(timeoutMs, perf);
  }

  async requestTraversalOrder(
    timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<TraversalOrderResult> {
    return this.focus.requestTraversalOrder(timeoutMs, perf);
  }

  // ===========================================================================
  // Delegated Public Methods - Highlights
  // ===========================================================================

  async requestAddHighlight(
    id: string, shape: HighlightShape, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<HighlightOperationResult> {
    return this.highlights.requestAddHighlight(id, shape, timeoutMs, perf);
  }

  // ===========================================================================
  // Non-delegated Public Methods
  // ===========================================================================

  async requestAction(
    action: string, resourceId?: string, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yActionResult> {
    const startTime = this.timer.now();

    this.cancelScreenshotBackoff();

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for action");
        return { success: false, action, totalTimeMs: this.timer.now() - startTime, error: "Failed to connect to accessibility service" };
      }

      const requestId = this.requestManager.generateId("action");
      logger.info(`[ACCESSIBILITY_SERVICE] Creating action request (requestId: ${requestId}, action: ${action}, resourceId: ${resourceId})`);

      const actionPromise = this.requestManager.register<A11yActionResult>(
        requestId, "action", timeoutMs,
        (_id, _type, timeout) => ({ success: false, action, totalTimeMs: this.timer.now() - startTime, error: `Action timeout after ${timeout}ms` })
      );

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "request_action", requestId, action, resourceId });
        this.ws.send(message);
        logger.info(`[ACCESSIBILITY_SERVICE] Sent action request (requestId: ${requestId}, action: ${action}, resourceId: ${resourceId})`);
      });

      const result = await perf.track("waitForAction", () => actionPromise);
      const clientDuration = this.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Action completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, action=${result.action}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Action failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Action request failed after ${duration}ms: ${error}`);
      return { success: false, action, totalTimeMs: duration, error: `${error}` };
    }
  }

  async requestClipboard(
    action: "copy" | "paste" | "clear" | "get", text?: string, timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yClipboardResult> {
    const startTime = this.timer.now();

    try {
      if (action === "copy" && !text) {
        return { success: false, action, totalTimeMs: this.timer.now() - startTime, error: "Text is required for copy action" };
      }

      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for clipboard");
        return { success: false, action, totalTimeMs: this.timer.now() - startTime, error: "Failed to connect to accessibility service" };
      }

      const requestId = this.requestManager.generateId("clipboard");

      const clipboardPromise = this.requestManager.register<A11yClipboardResult>(
        requestId, "clipboard", timeoutMs,
        (_id, _type, timeout) => ({ success: false, action, totalTimeMs: this.timer.now() - startTime, error: `Clipboard ${action} timeout after ${timeout}ms` })
      );

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "request_clipboard", requestId, action, text });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent clipboard request (requestId: ${requestId}, action: ${action})`);
      });

      const result = await perf.track("waitForClipboard", () => clipboardPromise);
      const clientDuration = this.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Clipboard ${action} completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Clipboard ${action} failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Clipboard request failed after ${duration}ms: ${error}`);
      return { success: false, action, totalTimeMs: duration, error: `${error}` };
    }
  }

  async requestScreenshot(timeoutMs: number = 5000, perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<ScreenshotResult> {
    const startTime = this.timer.now();

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for screenshot");
        return { success: false, error: "Failed to connect to accessibility service" };
      }

      const requestId = this.requestManager.generateId("screenshot");

      const screenshotPromise = this.requestManager.register<ScreenshotResult>(
        requestId, "screenshot", timeoutMs,
        (_id, _type, timeout) => ({ success: false, error: `Screenshot timeout after ${timeout}ms` })
      );

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "request_screenshot", requestId });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent screenshot request (requestId: ${requestId})`);
      });

      const result = await perf.track("waitForScreenshot", () => screenshotPromise);
      const duration = this.timer.now() - startTime;

      if (result.success) {
        const dataSize = result.data ? result.data.length : 0;
        logger.info(`[ACCESSIBILITY_SERVICE] Screenshot received in ${duration}ms (${dataSize} base64 chars)`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Screenshot failed after ${duration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Screenshot request failed after ${duration}ms: ${error}`);
      return { success: false, error: `${error}` };
    }
  }

  async verifyServiceReady(maxAttempts: number = 5, delayMs: number = 500, timeoutMs: number = 3000): Promise<boolean> {
    const result = await this.retryExecutor.execute(
      async attempt => {
        logger.info(`[ACCESSIBILITY_SERVICE] Verifying service ready (attempt ${attempt}/${maxAttempts})`);

        const hierarchyResult = await this.requestHierarchySync(new NoOpPerformanceTracker(), false, undefined, timeoutMs);

        if (hierarchyResult && hierarchyResult.hierarchy) {
          logger.info(`[ACCESSIBILITY_SERVICE] Service verified ready after ${attempt} attempt(s)`);
          return true;
        }

        throw new Error(`Verification attempt ${attempt} returned no hierarchy`);
      },
      {
        maxAttempts,
        delays: delayMs,
        onRetry: (error, attempt) => {
          logger.debug(`[ACCESSIBILITY_SERVICE] Verification attempt ${attempt} failed: ${error.message}`);
          logger.debug(`[ACCESSIBILITY_SERVICE] Waiting ${delayMs}ms before next verification attempt`);
        },
      }
    );

    if (!result.success) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Service not ready after ${maxAttempts} verification attempts`);
      return false;
    }

    return result.value ?? false;
  }

  // ===========================================================================
  // Event Listeners
  // ===========================================================================

  onInteraction(listener: (event: InteractionEvent) => void): () => void {
    this.interactionListeners.add(listener);
    return () => {
      this.interactionListeners.delete(listener);
    };
  }

  // ===========================================================================
  // Hierarchy Navigation Detector
  // ===========================================================================

  getHierarchyNavigationDetector(): HierarchyNavigationDetector {
    if (!this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector = new HierarchyNavigationDetector(
        NavigationGraphManager.getInstance(),
        { timer: this.timer }
      );

      this.hierarchyNavigationDetector.setNavigationCallback(info => {
        if (info.packageName && info.screenFingerprint) {
          const appId = info.packageName;
          const screenName = `screen_${info.screenFingerprint.substring(0, 12)}`;
          NavigationScreenshotManager.getInstance()
            .captureAndStore(this.device, this.adb, appId, screenName)
            .then(screenshotPath => {
              if (screenshotPath) {
                NavigationGraphManager.getInstance()
                  .updateNodeScreenshot(appId, screenName, screenshotPath)
                  .catch(err => logger.warn(`[ACCESSIBILITY_SERVICE] Failed to update hierarchy screenshot: ${err}`));
              }
            })
            .catch(err => logger.debug(`[ACCESSIBILITY_SERVICE] Hierarchy screenshot capture skipped: ${err}`));
        }
      });
    }
    return this.hierarchyNavigationDetector;
  }

  resetHierarchyNavigationDetector(): void {
    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.reset();
    }
  }

  // ===========================================================================
  // Screenshot Backoff
  // ===========================================================================

  cancelScreenshotBackoff(): void {
    if (this.screenshotBackoffScheduler) {
      this.screenshotBackoffScheduler.cancelPendingCaptures();
    }
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  async close(): Promise<void> {
    try {
      // Stop work profile monitor if running
      this.stopWorkProfileMonitor();

      await super.close();

      if (this.portForwardingSetup) {
        await this.adb.executeCommand(`forward --remove tcp:${this.localPort}`).catch(() => {});
        this.portForwardingSetup = false;
      }

      PortManager.release(this.device.deviceId);
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error during cleanup: ${error}`);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async setupPortForwarding(perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<void> {
    // Verify port forwarding is still active even if we think it's set up
    // Port forwarding can be lost if ADB server restarts or emulator restarts
    if (this.portForwardingSetup) {
      const isActive = await this.isPortForwardingActive();
      if (isActive) {
        logger.debug(`[ACCESSIBILITY_SERVICE] Port forwarding already active (localhost:${this.localPort})`);
        return;
      }
      logger.info(`[ACCESSIBILITY_SERVICE] Port forwarding was lost, re-establishing...`);
      this.portForwardingSetup = false;
    }

    try {
      logger.info(`[ACCESSIBILITY_SERVICE] Setting up port forwarding for WebSocket: localhost:${this.localPort} → device:${PortManager.DEVICE_PORT} (device: ${this.device.deviceId})`);

      await perf.track("clearPortForward", () =>
        this.adb.executeCommand(`forward --remove tcp:${this.localPort}`).catch(() => {})
      );

      await perf.track("setupPortForward", () =>
        this.adb.executeCommand(`forward tcp:${this.localPort} tcp:${PortManager.DEVICE_PORT}`)
      );

      this.portForwardingSetup = true;
      logger.info(`[ACCESSIBILITY_SERVICE] Port forwarding setup complete (localhost:${this.localPort})`);
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to setup port forwarding: ${error}`);
      throw error;
    }
  }

  /**
   * Check if port forwarding is still active by querying adb forward --list
   */
  private async isPortForwardingActive(): Promise<boolean> {
    try {
      const result = await this.adb.executeCommand("forward --list");
      const expectedForward = `tcp:${this.localPort} tcp:${PortManager.DEVICE_PORT}`;
      // Check if our port forward entry exists in the list
      // Format is: "serial tcp:localPort tcp:remotePort" per line
      const isActive = result.stdout.includes(expectedForward);
      if (!isActive) {
        logger.debug(`[ACCESSIBILITY_SERVICE] Port forwarding not found in active forwards. Expected: ${expectedForward}`);
      }
      return isActive;
    } catch (error) {
      logger.debug(`[ACCESSIBILITY_SERVICE] Failed to check port forwarding status: ${error}`);
      return false;
    }
  }

  private async handleWebSocketMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (message.type === "connected") {
        logger.debug(`[ACCESSIBILITY_SERVICE] Received connection confirmation`);
        return;
      }

      if (message.type === "hierarchy_update" && message.data) {
        this.handleHierarchyUpdate(message.data, (message as any).perfTiming);
      }

      // Handle screenshot response
      if (message.type === "screenshot" && message.requestId) {
        const base64Data = (message as any).data as string;
        this.pushScreenshotToObservationStream(base64Data);
        this.requestManager.resolve<ScreenshotResult>(message.requestId, {
          success: true, data: base64Data, format: message.format || "jpeg", timestamp: message.timestamp
        });
      }

      // Handle screenshot error
      if (message.type === "screenshot_error" && message.requestId) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Screenshot error (requestId: ${message.requestId}): ${message.error}`);
        this.requestManager.resolve<ScreenshotResult>(message.requestId, { success: false, error: message.error || "Unknown error" });
      }

      // Handle swipe result
      if (message.type === "swipe_result") {
        const swipeMessage = message as any;
        const perfTiming = swipeMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Swipe result (requestId: ${swipeMessage.requestId}, success: ${swipeMessage.success})`);

        if (swipeMessage.requestId) {
          this.requestManager.resolve<A11ySwipeResult>(swipeMessage.requestId, {
            success: swipeMessage.success, totalTimeMs: swipeMessage.totalTimeMs,
            gestureTimeMs: swipeMessage.gestureTimeMs, error: swipeMessage.error, perfTiming
          });
        }
      }

      // Handle tap coordinates result
      if (message.type === "tap_coordinates_result") {
        const tapMessage = message as any;
        const perfTiming = tapMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.info(`[ACCESSIBILITY_SERVICE] Tap coordinates result (requestId: ${tapMessage.requestId}, success: ${tapMessage.success})`);

        if (tapMessage.requestId) {
          this.requestManager.resolve<A11yTapCoordinatesResult>(tapMessage.requestId, {
            success: tapMessage.success, totalTimeMs: tapMessage.totalTimeMs, error: tapMessage.error, perfTiming
          });
        }
      }

      // Handle drag result
      if (message.type === "drag_result" && message.requestId) {
        const dragMessage = message as any;
        const perfTiming = dragMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yDragResult>(dragMessage.requestId, {
          success: dragMessage.success, totalTimeMs: dragMessage.totalTimeMs,
          gestureTimeMs: dragMessage.gestureTimeMs, error: dragMessage.error, perfTiming
        });
      }

      // Handle pinch result
      if (message.type === "pinch_result" && message.requestId) {
        const pinchMessage = message as any;
        const perfTiming = pinchMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yPinchResult>(pinchMessage.requestId, {
          success: pinchMessage.success, totalTimeMs: pinchMessage.totalTimeMs,
          gestureTimeMs: pinchMessage.gestureTimeMs, error: pinchMessage.error, perfTiming
        });
      }

      // Handle set text result
      if (message.type === "set_text_result" && message.requestId) {
        const setTextMessage = message as any;
        const perfTiming = setTextMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11ySetTextResult>(setTextMessage.requestId, {
          success: setTextMessage.success, totalTimeMs: setTextMessage.totalTimeMs, error: setTextMessage.error, perfTiming
        });
      }

      // Handle IME action result
      if (message.type === "ime_action_result" && message.requestId) {
        const imeActionMessage = message as any;
        const perfTiming = imeActionMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yImeActionResult>(imeActionMessage.requestId, {
          success: imeActionMessage.success, action: imeActionMessage.action,
          totalTimeMs: imeActionMessage.totalTimeMs, error: imeActionMessage.error, perfTiming
        });
      }

      // Handle select all result
      if (message.type === "select_all_result" && message.requestId) {
        const selectAllMessage = message as any;
        const perfTiming = selectAllMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11ySelectAllResult>(selectAllMessage.requestId, {
          success: selectAllMessage.success, totalTimeMs: selectAllMessage.totalTimeMs, error: selectAllMessage.error, perfTiming
        });
      }

      // Handle action result
      if (message.type === "action_result" && message.requestId) {
        const actionMessage = message as any;
        const perfTiming = actionMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yActionResult>(actionMessage.requestId, {
          success: actionMessage.success, action: actionMessage.action,
          totalTimeMs: actionMessage.totalTimeMs, error: actionMessage.error, perfTiming
        });
      }

      // Handle clipboard result
      if (message.type === "clipboard_result" && message.requestId) {
        const clipboardMessage = message as any;
        const perfTiming = clipboardMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yClipboardResult>(clipboardMessage.requestId, {
          success: clipboardMessage.success, action: clipboardMessage.action, text: clipboardMessage.text,
          totalTimeMs: clipboardMessage.totalTimeMs, error: clipboardMessage.error, perfTiming
        });
      }

      // Handle CA certificate result
      if (message.type === "ca_cert_result" && message.requestId) {
        const caCertMessage = message as any;
        const perfTiming = caCertMessage.perfTiming as AndroidPerfTiming[] | undefined;

        // Try delegate handler first (for remove)
        if (!this.certificates.handleCaCertRemovalResult(message.requestId, {
          success: caCertMessage.success, action: caCertMessage.action, alias: caCertMessage.alias,
          totalTimeMs: caCertMessage.totalTimeMs, error: caCertMessage.error, perfTiming
        })) {
          // Fall back to RequestManager (for install)
          this.requestManager.resolve<A11yCaCertResult>(message.requestId, {
            success: caCertMessage.success, action: caCertMessage.action, alias: caCertMessage.alias,
            totalTimeMs: caCertMessage.totalTimeMs, error: caCertMessage.error, perfTiming
          });
        }
      }

      // Handle device owner status result
      if (message.type === "device_owner_status_result" && message.requestId) {
        const statusMessage = message as any;
        const perfTiming = statusMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yDeviceOwnerStatusResult>(statusMessage.requestId, {
          success: statusMessage.success, isDeviceOwner: statusMessage.isDeviceOwner ?? false,
          isAdminActive: statusMessage.isAdminActive ?? false, packageName: statusMessage.packageName,
          totalTimeMs: statusMessage.totalTimeMs, error: statusMessage.error, perfTiming
        });
      }

      // Handle permission result
      if (message.type === "permission_result" && message.requestId) {
        const permissionMessage = message as any;
        const perfTiming = permissionMessage.perfTiming as AndroidPerfTiming[] | undefined;
        this.requestManager.resolve<A11yPermissionResult>(permissionMessage.requestId, {
          success: permissionMessage.success ?? false, permission: permissionMessage.permission ?? "unknown",
          granted: permissionMessage.granted ?? false, totalTimeMs: permissionMessage.totalTimeMs ?? 0,
          requestLaunched: permissionMessage.requestLaunched ?? false, canRequest: permissionMessage.canRequest ?? false,
          requiresSettings: permissionMessage.requiresSettings ?? false, instructions: permissionMessage.instructions,
          adbCommand: permissionMessage.adbCommand, error: permissionMessage.error, perfTiming
        });
      }

      // Handle current focus result
      if (message.type === "current_focus_result" && message.requestId) {
        const focusMessage = message as any;
        const focusedElement = focusMessage.focusedElement
          ? this.focus.convertAccessibilityNodeToElement(focusMessage.focusedElement)
          : null;

        this.requestManager.resolve<CurrentFocusResult>(focusMessage.requestId, {
          focusedElement, totalTimeMs: focusMessage.totalTimeMs,
          requestId: focusMessage.requestId, error: focusMessage.error
        });
      }

      // Handle traversal order result
      if (message.type === "traversal_order_result" && message.requestId) {
        const traversalMessage = message as any;
        const result = traversalMessage.result;

        if (result && result.elements) {
          const elements = result.elements.map((node: any) =>
            this.focus.convertAccessibilityNodeToElement(node)
          );

          this.requestManager.resolve<TraversalOrderResult>(traversalMessage.requestId, {
            elements, focusedIndex: result.focusedIndex, totalCount: result.totalCount,
            totalTimeMs: traversalMessage.totalTimeMs, requestId: traversalMessage.requestId, error: traversalMessage.error
          });
        } else {
          this.requestManager.resolve<TraversalOrderResult>(traversalMessage.requestId, {
            elements: [], focusedIndex: null, totalCount: 0,
            totalTimeMs: traversalMessage.totalTimeMs, requestId: traversalMessage.requestId, error: traversalMessage.error || "No result data"
          });
        }
      }

      // Handle highlight response
      if (message.type === "highlight_response" && message.requestId) {
        const highlightMessage = message as any;
        this.requestManager.resolve<HighlightOperationResult>(highlightMessage.requestId, {
          success: highlightMessage.success ?? false, error: highlightMessage.error,
          requestId: highlightMessage.requestId, timestamp: highlightMessage.timestamp
        });
      }

      // Handle storage result messages
      // Note: Android sends "preference_files" but we register with "list_preference_files"
      if (message.type === "preference_files" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, files: storageMessage.files || [],
          totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      // Note: Android sends "preferences" but we register with "get_preferences"
      if (message.type === "preferences" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, entries: storageMessage.entries || [],
          totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      if (message.type === "subscribe_storage_result" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, subscription: storageMessage.subscription,
          totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      if (message.type === "unsubscribe_storage_result" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      if (message.type === "get_preference_result" && message.requestId) {
        const storageMessage = message as any;
        // Build entry from key/value/type fields (Android sends flat structure, not nested entry)
        const entry = storageMessage.found && storageMessage.key ? {
          key: storageMessage.key,
          value: storageMessage.value,
          type: storageMessage.type
        } : undefined;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, found: storageMessage.found ?? false,
          entry, totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      if (message.type === "set_preference_result" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      if (message.type === "remove_preference_result" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      if (message.type === "clear_preferences_result" && message.requestId) {
        const storageMessage = message as any;
        this.requestManager.resolve(message.requestId, {
          success: storageMessage.success ?? false, totalTimeMs: storageMessage.totalTimeMs ?? 0, error: storageMessage.error
        });
      }

      // Handle navigation event
      if (message.type === "navigation_event") {
        const navMessage = message as any;
        const event = navMessage.event as NavigationEvent;
        if (event) {
          // The WebSocket protocol puts timestamp on the outer message, not inside event.
          // Ensure the event has a timestamp for the navigation graph manager.
          if (event.timestamp === undefined && navMessage.timestamp !== undefined) {
            event.timestamp = navMessage.timestamp;
          }
          if (event.applicationId) {
            this.sdkNavigationAppIds.add(event.applicationId);
          }
          logger.info(`[ACCESSIBILITY_SERVICE] Navigation event: ${event.destination} (app: ${event.applicationId})`);
          await NavigationGraphManager.getInstance().recordNavigationEvent(event);

          if (event.applicationId && event.destination) {
            NavigationScreenshotManager.getInstance()
              .captureAndStore(this.device, this.adb, event.applicationId, event.destination)
              .then(screenshotPath => {
                if (screenshotPath) {
                  NavigationGraphManager.getInstance()
                    .updateNodeScreenshot(event.applicationId!, event.destination!, screenshotPath)
                    .catch(err => logger.warn(`[ACCESSIBILITY_SERVICE] Failed to update screenshot: ${err}`));
                }
              })
              .catch(err => logger.debug(`[ACCESSIBILITY_SERVICE] Screenshot capture skipped: ${err}`));
          }
        }
      }

      if (message.type === "package_event") {
        const packageMessage = message as any;
        const event = packageMessage.event as PackageEvent | undefined;
        if (event) {
          await this.handlePackageEvent(event, message.timestamp);
        }
      }

      if (message.type === "interaction_event") {
        const interactionMessage = message as any;
        const interaction = interactionMessage.event as InteractionEvent | undefined;
        if (interaction) {
          this.notifyInteractionListeners(interaction);
        }
      }

      if (message.type === "handled_exception_event") {
        const exceptionMessage = message as any;
        const event = exceptionMessage.event as HandledExceptionEvent | undefined;
        if (event) {
          await this.handleHandledExceptionEvent(event);
        }
      }

      if (message.type === "crash_event") {
        const crashMessage = message as any;
        const event = crashMessage.event as CrashEvent | undefined;
        if (event) {
          await this.handleCrashEvent(event);
        }
      }

      if (message.type === "anr_event") {
        const anrMessage = message as any;
        const event = anrMessage.event as AnrEvent | undefined;
        if (event) {
          await this.handleAnrEvent(event);
        }
      }

      // Handle storage_changed push event
      if (message.type === "storage_changed") {
        const storageMessage = message as any;
        const event: StorageChangedEvent = {
          packageName: storageMessage.packageName, fileName: storageMessage.fileName,
          key: storageMessage.key ?? null, value: storageMessage.value ?? null,
          valueType: storageMessage.valueType ?? "STRING", timestamp: storageMessage.timestamp ?? this.timer.now(),
          sequenceNumber: storageMessage.sequenceNumber ?? 0,
        };
        logger.debug(`[ACCESSIBILITY_SERVICE] Storage changed: ${event.packageName}/${event.fileName} key=${event.key}`);

        this.storage.notifyStorageChangeListeners(event);

        const server = getDeviceDataStreamServer();
        if (server) {
          server.pushStorageUpdate(this.device.deviceId, event);
        }
      }
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error handling WebSocket message: ${error}`);
    }
  }

  private handleHierarchyUpdate(data: AccessibilityHierarchy, perfTiming?: AndroidPerfTiming[]): void {
    const now = this.timer.now();
    logger.debug(`[ACCESSIBILITY_SERVICE] Received hierarchy update (updatedAt: ${data.updatedAt})`);

    // Mark previous cache as stale
    if (this.cachedHierarchy) {
      this.cachedHierarchy.fresh = false;
    }

    // Update cache with fresh data
    this.cachedHierarchy = {
      hierarchy: data,
      receivedAt: now,
      fresh: true,
      perfTiming
    };

    // Update cached screen dimensions
    this.updateCachedScreenDimensions(data);

    // Push to observation stream
    this.pushHierarchyToObservationStream(data);

    // Start screenshot backoff
    this.startScreenshotBackoff();

    // Track foreground package for context and start performance monitoring
    if (data.packageName && data.packageName !== this.lastForegroundPackage) {
      this.lastForegroundPackage = data.packageName;
      // Start performance monitoring for this device/package
      const monitor = getPerformanceMonitor();
      monitor.startMonitoring(this.device.deviceId, data.packageName);
    }

    // Notify hierarchy navigation detector
    if (!data.hierarchy) {
      logger.warn("[ACCESSIBILITY_SERVICE] Skipping navigation detection: hierarchy missing");
    } else if (data.error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Skipping navigation detection due to error: ${data.error}`);
    } else if (!this.shouldUseHierarchyNavigation(data.packageName)) {
      logger.debug(`[ACCESSIBILITY_SERVICE] Skipping hierarchy navigation for SDK app: ${data.packageName}`);
    } else {
      this.getHierarchyNavigationDetector().onHierarchyUpdate(data);
    }
  }

  private shouldUseHierarchyNavigation(packageName?: string): boolean {
    if (!packageName) {
      return true;
    }
    return !this.sdkNavigationAppIds.has(packageName);
  }

  private pushHierarchyToObservationStream(hierarchy: ViewHierarchyResult): void {
    const server = getDeviceDataStreamServer();
    if (!server) {
      return;
    }

    try {
      server.pushHierarchyUpdate(this.device.deviceId, hierarchy);
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to push hierarchy to observation stream: ${error}`);
    }
  }

  private pushScreenshotToObservationStream(screenshotBase64: string): void {
    const server = getDeviceDataStreamServer();
    if (!server) {
      return;
    }

    const screenWidth = this.cachedScreenDimensions?.width ?? 1080;
    const screenHeight = this.cachedScreenDimensions?.height ?? 2340;

    try {
      server.pushScreenshotUpdate(this.device.deviceId, screenshotBase64, screenWidth, screenHeight);
    } catch (error) {
      logger.debug(`[ACCESSIBILITY_SERVICE] Failed to push screenshot to observation stream: ${error}`);
    }
  }

  private updateCachedScreenDimensions(hierarchy: ViewHierarchyResult): void {
    const windows = hierarchy.windows;
    if (!windows || windows.length === 0) {
      return;
    }

    let maxArea = 0;
    let bestDimensions: { width: number; height: number } | null = null;

    for (const window of windows) {
      if (window.bounds) {
        const width = window.bounds.right - window.bounds.left;
        const height = window.bounds.bottom - window.bounds.top;
        const area = width * height;
        if (area > maxArea) {
          maxArea = area;
          bestDimensions = { width, height };
        }
      }
    }

    if (bestDimensions && (bestDimensions.width !== this.cachedScreenDimensions?.width ||
        bestDimensions.height !== this.cachedScreenDimensions?.height)) {
      this.cachedScreenDimensions = bestDimensions;
    }
  }

  private getScreenshotBackoffScheduler(): ScreenshotBackoffScheduler {
    if (!this.screenshotBackoffScheduler) {
      this.screenshotBackoffScheduler = new DefaultScreenshotBackoffScheduler(
        async (): Promise<ScreenshotCaptureResult> => {
          return this.captureScreenshotForBackoff();
        },
        (data: string) => {
          this.pushScreenshotToObservationStream(data);
        },
        { intervals: [0, 100, 300, 500, 800, 1300] },
        this.timer
      );
    }
    return this.screenshotBackoffScheduler;
  }

  private async captureScreenshotForBackoff(): Promise<ScreenshotCaptureResult> {
    const server = getDeviceDataStreamServer();
    if (!server || server.getSubscriberCount() === 0) {
      return { success: false, error: "No subscribers" };
    }

    // If we know the device doesn't support a11y screenshots, go straight to ADB fallback
    if (this.a11yScreenshotSupported === false) {
      return this.captureScreenshotViaAdb();
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return this.captureScreenshotViaAdb();
    }

    const requestId = this.requestManager.generateId("screenshot-backoff");
    const message = JSON.stringify({ type: "request_screenshot", requestId });

    try {
      const screenshotPromise = this.requestManager.register<ScreenshotResult>(
        requestId, "screenshot", 3000,
        (_id, _type, _timeout) => ({ success: false, error: "Screenshot timeout" })
      );

      this.ws.send(message);

      const result = await screenshotPromise;

      if (!result.success || !result.data) {
        this.a11yScreenshotFailures++;
        if (this.a11yScreenshotSupported === null &&
            this.a11yScreenshotFailures >= AccessibilityServiceClient.A11Y_SCREENSHOT_MAX_FAILURES) {
          logger.info("[ACCESSIBILITY_SERVICE] Accessibility service screenshot not supported after " +
            `${this.a11yScreenshotFailures} consecutive failures, falling back to ADB screencap`);
          this.a11yScreenshotSupported = false;
        }
        return this.captureScreenshotViaAdb();
      }

      this.a11yScreenshotFailures = 0;
      this.a11yScreenshotSupported = true;
      const checksum = computeChecksum(result.data);

      return { success: true, data: result.data, checksum };
    } catch (error) {
      return this.captureScreenshotViaAdb();
    }
  }

  /**
   * Fallback screenshot capture via ADB screencap for devices that don't support
   * accessibility service screenshots (API < 30).
   */
  private async captureScreenshotViaAdb(): Promise<ScreenshotCaptureResult> {
    try {
      const tempFile = "/sdcard/screenshot_stream.png";
      const command = `shell "screencap -p ${tempFile} && base64 ${tempFile} && rm ${tempFile}"`;
      const maxBuffer = 50 * 1024 * 1024;
      const result = await this.adb.executeCommand(command, undefined, maxBuffer);

      if (!result.stdout || result.stdout.trim().length === 0) {
        return { success: false, error: "No data from ADB screencap" };
      }

      const data = result.stdout.replace(/[\r\n]/g, "");
      const checksum = computeChecksum(data);

      return { success: true, data, checksum };
    } catch (error) {
      return { success: false, error: `ADB screencap failed: ${error}` };
    }
  }

  private startScreenshotBackoff(): void {
    const server = getDeviceDataStreamServer();
    if (!server || server.getSubscriberCount() === 0) {
      return;
    }

    const scheduler = this.getScreenshotBackoffScheduler();
    scheduler.startBackoffSequence();
  }

  private notifyInteractionListeners(event: InteractionEvent): void {
    for (const listener of this.interactionListeners) {
      try {
        listener(event);
      } catch (error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Interaction listener error: ${error}`);
      }
    }
  }

  private getInstalledAppsRepository(): InstalledAppsStore {
    if (!this.installedAppsRepository) {
      this.installedAppsRepository = new InstalledAppsRepository();
    }
    return this.installedAppsRepository;
  }

  /**
   * Get or create the work profile monitor for polling profiles without accessibility service
   */
  getWorkProfileMonitor(): WorkProfileMonitor {
    if (!this.workProfileMonitor) {
      this.workProfileMonitor = new DefaultWorkProfileMonitor({
        deviceId: this.device.deviceId,
        adb: this.adb,
        installedAppsStore: this.getInstalledAppsRepository(),
        timer: this.timer
      });
    }
    return this.workProfileMonitor;
  }

  /**
   * Start the work profile monitor to poll profiles without accessibility service
   */
  startWorkProfileMonitor(): void {
    this.getWorkProfileMonitor().start();
  }

  /**
   * Stop the work profile monitor
   */
  stopWorkProfileMonitor(): void {
    if (this.workProfileMonitor) {
      this.workProfileMonitor.stop();
    }
  }

  private async handlePackageEvent(event: PackageEvent, timestamp?: number): Promise<void> {
    if (this.device.platform !== "android") {
      return;
    }

    if (!event.packageName || !Number.isInteger(event.userId) || event.userId < 0) {
      logger.warn("[ACCESSIBILITY_SERVICE] Ignoring package event with missing data");
      return;
    }

    const deviceId = this.device.deviceId;
    const eventTimestamp = typeof timestamp === "number" ? timestamp : this.timer.now();
    const repo = this.getInstalledAppsRepository();

    try {
      if (event.action === "removed") {
        if (event.removedForAllUsers) {
          await repo.removeInstalledAppForDevice(deviceId, event.packageName);
        } else {
          await repo.removeInstalledApp(deviceId, event.userId, event.packageName);
        }
      } else {
        const isSystem = event.isSystem === true;
        await repo.upsertInstalledApp(deviceId, event.userId, event.packageName, isSystem, eventTimestamp);
      }

      // Notify work profile monitor that this user has accessibility service
      // (if we're receiving package events, the service is working for this user)
      if (event.userId > 0 && this.workProfileMonitor) {
        this.workProfileMonitor.setProfileHasAccessibilityService(event.userId, true);
      }
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to apply package event: ${error}`);
    }
  }

  private async handleHandledExceptionEvent(event: HandledExceptionEvent): Promise<void> {
    logger.info(`[ACCESSIBILITY_SERVICE] Received handled exception: ${event.exceptionClass} from ${event.packageName}`);

    try {
      const failureRecorder = getFailureRecorder();
      const stackTraceElements = this.parseStackTrace(event.stackTrace, event.packageName);

      let currentScreen = event.currentScreen;
      if (!currentScreen) {
        try {
          const navManager = NavigationGraphManager.getInstance();
          currentScreen = navManager.getCurrentScreen() ?? undefined;
        } catch {
          // Continue without screen
        }
      }

      const nonFatalInput = {
        exceptionType: event.exceptionClass,
        exceptionMessage: event.exceptionMessage ?? "Handled exception",
        stackTrace: stackTraceElements,
        customMessage: event.customMessage,
        deviceId: this.device.deviceId,
        deviceModel: event.deviceInfo.model,
        os: `Android ${event.deviceInfo.osVersion} (API ${event.deviceInfo.sdkInt})`,
        appVersion: event.appVersion ?? "unknown",
        sessionId: `handled-${event.packageName}-${this.timer.now()}`,
        currentScreen,
      };

      const occurrenceId = await failureRecorder.recordNonFatal(nonFatalInput);
      logger.info(`[ACCESSIBILITY_SERVICE] Recorded non-fatal exception: ${occurrenceId}`);
    } catch (error) {
      logger.error(`[ACCESSIBILITY_SERVICE] Failed to record handled exception: ${error}`);
    }
  }

  private async handleCrashEvent(event: CrashEvent): Promise<void> {
    logger.info(`[ACCESSIBILITY_SERVICE] Received crash: ${event.exceptionClass} on thread ${event.threadName} from ${event.packageName}`);

    try {
      const failureRecorder = getFailureRecorder();
      const stackTraceElements = this.parseStackTrace(event.stackTrace, event.packageName);

      let currentScreen = event.currentScreen;
      if (!currentScreen) {
        try {
          const navManager = NavigationGraphManager.getInstance();
          currentScreen = navManager.getCurrentScreen() ?? undefined;
        } catch {
          // Continue without screen
        }
      }

      const crashInput = {
        exceptionType: event.exceptionClass,
        exceptionMessage: event.message ?? "Application crashed",
        stackTrace: stackTraceElements,
        threadName: event.threadName,
        deviceId: this.device.deviceId,
        deviceModel: event.deviceInfo.model,
        os: `Android ${event.deviceInfo.osVersion} (API ${event.deviceInfo.sdkInt})`,
        appVersion: event.appVersion ?? "unknown",
        sessionId: `crash-${event.packageName}-${this.timer.now()}`,
        currentScreen,
      };

      const occurrenceId = await failureRecorder.recordCrash(crashInput);
      logger.info(`[ACCESSIBILITY_SERVICE] Recorded crash: ${occurrenceId}`);
    } catch (error) {
      logger.error(`[ACCESSIBILITY_SERVICE] Failed to record crash: ${error}`);
    }
  }

  private async handleAnrEvent(event: AnrEvent): Promise<void> {
    logger.info(`[ACCESSIBILITY_SERVICE] Received ANR: pid=${event.pid}, process=${event.processName}, importance=${event.importance}`);

    try {
      const failureRecorder = getFailureRecorder();
      const packageName = event.packageName ?? event.processName;

      // Parse stack trace if available
      const stackTraceElements = event.trace
        ? this.parseStackTrace(event.trace, packageName)
        : [];

      let currentScreen: string | undefined;
      try {
        const navManager = NavigationGraphManager.getInstance();
        currentScreen = navManager.getCurrentScreen() ?? undefined;
      } catch {
        // Continue without screen
      }

      const anrInput = {
        reason: event.reason,
        stackTrace: stackTraceElements.length > 0 ? stackTraceElements : undefined,
        deviceId: this.device.deviceId,
        deviceModel: event.deviceInfo.model,
        os: `Android ${event.deviceInfo.osVersion} (API ${event.deviceInfo.sdkInt})`,
        appVersion: event.appVersion ?? "unknown",
        sessionId: `anr-${packageName}-${this.timer.now()}`,
        currentScreen,
      };

      const occurrenceId = await failureRecorder.recordAnr(anrInput);
      logger.info(`[ACCESSIBILITY_SERVICE] Recorded ANR: ${occurrenceId}`);
    } catch (error) {
      logger.error(`[ACCESSIBILITY_SERVICE] Failed to record ANR: ${error}`);
    }
  }

  private parseStackTrace(stackTrace: string, packageName: string): StackTraceElement[] {
    const elements: StackTraceElement[] = [];
    const lines = stackTrace.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^at\s+([a-zA-Z0-9$_.]+)\.([a-zA-Z0-9$_<>]+)\(([^:)]+):?(\d+)?\)$/);
      if (match) {
        const [, fullClassName, methodName, fileName, lineNumberStr] = match;
        const lineNumber = lineNumberStr ? parseInt(lineNumberStr, 10) : undefined;

        const isAppCode = fullClassName.startsWith(packageName) ||
          fullClassName.includes(packageName.split(".").slice(0, 2).join("."));

        elements.push({
          className: fullClassName,
          methodName,
          fileName: fileName || undefined,
          lineNumber,
          isAppCode,
        });
      }
    }

    return elements;
  }

  private async markInstalledAppsStale(reason: string): Promise<void> {
    if (this.device.platform !== "android") {
      return;
    }

    try {
      await this.getInstalledAppsRepository().markDeviceStale(this.device.deviceId);
      logger.info(`[ACCESSIBILITY_SERVICE] Marked installed apps cache stale (${reason})`);
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to mark installed apps stale: ${error}`);
    }
  }
}
