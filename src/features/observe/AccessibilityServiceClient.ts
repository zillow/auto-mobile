import WebSocket from "ws";
import fs from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "crypto";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import {
  BootedDevice,
  RecompositionNodeInfo,
  ViewHierarchyResult,
  CurrentFocusResult,
  TraversalOrderResult,
  Element,
  HighlightEntry,
  HighlightOperationResult,
  HighlightShape
} from "../../models";
import { ViewHierarchyQueryOptions } from "../../models/ViewHierarchyQueryOptions";
import { AndroidAccessibilityServiceManager } from "../../utils/AccessibilityServiceManager";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { NavigationGraphManager, NavigationEvent } from "../navigation/NavigationGraphManager";
import { HierarchyNavigationDetector } from "../navigation/HierarchyNavigationDetector";
import { throwIfAborted } from "../../utils/toolUtils";
import { ElementParser } from "../utility/ElementParser";

/**
 * Generate a cryptographically secure random suffix for request IDs.
 * Uses crypto.randomBytes which is much more secure than Math.random().
 * @returns 8-character hex string
 */
function generateSecureId(): string {
  return randomBytes(4).toString("hex");
}

const quoteForAdbArg = (value: string): string => {
  const escaped = value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
  return `"${escaped}"`;
};

/**
 * Interface for accessibility service node format
 */
interface AccessibilityNode {
    text?: string;
    "content-desc"?: string;
    "resource-id"?: string;
    "test-tag"?: string;
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
  occlusionState?: string;
  occludedBy?: string;
  extras?: Record<string, string>;
  recomposition?: RecompositionNodeInfo;
  node?: AccessibilityNode | AccessibilityNode[];
}

export interface AccessibilityHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: AccessibilityNode;
  intentChooserDetected?: boolean;
  notificationPermissionDetected?: boolean;
  error?: string;
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
  event?: InteractionEvent;
  highlights?: HighlightEntry[];
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
 * Interface for Android-side performance timing data
 */
export interface AndroidPerfTiming {
  name: string;
  durationMs: number;
  children?: AndroidPerfTiming[];
}

/**
 * Interface for swipe result from accessibility service
 */
export interface A11ySwipeResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for tap coordinates result from accessibility service
 */
export interface A11yTapCoordinatesResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for drag result from accessibility service
 */
export interface A11yDragResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for pinch result from accessibility service
 */
export interface A11yPinchResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for set text result from accessibility service
 */
export interface A11ySetTextResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for IME action result from accessibility service
 */
export interface A11yImeActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for select all result from accessibility service
 */
export interface A11ySelectAllResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for accessibility action result
 */
export interface A11yActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for clipboard operation result from accessibility service
 */
export interface A11yClipboardResult {
  success: boolean;
  action: "copy" | "paste" | "clear" | "get";
  text?: string; // For 'get' action, the clipboard content
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for CA certificate result from accessibility service
 */
export interface A11yCaCertResult {
  success: boolean;
  action: "install" | "remove";
  alias?: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for device owner status result from accessibility service
 */
export interface A11yDeviceOwnerStatusResult {
  success: boolean;
  isDeviceOwner: boolean;
  isAdminActive: boolean;
  packageName?: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for permission status result from accessibility service
 */
export interface A11yPermissionResult {
  success: boolean;
  permission: string;
  granted: boolean;
  totalTimeMs: number;
  requestLaunched: boolean;
  canRequest: boolean;
  requiresSettings: boolean;
  instructions?: string;
  adbCommand?: string;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

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
 * Interface for cached hierarchy with metadata
 */
interface CachedHierarchy {
  hierarchy: AccessibilityHierarchy;
  receivedAt: number;
  fresh: boolean;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for hierarchy response with freshness indicator
 */
export interface AccessibilityHierarchyResponse {
  hierarchy: AccessibilityHierarchy | null;
  fresh: boolean;
  updatedAt?: number; // Timestamp from device (only present when hierarchy data exists)
  perfTiming?: AndroidPerfTiming[]; // Android-side performance timing data
}

/**
 * Interface for accessibility service providing Android UI hierarchy and interaction capabilities
 * via WebSocket connection to Android device accessibility service
 */
export interface AccessibilityService {
  /**
   * Get view hierarchy from accessibility service
   * This is the main entry point for getting hierarchy data from the accessibility service
   *
   * @param queryOptions - Optional options to filter the view hierarchy
   * @param perf - Optional performance tracker for timing measurements
   * @param skipWaitForFresh - If true, skip WebSocket wait and go straight to sync method
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value to be considered fresh
   * @param disableAllFiltering - If true, disable all filtering and optimizations (for rawViewHierarchy)
   * @returns Promise<ViewHierarchyResult | null> - The converted hierarchy or null if service unavailable
   */
  getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    disableAllFiltering?: boolean
  ): Promise<ViewHierarchyResult | null>;

  /**
   * Enable or disable recomposition tracking on the accessibility service.
   */
  setRecompositionTrackingEnabled(
    enabled: boolean,
    perf?: PerformanceTracker
  ): Promise<void>;

  /**
   * Get the latest hierarchy from cache or wait for fresh data
   * Combines WebSocket push data with ADB sync fallback for reliable data retrieval
   *
   * @param waitForFresh - If true, wait up to timeout for fresh data
   * @param timeout - Maximum time to wait for fresh data in milliseconds
   * @param perf - Optional performance tracker for timing
   * @param skipWaitForFresh - If true, skip waiting for fresh data entirely
   * @param minTimestamp - If provided, cached data must have updatedAt >= this value
   * @returns Promise<AccessibilityHierarchyResponse> - Hierarchy response with freshness indicator
   */
  getLatestHierarchy(
    waitForFresh?: boolean,
    timeout?: number,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number
  ): Promise<AccessibilityHierarchyResponse>;

  /**
   * Request hierarchy synchronously via WebSocket message
   * Triggers extraction on device which pushes result via WebSocket
   * Falls back to ADB broadcast if WebSocket send fails
   *
   * @param perf - Optional performance tracker for timing
   * @param disableAllFiltering - If true, disable all filtering and optimizations
   * @returns Promise with hierarchy and perfTiming, or null if failed
   */
  requestHierarchySync(
    perf?: PerformanceTracker,
    disableAllFiltering?: boolean,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<{ hierarchy: AccessibilityHierarchy; perfTiming?: AndroidPerfTiming[] } | null>;

  /**
   * Convert accessibility service hierarchy format to ViewHierarchyResult format
   * Transforms internal AccessibilityHierarchy format to the expected ViewHierarchyResult
   *
   * @param accessibilityHierarchy - The accessibility service hierarchy data
   * @returns ViewHierarchyResult - Converted hierarchy in the expected format
   */
  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult;

  /**
   * Request a swipe gesture from the accessibility service using dispatchGesture API
   * This is significantly faster than ADB's input swipe command
   *
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Swipe duration in milliseconds (default: 300)
   * @param timeoutMs - Maximum time to wait for swipe completion in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11ySwipeResult> - The swipe result with timing information
   */
  requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11ySwipeResult>;

  /**
   * Request a pinch gesture from the accessibility service using dispatchGesture API.
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param distanceStart - Starting distance between fingers in pixels
   * @param distanceEnd - Ending distance between fingers in pixels
   * @param rotationDegrees - Rotation in degrees during gesture
   * @param duration - Gesture duration in milliseconds (default: 300)
   * @param timeoutMs - Maximum time to wait for pinch completion in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11yPinchResult> - The pinch result with timing information
   */
  requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yPinchResult>;

  /**
   * Request text input via the accessibility service using ACTION_SET_TEXT
   * This is significantly faster than ADB's input text command because it
   * bypasses the entire ADB/shell overhead and directly sets text on the focused input field
   *
   * @param text - The text to input
   * @param resourceId - Optional resource-id to target a specific element (otherwise uses focused element)
   * @param timeoutMs - Maximum time to wait for text input in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11ySetTextResult> - The text input result with timing information
   */
  requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11ySetTextResult>;

  /**
   * Clear text from the currently focused input field via the accessibility service
   * This uses ACTION_SET_TEXT with an empty string, which is significantly faster
   * than sending multiple KEYCODE_DEL events via ADB
   *
   * @param resourceId - Optional resource-id to target a specific element (otherwise uses focused element)
   * @param timeoutMs - Maximum time to wait for clear operation in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11ySetTextResult> - The clear result with timing information
   */
  requestClearText(
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11ySetTextResult>;

  /**
   * Request an IME action via the accessibility service
   * This properly handles focus movement (next/previous) by finding the next/previous
   * focusable element and calling ACTION_FOCUS, rather than using KEYCODE_TAB
   * which would insert a tab character.
   * For done/go/send/search actions, it dismisses the keyboard by going back
   *
   * @param action - The IME action to perform: done, next, search, send, go, previous
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11yImeActionResult> - The IME action result with timing information
   */
  requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yImeActionResult>;

  /**
   * Request select all text via the accessibility service
   * This uses ACTION_SET_SELECTION to select all text in the focused field,
   * which is significantly faster than using ADB double-tap gestures
   *
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11ySelectAllResult> - The select all result with timing information
   */
  requestSelectAll(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11ySelectAllResult>;

  /**
   * Request a node action (e.g., long_click) via the accessibility service
   *
   * @param action - Action name (e.g., long_click)
   * @param resourceId - Optional resource-id to target a specific element
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11yActionResult> - The action result with timing information
   */
  requestAction(
    action: string,
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yActionResult>;

  /**
   * Request a clipboard operation via the accessibility service
   * This uses ClipboardManager to copy/paste/clear/get clipboard content
   *
   * @param action - Clipboard action: copy, paste, clear, or get
   * @param text - Text to copy (required for 'copy' action)
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<A11yClipboardResult> - The clipboard operation result with timing information
   */
  requestClipboard(
    action: "copy" | "paste" | "clear" | "get",
    text?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yClipboardResult>;

  /**
   * Request CA certificate installation via the accessibility service (device owner only).
   * The certificate payload can be PEM or base64-encoded DER.
   */
  requestInstallCaCertificate(
    certificate: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yCaCertResult>;

  /**
   * Request CA certificate installation from a host file path.
   */
  requestInstallCaCertificateFromFile(
    certificatePath: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yCaCertResult>;

  /**
   * Request CA certificate removal via the accessibility service (device owner only).
   * Uses the alias returned from installation.
   */
  requestRemoveCaCertificate(
    alias: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yCaCertResult>;

  /**
   * Request device owner status from the accessibility service.
   */
  requestDeviceOwnerStatus(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yDeviceOwnerStatusResult>;

  /**
   * Request permission status from the accessibility service.
   */
  requestPermission(
    permission: string,
    requestPermission?: boolean,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<A11yPermissionResult>;

  /**
   * Add a visual highlight overlay entry.
   */
  requestAddHighlight(
    id: string,
    shape: HighlightShape,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<HighlightOperationResult>;

  /**
   * Remove a visual highlight overlay entry.
   */
  requestRemoveHighlight(
    id: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<HighlightOperationResult>;

  /**
   * Clear all visual highlight overlay entries.
   */
  requestClearHighlights(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<HighlightOperationResult>;

  /**
   * List current visual highlight overlay entries.
   */
  requestListHighlights(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<HighlightOperationResult>;

  /**
   * Request a screenshot from the accessibility service
   *
   * @param timeoutMs - Maximum time to wait for screenshot in milliseconds
   * @param perf - Optional performance tracker for timing
   * @returns Promise<ScreenshotResult> - The screenshot result
   */
  requestScreenshot(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<ScreenshotResult>;

  /**
   * Ensure the WebSocket connection is established for streaming events.
   */
  ensureConnected(perf?: PerformanceTracker): Promise<boolean>;

  /**
   * Check if WebSocket is currently connected to the accessibility service
   * @returns true if WebSocket connection is open, false otherwise
   */
  isConnected(): boolean;

  /**
   * Check if there is cached hierarchy data available
   * @returns true if hierarchy data exists in cache, false otherwise
   */
  hasCachedHierarchy(): boolean;

  /**
   * Invalidate the cached hierarchy data
   * This forces the next getHierarchy call to wait for fresh data
   * Should be called after any action that modifies the UI (like setText, swipe, tap)
   */
  invalidateCache(): void;

  /**
   * Close WebSocket connection and cleanup resources
   * @returns Promise that resolves when cleanup is complete
   */
  close(): Promise<void>;
}

/**
 * Client for interacting with the AutoMobile Accessibility Service via WebSocket
 * Uses singleton pattern per device to maintain persistent WebSocket connection
 */
export class AccessibilityServiceClient implements AccessibilityService {
  private device: BootedDevice;
  private adb: AdbClient;
  private static readonly PACKAGE_NAME = "dev.jasonpearson.automobile.accessibilityservice";
  private static readonly WEBSOCKET_PORT = 8765;
  private static readonly WEBSOCKET_URL = `ws://localhost:${AccessibilityServiceClient.WEBSOCKET_PORT}/ws`;
  private static readonly DEVICE_CERT_DIR = "/sdcard/Download/automobile/ca_certs";

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
  private recompositionTrackingConfigured: boolean = false;
  private recompositionTrackingEnabled: boolean = false;

  // Screenshot handling
  private pendingScreenshotResolve: ((result: ScreenshotResult) => void) | null = null;
  private pendingScreenshotRequestId: string | null = null;

  // Swipe handling
  private pendingSwipeResolve: ((result: A11ySwipeResult) => void) | null = null;
  private pendingSwipeRequestId: string | null = null;
  private pendingTapCoordinatesResolve: ((result: A11yTapCoordinatesResult) => void) | null = null;
  private pendingTapCoordinatesRequestId: string | null = null;
  private pendingDragResolve: ((result: A11yDragResult) => void) | null = null;
  private pendingDragRequestId: string | null = null;

  // Pinch handling
  private pendingPinchResolve: ((result: A11yPinchResult) => void) | null = null;
  private pendingPinchRequestId: string | null = null;

  // Set text handling
  private pendingSetTextResolve: ((result: A11ySetTextResult) => void) | null = null;
  private pendingSetTextRequestId: string | null = null;

  // IME action handling
  private pendingImeActionResolve: ((result: A11yImeActionResult) => void) | null = null;
  private pendingImeActionRequestId: string | null = null;

  // Select all handling
  private pendingSelectAllResolve: ((result: A11ySelectAllResult) => void) | null = null;
  private pendingSelectAllRequestId: string | null = null;

  // Action handling
  private pendingActionResolve: ((result: A11yActionResult) => void) | null = null;
  private pendingActionRequestId: string | null = null;

  // Clipboard handling
  private pendingClipboardResolve: ((result: A11yClipboardResult) => void) | null = null;
  private pendingClipboardRequestId: string | null = null;

  // CA certificate handling
  private pendingCaCertResolve: ((result: A11yCaCertResult) => void) | null = null;
  private pendingCaCertRequestId: string | null = null;

  // Device owner status handling
  private pendingDeviceOwnerStatusResolve: ((result: A11yDeviceOwnerStatusResult) => void) | null = null;
  private pendingDeviceOwnerStatusRequestId: string | null = null;

  // Permission handling
  private pendingPermissionResolve: ((result: A11yPermissionResult) => void) | null = null;
  private pendingPermissionRequestId: string | null = null;

  private interactionListeners: Set<(event: InteractionEvent) => void> = new Set();

  // Current focus handling
  private pendingCurrentFocusResolve: ((result: CurrentFocusResult) => void) | null = null;
  private pendingCurrentFocusRequestId: string | null = null;

  // Traversal order handling
  private pendingTraversalOrderResolve: ((result: TraversalOrderResult) => void) | null = null;
  private pendingTraversalOrderRequestId: string | null = null;

  // Highlight handling
  private pendingHighlightResolve: ((result: HighlightOperationResult) => void) | null = null;
  private pendingHighlightRequestId: string | null = null;

  // WebSocket factory for testing
  private webSocketFactory: (url: string) => WebSocket;

  // Timer for testing
  private timer: Timer;

  // Hierarchy navigation detector for view hierarchy-based navigation
  private hierarchyNavigationDetector: HierarchyNavigationDetector | null = null;
  // Track apps that emit SDK navigation events so we can avoid overriding screen names
  private sdkNavigationAppIds: Set<string> = new Set();

  /**
   * Private constructor - use getInstance() instead
   * @param device - The booted device
   * @param adb - The ADB client
   * @param webSocketFactory - Optional WebSocket factory for testing (default: creates real WebSocket)
   * @param timer - Optional timer for testing (default: defaultTimer)
   */
  private constructor(device: BootedDevice, adb: AdbClient, webSocketFactory?: (url: string) => WebSocket, timer?: Timer) {
    this.device = device;
    this.adb = adb;
    this.webSocketFactory = webSocketFactory || ((url: string) => new WebSocket(url));
    this.timer = timer || defaultTimer;
    AndroidAccessibilityServiceManager.getInstance(device, adb);
  }

  /**
   * Get singleton instance for a device
   * @param device - The booted device
   * @param adb - Optional AdbClient instance
   * @returns AccessibilityServiceClient instance
   */
  public static getInstance(device: BootedDevice, adb: AdbClient | null = null): AccessibilityServiceClient {
    const deviceId = device.deviceId;
    if (!AccessibilityServiceClient.instances.has(deviceId)) {
      logger.debug(`[ACCESSIBILITY_SERVICE] Creating singleton for device: ${deviceId}`);
      AccessibilityServiceClient.instances.set(
        deviceId,
        new AccessibilityServiceClient(device, adb || new AdbClient(device))
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
   * Create instance for testing with custom WebSocket factory
   * This bypasses the singleton pattern and allows injecting a fake WebSocket
   * @param device - The booted device
   * @param adb - The ADB client
   * @param webSocketFactory - WebSocket factory function
   * @param timer - Optional timer for testing
   * @returns AccessibilityServiceClient instance
   */
  public static createForTesting(
    device: BootedDevice,
    adb: AdbClient,
    webSocketFactory: (url: string) => WebSocket,
    timer?: Timer
  ): AccessibilityServiceClient {
    return new AccessibilityServiceClient(device, adb, webSocketFactory, timer);
  }

  /**
   * Get the hierarchy navigation detector, creating it lazily if needed.
   * The detector monitors view hierarchy updates to detect screen changes.
   */
  public getHierarchyNavigationDetector(): HierarchyNavigationDetector {
    if (!this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector = new HierarchyNavigationDetector(
        NavigationGraphManager.getInstance(),
        { timer: this.timer }
      );
    }
    return this.hierarchyNavigationDetector;
  }

  /**
   * Reset the hierarchy navigation detector.
   * Call this when switching apps or when you want to start fresh.
   */
  public resetHierarchyNavigationDetector(): void {
    if (this.hierarchyNavigationDetector) {
      this.hierarchyNavigationDetector.reset();
    }
  }

  /**
   * Check if WebSocket is currently connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async ensureConnected(
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<boolean> {
    return this.connectWebSocket(perf);
  }

  public onInteraction(listener: (event: InteractionEvent) => void): () => void {
    this.interactionListeners.add(listener);
    return () => {
      this.interactionListeners.delete(listener);
    };
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

  /**
   * Check if there is cached hierarchy data
   */
  public hasCachedHierarchy(): boolean {
    return this.cachedHierarchy !== null;
  }

  /**
   * Invalidate the cached hierarchy data.
   * This forces the next getHierarchy call to wait for fresh data.
   * Should be called after any action that modifies the UI (like setText, swipe, tap).
   */
  public invalidateCache(): void {
    if (this.cachedHierarchy) {
      logger.debug("[ACCESSIBILITY_SERVICE] Invalidating cached hierarchy");
      this.cachedHierarchy = null;
    }
  }

  /**
   * Setup ADB port forwarding for WebSocket connection
   * @param perf - Performance tracker for timing
   */
  private async setupPortForwarding(
    perf: PerformanceTracker = new NoOpPerformanceTracker()
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
    perf: PerformanceTracker = new NoOpPerformanceTracker()
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
      // Reset port forwarding flag so next attempt will re-setup the forward
      this.portForwardingSetup = false;
    }

    if (this.isConnecting) {
      logger.debug("[ACCESSIBILITY_SERVICE] Connection already in progress, waiting...");
      // Wait for ongoing connection attempt
      return new Promise(resolve => {
        const checkInterval = this.timer.setInterval(() => {
          if (!this.isConnecting) {
            this.timer.clearInterval(checkInterval);
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
        const ws = this.webSocketFactory(AccessibilityServiceClient.WEBSOCKET_URL);
        const connectionTimeout = this.timer.setTimeout(() => {
          ws.close();
          // Reset port forwarding flag so next attempt will re-setup the forward
          this.portForwardingSetup = false;
          reject(new Error("WebSocket connection timeout"));
        }, 5000);

        ws.on("open", () => {
          this.timer.clearTimeout(connectionTimeout);
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
          this.timer.clearTimeout(connectionTimeout);
          logger.warn(`[ACCESSIBILITY_SERVICE] WebSocket error: ${error.message}`);
          this.isConnecting = false;
          // Reset port forwarding flag so next attempt will re-setup the forward
          this.portForwardingSetup = false;
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
      // Reset port forwarding flag so next attempt will re-setup the forward
      this.portForwardingSetup = false;
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to connect to WebSocket: ${error}`);
      return false;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleWebSocketMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (message.type === "connected") {
        logger.debug(`[ACCESSIBILITY_SERVICE] Received connection confirmation`);
        return;
      }

      if (message.type === "hierarchy_update" && message.data) {
        const now = Date.now();
        const perfTiming = (message as any).perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Received hierarchy update (updatedAt: ${message.data.updatedAt}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        // Mark previous cache as stale
        if (this.cachedHierarchy) {
          this.cachedHierarchy.fresh = false;
        }

        // Update cache with fresh data
        this.cachedHierarchy = {
          hierarchy: message.data,
          receivedAt: now,
          fresh: true,
          perfTiming
        };

        logger.debug(`[ACCESSIBILITY_SERVICE] Cached fresh hierarchy (updatedAt: ${message.data.updatedAt})`);

        // Notify hierarchy navigation detector for view hierarchy-based navigation detection
        if (!message.data.hierarchy) {
          logger.warn("[ACCESSIBILITY_SERVICE] Skipping navigation detection: hierarchy missing in update");
        } else if (message.data.error) {
          logger.warn(`[ACCESSIBILITY_SERVICE] Skipping navigation detection due to hierarchy error: ${message.data.error}`);
        } else if (!this.shouldUseHierarchyNavigation(message.data.packageName)) {
          logger.debug(`[ACCESSIBILITY_SERVICE] Skipping hierarchy navigation for SDK app: ${message.data.packageName}`);
        } else {
          this.getHierarchyNavigationDetector().onHierarchyUpdate(message.data);
        }
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

      // Handle swipe result
      if (message.type === "swipe_result" && this.pendingSwipeResolve) {
        const swipeMessage = message as any;
        const perfTiming = swipeMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Swipe result (requestId: ${swipeMessage.requestId}, success: ${swipeMessage.success}, totalTimeMs: ${swipeMessage.totalTimeMs}, gestureTimeMs: ${swipeMessage.gestureTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        // NOTE: Do not invalidate cache on swipe - swipe is not guaranteed to change the hierarchy
        // (e.g., scrolling at end of list produces no change)

        const resolve = this.pendingSwipeResolve;
        this.pendingSwipeResolve = null;
        this.pendingSwipeRequestId = null;
        resolve({
          success: swipeMessage.success,
          totalTimeMs: swipeMessage.totalTimeMs,
          gestureTimeMs: swipeMessage.gestureTimeMs,
          error: swipeMessage.error,
          perfTiming
        });
      }

      // Handle tap coordinates result
      if (message.type === "tap_coordinates_result" && this.pendingTapCoordinatesResolve) {
        const tapMessage = message as any;
        const perfTiming = tapMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.info(`[ACCESSIBILITY_SERVICE] Tap coordinates result (requestId: ${tapMessage.requestId}, success: ${tapMessage.success}, totalTimeMs: ${tapMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingTapCoordinatesResolve;
        this.pendingTapCoordinatesResolve = null;
        this.pendingTapCoordinatesRequestId = null;
        resolve({
          success: tapMessage.success,
          totalTimeMs: tapMessage.totalTimeMs,
          error: tapMessage.error,
          perfTiming
        });
      }

      // Handle drag result
      if (message.type === "drag_result" && this.pendingDragResolve) {
        const dragMessage = message as any;
        const perfTiming = dragMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Drag result (requestId: ${dragMessage.requestId}, success: ${dragMessage.success}, totalTimeMs: ${dragMessage.totalTimeMs}, gestureTimeMs: ${dragMessage.gestureTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingDragResolve;
        this.pendingDragResolve = null;
        this.pendingDragRequestId = null;
        resolve({
          success: dragMessage.success,
          totalTimeMs: dragMessage.totalTimeMs,
          gestureTimeMs: dragMessage.gestureTimeMs,
          error: dragMessage.error,
          perfTiming
        });
      }

      // Handle pinch result
      if (message.type === "pinch_result" && this.pendingPinchResolve) {
        const pinchMessage = message as any;
        const perfTiming = pinchMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Pinch result (requestId: ${pinchMessage.requestId}, success: ${pinchMessage.success}, totalTimeMs: ${pinchMessage.totalTimeMs}, gestureTimeMs: ${pinchMessage.gestureTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingPinchResolve;
        this.pendingPinchResolve = null;
        this.pendingPinchRequestId = null;
        resolve({
          success: pinchMessage.success,
          totalTimeMs: pinchMessage.totalTimeMs,
          gestureTimeMs: pinchMessage.gestureTimeMs,
          error: pinchMessage.error,
          perfTiming
        });
      }

      // Handle set text result
      if (message.type === "set_text_result" && this.pendingSetTextResolve) {
        const setTextMessage = message as any;
        const perfTiming = setTextMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Set text result (requestId: ${setTextMessage.requestId}, success: ${setTextMessage.success}, totalTimeMs: ${setTextMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        // NOTE: We do NOT invalidate cache here because:
        // 1. The Android service calls extractNowBlocking() BEFORE sending set_text_result
        // 2. This pushes fresh hierarchy via hierarchy_update message
        // 3. The fresh hierarchy is cached before we receive set_text_result
        // 4. Invalidating here would throw away the fresh data we just received!

        const resolve = this.pendingSetTextResolve;
        this.pendingSetTextResolve = null;
        this.pendingSetTextRequestId = null;
        resolve({
          success: setTextMessage.success,
          totalTimeMs: setTextMessage.totalTimeMs,
          error: setTextMessage.error,
          perfTiming
        });
      }

      // Handle IME action result
      if (message.type === "ime_action_result" && this.pendingImeActionResolve) {
        const imeActionMessage = message as any;
        const perfTiming = imeActionMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] IME action result (requestId: ${imeActionMessage.requestId}, action: ${imeActionMessage.action}, success: ${imeActionMessage.success}, totalTimeMs: ${imeActionMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        // NOTE: We do NOT invalidate cache here - same reason as set_text_result
        // The Android service extracts fresh hierarchy before sending the result

        const resolve = this.pendingImeActionResolve;
        this.pendingImeActionResolve = null;
        this.pendingImeActionRequestId = null;
        resolve({
          success: imeActionMessage.success,
          action: imeActionMessage.action,
          totalTimeMs: imeActionMessage.totalTimeMs,
          error: imeActionMessage.error,
          perfTiming
        });
      }

      // Handle select all result
      if (message.type === "select_all_result" && this.pendingSelectAllResolve) {
        const selectAllMessage = message as any;
        const perfTiming = selectAllMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Select all result (requestId: ${selectAllMessage.requestId}, success: ${selectAllMessage.success}, totalTimeMs: ${selectAllMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingSelectAllResolve;
        this.pendingSelectAllResolve = null;
        this.pendingSelectAllRequestId = null;
        resolve({
          success: selectAllMessage.success,
          totalTimeMs: selectAllMessage.totalTimeMs,
          error: selectAllMessage.error,
          perfTiming
        });
      }

      // Handle action result
      if (message.type === "action_result") {
        const actionMessage = message as any;
        const perfTiming = actionMessage.perfTiming as AndroidPerfTiming[] | undefined;

        if (this.pendingActionResolve) {
          const resolve = this.pendingActionResolve;
          this.pendingActionResolve = null;
          this.pendingActionRequestId = null;
          resolve({
            success: actionMessage.success,
            action: actionMessage.action,
            totalTimeMs: actionMessage.totalTimeMs,
            error: actionMessage.error,
            perfTiming
          });
        } else {
          logger.warn(`[ACCESSIBILITY_SERVICE] Received action_result but no pending resolve! This is likely a duplicate result that will be ignored.`);
        }
      }

      // Handle clipboard result
      if (message.type === "clipboard_result" && this.pendingClipboardResolve) {
        const clipboardMessage = message as any;
        const perfTiming = clipboardMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Clipboard result (requestId: ${clipboardMessage.requestId}, action: ${clipboardMessage.action}, success: ${clipboardMessage.success}, totalTimeMs: ${clipboardMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingClipboardResolve;
        this.pendingClipboardResolve = null;
        this.pendingClipboardRequestId = null;
        resolve({
          success: clipboardMessage.success,
          action: clipboardMessage.action,
          text: clipboardMessage.text,
          totalTimeMs: clipboardMessage.totalTimeMs,
          error: clipboardMessage.error,
          perfTiming
        });
      }

      // Handle CA certificate result
      if (message.type === "ca_cert_result" && this.pendingCaCertResolve) {
        const caCertMessage = message as any;
        const perfTiming = caCertMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] CA cert result (requestId: ${caCertMessage.requestId}, action: ${caCertMessage.action}, success: ${caCertMessage.success}, totalTimeMs: ${caCertMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingCaCertResolve;
        this.pendingCaCertResolve = null;
        this.pendingCaCertRequestId = null;
        resolve({
          success: caCertMessage.success,
          action: caCertMessage.action,
          alias: caCertMessage.alias,
          totalTimeMs: caCertMessage.totalTimeMs,
          error: caCertMessage.error,
          perfTiming
        });
      }

      // Handle device owner status result
      if (message.type === "device_owner_status_result" && this.pendingDeviceOwnerStatusResolve) {
        const statusMessage = message as any;
        const perfTiming = statusMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Device owner status result (requestId: ${statusMessage.requestId}, success: ${statusMessage.success}, totalTimeMs: ${statusMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingDeviceOwnerStatusResolve;
        this.pendingDeviceOwnerStatusResolve = null;
        this.pendingDeviceOwnerStatusRequestId = null;
        resolve({
          success: statusMessage.success,
          isDeviceOwner: statusMessage.isDeviceOwner ?? false,
          isAdminActive: statusMessage.isAdminActive ?? false,
          packageName: statusMessage.packageName,
          totalTimeMs: statusMessage.totalTimeMs,
          error: statusMessage.error,
          perfTiming
        });
      }

      // Handle permission result
      if (message.type === "permission_result" && this.pendingPermissionResolve) {
        const permissionMessage = message as any;
        const perfTiming = permissionMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Permission result (requestId: ${permissionMessage.requestId}, permission: ${permissionMessage.permission}, granted: ${permissionMessage.granted}, totalTimeMs: ${permissionMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingPermissionResolve;
        this.pendingPermissionResolve = null;
        this.pendingPermissionRequestId = null;
        resolve({
          success: permissionMessage.success ?? false,
          permission: permissionMessage.permission ?? "unknown",
          granted: permissionMessage.granted ?? false,
          totalTimeMs: permissionMessage.totalTimeMs ?? 0,
          requestLaunched: permissionMessage.requestLaunched ?? false,
          canRequest: permissionMessage.canRequest ?? false,
          requiresSettings: permissionMessage.requiresSettings ?? false,
          instructions: permissionMessage.instructions,
          adbCommand: permissionMessage.adbCommand,
          error: permissionMessage.error,
          perfTiming
        });
      }

      // Handle current focus result
      if (message.type === "current_focus_result" && this.pendingCurrentFocusResolve) {
        const focusMessage = message as any;
        const perfTiming = focusMessage.perfTiming as AndroidPerfTiming[] | undefined;
        logger.debug(`[ACCESSIBILITY_SERVICE] Current focus result (requestId: ${focusMessage.requestId}, totalTimeMs: ${focusMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingCurrentFocusResolve;
        this.pendingCurrentFocusResolve = null;
        this.pendingCurrentFocusRequestId = null;

        // Convert accessibility node to Element if present
        const focusedElement = focusMessage.focusedElement
          ? this.convertAccessibilityNodeToElement(focusMessage.focusedElement)
          : null;

        resolve({
          focusedElement,
          totalTimeMs: focusMessage.totalTimeMs,
          requestId: focusMessage.requestId,
          error: focusMessage.error
        });
      }

      // Handle traversal order result
      if (message.type === "traversal_order_result" && this.pendingTraversalOrderResolve) {
        const traversalMessage = message as any;
        const perfTiming = traversalMessage.perfTiming as AndroidPerfTiming[] | undefined;
        const result = traversalMessage.result;
        logger.debug(`[ACCESSIBILITY_SERVICE] Traversal order result (requestId: ${traversalMessage.requestId}, totalCount: ${result?.totalCount}, totalTimeMs: ${traversalMessage.totalTimeMs}, perfTiming: ${perfTiming ? "present" : "absent"})`);

        const resolve = this.pendingTraversalOrderResolve;
        this.pendingTraversalOrderResolve = null;
        this.pendingTraversalOrderRequestId = null;

        if (result && result.elements) {
          // Convert accessibility nodes to Elements
          const elements = result.elements.map((node: any) =>
            this.convertAccessibilityNodeToElement(node)
          );

          resolve({
            elements,
            focusedIndex: result.focusedIndex,
            totalCount: result.totalCount,
            totalTimeMs: traversalMessage.totalTimeMs,
            requestId: traversalMessage.requestId,
            error: traversalMessage.error
          });
        } else {
          resolve({
            elements: [],
            focusedIndex: null,
            totalCount: 0,
            totalTimeMs: traversalMessage.totalTimeMs,
            requestId: traversalMessage.requestId,
            error: traversalMessage.error || "No result data"
          });
        }
      }

      // Handle highlight response
      if (message.type === "highlight_response") {
        const highlightMessage = message as any;
        if (!this.pendingHighlightResolve) {
          logger.debug("[ACCESSIBILITY_SERVICE] Received highlight_response with no pending request");
          return;
        }
        if (
          this.pendingHighlightRequestId
          && highlightMessage.requestId
          && highlightMessage.requestId !== this.pendingHighlightRequestId
        ) {
          logger.debug(`[ACCESSIBILITY_SERVICE] Ignoring highlight_response for requestId ${highlightMessage.requestId}`);
          return;
        }
        const resolve = this.pendingHighlightResolve;
        this.pendingHighlightResolve = null;
        this.pendingHighlightRequestId = null;
        resolve({
          success: highlightMessage.success ?? false,
          error: highlightMessage.error,
          highlights: Array.isArray(highlightMessage.highlights) ? highlightMessage.highlights : [],
          requestId: highlightMessage.requestId,
          timestamp: highlightMessage.timestamp
        });
      }

      // Handle navigation event
      if (message.type === "navigation_event") {
        const navMessage = message as any;
        const event = navMessage.event as NavigationEvent;
        if (event) {
          if (event.applicationId) {
            this.sdkNavigationAppIds.add(event.applicationId);
          }
          // applicationId is included in the serialized event from Android SDK
          logger.debug(
            `[ACCESSIBILITY_SERVICE] Navigation event: ${event.destination} ` +
            `(source: ${event.source}, app: ${event.applicationId || "unknown"}, timestamp: ${event.timestamp})`
          );
          await NavigationGraphManager.getInstance().recordNavigationEvent(event);
        }
      }

      if (message.type === "interaction_event") {
        const interactionMessage = message as any;
        const interaction = interactionMessage.event as InteractionEvent | undefined;
        if (interaction) {
          this.notifyInteractionListeners(interaction);
        }
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

  private shouldUseHierarchyNavigation(packageName?: string): boolean {
    if (!packageName) {
      return true;
    }
    return !this.sdkNavigationAppIds.has(packageName);
  }

  /**
   * Determine whether cached data satisfies a minTimestamp requirement.
   * Prefers device timestamp (updatedAt) when available; falls back to receivedAt otherwise.
   */
  private evaluateMinTimestamp(
    cachedHierarchy: CachedHierarchy,
    minTimestamp: number,
    useDeviceTimestamp: boolean
  ): {
    isFresh: boolean;
    updatedAt?: number;
    updatedAfter: boolean;
    receivedAfter: boolean;
    usesUpdatedAt: boolean;
  } {
    const updatedAt = cachedHierarchy.hierarchy.updatedAt;
    const hasUpdatedAt = typeof updatedAt === "number" && !Number.isNaN(updatedAt);
    const shouldUseUpdatedAt = useDeviceTimestamp && hasUpdatedAt;
    const updatedAfter = shouldUseUpdatedAt ? updatedAt >= minTimestamp : false;
    const receivedAfter = !shouldUseUpdatedAt ? cachedHierarchy.receivedAt >= minTimestamp : false;
    return {
      isFresh: shouldUseUpdatedAt ? updatedAfter : receivedAfter,
      updatedAt,
      updatedAfter,
      receivedAfter,
      usesUpdatedAt: shouldUseUpdatedAt
    };
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
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    signal?: AbortSignal
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
        // Use BOTH timestamps to handle clock skew between JavaScript and Android
        // This matches the logic in waitForFreshData()
        if (minTimestamp > 0) {
          const freshness = this.evaluateMinTimestamp(this.cachedHierarchy, minTimestamp, true);

          if (!freshness.isFresh) {
            const staleReference = freshness.usesUpdatedAt ? freshness.updatedAt : this.cachedHierarchy.receivedAt;
            logger.debug(`[ACCESSIBILITY_SERVICE] Cache rejected: ${freshness.usesUpdatedAt ? "updatedAt" : "receivedAt"} ${staleReference} < ${minTimestamp}`);
            // Fall through to wait for fresh data or sync
          } else {
            const isFresh = cacheAge < 1000; // Consider fresh if less than 1 second old
            const duration = Date.now() - startTime;
            logger.debug(
              `[ACCESSIBILITY_SERVICE] Cache accepted in ${duration}ms: ` +
              `receivedAt=${this.cachedHierarchy.receivedAt}, ` +
              `updatedAt=${updatedAt}, age=${cacheAge}ms, fresh=${isFresh}`
            );

            return {
              hierarchy: this.cachedHierarchy.hierarchy,
              fresh: isFresh,
              updatedAt: updatedAt,
              perfTiming: this.cachedHierarchy.perfTiming
            };
          }
        } else {
          // No minTimestamp check, return cache
          const isFresh = cacheAge < 1000; // Consider fresh if less than 1 second old
          const duration = Date.now() - startTime;
          logger.debug(`[ACCESSIBILITY_SERVICE] Cache hit: ${duration}ms (age: ${cacheAge}ms, fresh: ${isFresh}, updatedAt: ${updatedAt})`);

          return {
            hierarchy: this.cachedHierarchy.hierarchy,
            fresh: isFresh,
            updatedAt: updatedAt,
            perfTiming: this.cachedHierarchy.perfTiming
          };
        }
      }

      // Wait for fresh data if requested (unless skipped or recently timed out)
      // Also wait if cache was rejected due to minTimestamp
      // IMPORTANT: When cacheRejected is true, we MUST wait for fresh data regardless of skipWaitForFresh
      // because the caller requires data newer than minTimestamp (e.g., after an action like inputText)
      // Cache is rejected only if BOTH timestamps indicate stale data (to handle clock skew)
      const cacheRejected = minTimestamp > 0 && this.cachedHierarchy &&
        !this.evaluateMinTimestamp(this.cachedHierarchy, minTimestamp, true).isFresh;
      const shouldWait = (waitForFresh || cacheRejected) && (!skipWaitForFresh || cacheRejected) && !this.shouldSkipWebSocketWait();
      if (shouldWait) {
        throwIfAborted(signal);
        // Use minTimestamp if provided, otherwise use startTime
        const waitMinTimestamp = minTimestamp > 0 ? minTimestamp : startTime;
        const useDeviceTimestamp = minTimestamp > 0;
        logger.debug(`[ACCESSIBILITY_SERVICE] Waiting up to ${timeout}ms for fresh hierarchy data (must be newer than ${waitMinTimestamp})`);

        const freshData = await perf.track("waitForFresh", () =>
          this.waitForFreshData(timeout, waitMinTimestamp, useDeviceTimestamp, signal)
        );
        const duration = Date.now() - startTime;

        if (freshData) {
          logger.info(`[ACCESSIBILITY_SERVICE] Received fresh hierarchy in ${duration}ms (updatedAt: ${freshData.hierarchy.updatedAt})`);
          return {
            hierarchy: freshData.hierarchy,
            fresh: true,
            updatedAt: freshData.hierarchy.updatedAt,
            perfTiming: freshData.perfTiming
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
              updatedAt: this.cachedHierarchy.hierarchy.updatedAt,
              perfTiming: this.cachedHierarchy.perfTiming
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
   * @returns CachedHierarchy if fresh data received, null on timeout or screen off
   */
  private async waitForFreshData(
    timeout: number,
    minTimestamp: number,
    useDeviceTimestamp: boolean,
    signal?: AbortSignal
  ): Promise<CachedHierarchy | null> {
    const startTime = this.timer.now();
    const checkInterval = 50; // Check every 50ms
    const screenCheckInterval = 1000; // Check screen state every 1 second
    const staleCheckDelay = 2000; // Send stale check request after 2 seconds of no push
    let lastScreenCheck = startTime;
    let screenCheckInProgress = false;
    let staleCheckSent = false;

    return new Promise(resolve => {
      const intervalId = this.timer.setInterval(() => {
        if (signal?.aborted) {
          this.timer.clearInterval(intervalId);
          resolve(null);
          return;
        }
        const elapsed = this.timer.now() - startTime;

        // Check if we received data that was updated AFTER our request started
        // This ensures we get fresh pushed data, not stale cached data
        if (this.cachedHierarchy) {
          const freshness = this.evaluateMinTimestamp(this.cachedHierarchy, minTimestamp, useDeviceTimestamp);

          if (freshness.isFresh) {
            this.timer.clearInterval(intervalId);
            logger.debug(`[ACCESSIBILITY_SERVICE] Fresh data received: receivedAt=${this.cachedHierarchy.receivedAt}, updatedAt=${this.cachedHierarchy.hierarchy.updatedAt}`);
            resolve(this.cachedHierarchy);
            return;
          }
        }

        // After staleCheckDelay ms of no push, send a "nudge" to the Android service
        // This handles cases where no accessibility events are firing (e.g., Settings Intelligence)
        if (!staleCheckSent && elapsed >= staleCheckDelay) {
          staleCheckSent = true;
          logger.info(`[ACCESSIBILITY_SERVICE] No push received after ${staleCheckDelay}ms, sending stale check request (sinceTimestamp: ${minTimestamp})`);
          this.sendHierarchyIfStaleRequest(minTimestamp);
        }

        // Check screen state periodically to fail fast if screen is off
        const now = this.timer.now();
        if (!screenCheckInProgress && now - lastScreenCheck >= screenCheckInterval) {
          screenCheckInProgress = true;
          lastScreenCheck = now;

          this.adb.isScreenOn(signal).then(isOn => {
            screenCheckInProgress = false;
            if (!isOn) {
              this.timer.clearInterval(intervalId);
              logger.warn("[ACCESSIBILITY_SERVICE] Screen is off - failing fast instead of waiting for timeout");
              resolve(null);
            }
          }).catch(() => {
            screenCheckInProgress = false;
            // Ignore errors, continue waiting
          });
        }

        // Check if timeout exceeded
        if (elapsed >= timeout) {
          this.timer.clearInterval(intervalId);
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

      const hierarchyToConvert: AccessibilityNode | undefined = accessibilityHierarchy.hierarchy;
      const resolvedPackageName = accessibilityHierarchy.packageName;

      if (!hierarchyToConvert) {
        const errorMessage = accessibilityHierarchy.error || "Accessibility hierarchy missing from accessibility service";
        return {
          hierarchy: {
            error: errorMessage
          },
          packageName: resolvedPackageName,
          intentChooserDetected: accessibilityHierarchy.intentChooserDetected,
          notificationPermissionDetected: accessibilityHierarchy.notificationPermissionDetected
        } as ViewHierarchyResult;
      }

      // Convert the accessibility node format to match the existing XML-based format
      const convertedHierarchy = this.convertAccessibilityNode(hierarchyToConvert);

      const result: ViewHierarchyResult = {
        hierarchy: convertedHierarchy,
        packageName: resolvedPackageName,
        intentChooserDetected: accessibilityHierarchy.intentChooserDetected,
        notificationPermissionDetected: accessibilityHierarchy.notificationPermissionDetected
      };

      const duration = Date.now() - startTime;
      logger.info(
        `[ACCESSIBILITY_SERVICE] Format conversion completed in ${duration}ms`
      );

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
  /**
   * Convert AccessibilityNode to Element type
   * @param node - Accessibility node from WebSocket message
   * @returns Converted Element or null if conversion fails
   */
  private convertAccessibilityNodeToElement(node: AccessibilityNode): Element | null {
    try {
      // First convert to intermediate format
      const converted = this.convertAccessibilityNode(node);

      // Then parse to Element using ElementParser
      const elementParser = new ElementParser();
      return elementParser.parseNodeBounds(converted);
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to convert node to Element: ${error}`);
      return null;
    }
  }

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
    if (node["test-tag"]) {
      converted["test-tag"] = node["test-tag"];
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

    if (node.occlusionState) {
      converted.occlusionState = node.occlusionState;
    }
    if (node.occludedBy) {
      converted.occludedBy = node.occludedBy;
    }
    if (node.extras) {
      converted.extras = node.extras;
    }
    if (node.recomposition) {
      converted.recomposition = node.recomposition;
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
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0,
    disableAllFiltering: boolean = false,
    signal?: AbortSignal
  ): Promise<ViewHierarchyResult | null> {
    const startTime = Date.now();

    perf.serial("a11yService");

    try {
      throwIfAborted(signal);
      // Check if service is available
      const available = await perf.track("checkAvailable", () =>
        AndroidAccessibilityServiceManager.getInstance(this.device, this.adb).isAvailable()
      );
      if (!available) {
        logger.info("[ACCESSIBILITY_SERVICE] Service not available, will use fallback");
        perf.end();
        return null;
      }

      // Get hierarchy from WebSocket service (wait for fresh data on first request, unless skipped)
      const waitForFresh = !skipWaitForFresh && (this.cachedHierarchy === null || !this.cachedHierarchy.fresh);
      const response = await perf.track("getHierarchy", () =>
        this.getLatestHierarchy(waitForFresh, 100, perf, skipWaitForFresh, minTimestamp, signal)
      );

      let hierarchyData = response.hierarchy;
      let isFresh = response.fresh;
      let androidPerfTiming = response.perfTiming;

      // If no hierarchy from WebSocket or data is stale, sync to get fresh data
      // observe should always return the current screen state
      const needsSync = !hierarchyData || !isFresh;
      if (needsSync) {
        logger.info(`[ACCESSIBILITY_SERVICE] WebSocket returned ${hierarchyData ? "stale" : "no"} data (fresh=${isFresh}), syncing for fresh data`);

        const syncResult = await perf.track("syncRequest", () =>
          this.requestHierarchySync(perf, disableAllFiltering, signal)
        );

        if (syncResult) {
          hierarchyData = syncResult.hierarchy;
          // Update androidPerfTiming from sync result (fresher than initial response)
          if (syncResult.perfTiming) {
            androidPerfTiming = syncResult.perfTiming;
          }
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

      // Merge Android-side performance timing into the tracker
      if (androidPerfTiming && androidPerfTiming.length > 0) {
        perf.addExternalTiming("androidPerf", androidPerfTiming as any);
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
  private sendHierarchyRequest(disableAllFiltering: boolean = false): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send request - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `req_${Date.now()}_${generateSecureId()}`;
      const message = JSON.stringify({
        type: "request_hierarchy",
        requestId,
        disableAllFiltering
      });
      this.ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent hierarchy request via WebSocket (requestId: ${requestId}, disableAllFiltering: ${disableAllFiltering})`);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send WebSocket request: ${error}`);
      return false;
    }
  }

  /**
   * Send a message via WebSocket to request hierarchy extraction IF no events
   * have occurred since the given timestamp. This is used as a "nudge" when
   * waiting for pushed data but no accessibility events are firing.
   * @param sinceTimestamp - Extract only if no events occurred after this timestamp
   * @returns true if message was sent successfully
   */
  private sendHierarchyIfStaleRequest(sinceTimestamp: number): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send stale check request - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `stale_${Date.now()}_${generateSecureId()}`;
      const message = JSON.stringify({
        type: "request_hierarchy_if_stale",
        requestId,
        sinceTimestamp
      });
      this.ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent hierarchy_if_stale request (requestId: ${requestId}, sinceTimestamp: ${sinceTimestamp})`);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send stale check request: ${error}`);
      return false;
    }
  }

  /**
   * Configure recomposition tracking on the accessibility service.
   */
  async setRecompositionTrackingEnabled(
    enabled: boolean,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<void> {
    if (this.recompositionTrackingConfigured && this.recompositionTrackingEnabled === enabled) {
      return;
    }

    const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
    if (!connected) {
      logger.debug("[ACCESSIBILITY_SERVICE] Skipping recomposition tracking config; WebSocket not connected");
      return;
    }

    const sent = this.sendRecompositionTrackingRequest(enabled);
    if (sent) {
      this.recompositionTrackingConfigured = true;
      this.recompositionTrackingEnabled = enabled;
      logger.info(`[ACCESSIBILITY_SERVICE] Recomposition tracking ${enabled ? "enabled" : "disabled"}`);
    }
  }

  private sendRecompositionTrackingRequest(enabled: boolean): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn("[ACCESSIBILITY_SERVICE] Cannot send recomposition config - WebSocket not connected");
      return false;
    }

    try {
      const requestId = `recomp_${Date.now()}_${generateSecureId()}`;
      const message = JSON.stringify({ type: "set_recomposition_tracking", requestId, enabled });
      this.ws.send(message);
      return true;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Failed to send recomposition config: ${error}`);
      return false;
    }
  }

  /**
   * Request hierarchy synchronously via WebSocket message
   * Triggers extraction on device which pushes result via WebSocket
   * Falls back to ADB broadcast if WebSocket send fails
   * @param perf - Performance tracker for timing
   * @returns Promise with hierarchy and perfTiming, or null if failed
   */
  async requestHierarchySync(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    disableAllFiltering: boolean = false,
    signal?: AbortSignal,
    timeoutMs: number = 10000
  ): Promise<{ hierarchy: AccessibilityHierarchy; perfTiming?: AndroidPerfTiming[] } | null> {
    const startTime = Date.now();
    const effectiveTimeoutMs = Math.max(0, timeoutMs);

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Requesting hierarchy sync via WebSocket");

      // Try WebSocket request first (faster path)
      const sentViaWebSocket = await perf.track("sendWsRequest", async () => {
        return this.sendHierarchyRequest(disableAllFiltering);
      });

      // Fall back to ADB broadcast if WebSocket failed
      if (!sentViaWebSocket) {
        logger.info("[ACCESSIBILITY_SERVICE] Falling back to ADB broadcast");
        const uuid = `sync_${Date.now()}_${generateSecureId()}`;
        await perf.track("sendBroadcast", async () => {
          await this.adb.executeCommand(
            `shell "am broadcast -a dev.jasonpearson.automobile.EXTRACT_HIERARCHY --es uuid ${uuid} --ez disableAllFiltering ${disableAllFiltering}"`,
            undefined,
            undefined,
            undefined,
            signal
          );
        });
      }

      // Wait for WebSocket push (triggered by either method)
      // The Android service calls broadcastHierarchyUpdate() after extraction
      // Use a configurable timeout to align with caller expectations.
      const freshData = await perf.track("waitForPush", () =>
        this.waitForFreshData(effectiveTimeoutMs, startTime, false, signal)
      );

      if (freshData) {
        const duration = Date.now() - startTime;
        logger.debug(`[ACCESSIBILITY_SERVICE] Sync complete: ${duration}ms (updatedAt: ${freshData.hierarchy.updatedAt})`);
        return {
          hierarchy: freshData.hierarchy,
          perfTiming: freshData.perfTiming
        };
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

      // Dispose hierarchy navigation detector
      if (this.hierarchyNavigationDetector) {
        this.hierarchyNavigationDetector.dispose();
        this.hierarchyNavigationDetector = null;
      }

      // Optionally remove port forwarding
      if (this.portForwardingSetup) {
        await this.adb.executeCommand(`forward --remove tcp:${AccessibilityServiceClient.WEBSOCKET_PORT}`).catch(() => {
          // Ignore errors
        });
        this.portForwardingSetup = false;
      }

      this.recompositionTrackingConfigured = false;
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
    perf: PerformanceTracker = new NoOpPerformanceTracker()
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
      const requestId = `screenshot_${Date.now()}_${generateSecureId()}`;
      this.pendingScreenshotRequestId = requestId;

      // Create promise that will be resolved when we receive the screenshot
      const screenshotPromise = new Promise<ScreenshotResult>(resolve => {
        this.pendingScreenshotResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
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

  /**
   * Request a swipe gesture from the accessibility service using dispatchGesture API.
   * This is significantly faster than ADB's input swipe command.
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Swipe duration in milliseconds (default: 300)
   * @param timeoutMs - Maximum time to wait for swipe completion in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11ySwipeResult> - The swipe result with timing information
   */
  async requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySwipeResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for swipe");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send swipe request
      const requestId = `swipe_${Date.now()}_${generateSecureId()}`;
      this.pendingSwipeRequestId = requestId;

      // Create promise that will be resolved when we receive the swipe result
      const swipePromise = new Promise<A11ySwipeResult>(resolve => {
        this.pendingSwipeResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingSwipeResolve === resolve) {
            this.pendingSwipeResolve = null;
            this.pendingSwipeRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Swipe timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_swipe",
          requestId,
          x1: Math.round(x1),
          y1: Math.round(y1),
          x2: Math.round(x2),
          y2: Math.round(y2),
          duration
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent swipe request (requestId: ${requestId}, ${x1},${y1} -> ${x2},${y2}, duration: ${duration}ms)`);
      });

      // Wait for response
      const result = await perf.track("waitForSwipe", () => swipePromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Swipe completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, gestureTime=${result.gestureTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Swipe failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Swipe request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request a coordinate-based tap from the accessibility service using dispatchGesture.
   * This is significantly faster than ADB input tap and more precise than resource-id lookup.
   *
   * @param x - X coordinate to tap
   * @param y - Y coordinate to tap
   * @param duration - Duration of the tap in milliseconds (default 10ms for a quick tap)
   * @param timeoutMs - Timeout for the request in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11yTapCoordinatesResult> - The tap result with timing information
   */
  async requestTapCoordinates(
    x: number,
    y: number,
    duration: number = 10,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yTapCoordinatesResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for tap coordinates");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send tap coordinates request
      const requestId = `tap_coordinates_${Date.now()}_${generateSecureId()}`;
      this.pendingTapCoordinatesRequestId = requestId;

      // Create promise that will be resolved when we receive the tap result
      const tapPromise = new Promise<A11yTapCoordinatesResult>(resolve => {
        this.pendingTapCoordinatesResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingTapCoordinatesResolve === resolve) {
            this.pendingTapCoordinatesResolve = null;
            this.pendingTapCoordinatesRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Tap coordinates timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_tap_coordinates",
          requestId,
          x: Math.round(x),
          y: Math.round(y),
          duration
        });
        this.ws.send(message);
        logger.info(`[ACCESSIBILITY_SERVICE] Sent tap coordinates request (requestId: ${requestId}, x: ${x}, y: ${y}, duration: ${duration}ms)`);
      });

      // Wait for response
      const result = await perf.track("waitForTap", () => tapPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Tap coordinates completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Tap coordinates failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Tap coordinates request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request a two-finger swipe gesture from the accessibility service for TalkBack mode.
   * This allows scrolling content without moving the TalkBack focus cursor.
   *
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Duration of the swipe in milliseconds (default 300ms)
   * @param offset - Horizontal offset between the two fingers (default 100px)
   * @param timeoutMs - Timeout for the request in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11ySwipeResult> - The swipe result with timing information
   */
  async requestTwoFingerSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    offset: number = 100,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySwipeResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for two-finger swipe");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send two-finger swipe request
      const requestId = `two_finger_swipe_${Date.now()}_${generateSecureId()}`;
      this.pendingSwipeRequestId = requestId;

      // Create promise that will be resolved when we receive the swipe result
      const swipePromise = new Promise<A11ySwipeResult>(resolve => {
        this.pendingSwipeResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingSwipeResolve === resolve) {
            this.pendingSwipeResolve = null;
            this.pendingSwipeRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Two-finger swipe timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_two_finger_swipe",
          requestId,
          x1: Math.round(x1),
          y1: Math.round(y1),
          x2: Math.round(x2),
          y2: Math.round(y2),
          duration,
          offset
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent two-finger swipe request (requestId: ${requestId}, ${x1},${y1} -> ${x2},${y2}, duration: ${duration}ms, offset: ${offset}px)`);
      });

      // Wait for response
      const result = await perf.track("waitForSwipe", () => swipePromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Two-finger swipe completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, gestureTime=${result.gestureTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Two-finger swipe failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Two-finger swipe request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request a drag gesture from the accessibility service using dispatchGesture API.
   * @param x1 - Starting X coordinate
   * @param y1 - Starting Y coordinate
   * @param x2 - Ending X coordinate
   * @param y2 - Ending Y coordinate
   * @param duration - Drag duration in milliseconds
   * @param holdTime - Hold time before dragging in milliseconds
   * @param timeoutMs - Maximum time to wait for drag completion in milliseconds
   * @returns Promise<A11yDragResult> - The drag result with timing information
   */
  async requestDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 500,
    holdTime: number = 200,
    timeoutMs: number = 5000
  ): Promise<A11yDragResult> {
    const startTime = Date.now();

    try {
      const connected = await this.connectWebSocket();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for drag");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `drag_${Date.now()}_${generateSecureId()}`;
      this.pendingDragRequestId = requestId;

      const dragPromise = new Promise<A11yDragResult>(resolve => {
        this.pendingDragResolve = resolve;
        this.timer.setTimeout(() => {
          if (this.pendingDragResolve === resolve) {
            this.pendingDragResolve = null;
            this.pendingDragRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Drag timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "request_drag",
        requestId,
        x1: Math.round(x1),
        y1: Math.round(y1),
        x2: Math.round(x2),
        y2: Math.round(y2),
        duration,
        holdTime
      });
      this.ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent drag request (requestId: ${requestId}, ${x1},${y1} -> ${x2},${y2}, duration: ${duration}ms, hold: ${holdTime}ms)`);

      const result = await dragPromise;
      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Drag completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, gestureTime=${result.gestureTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Drag failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Drag request failed after ${durationMs}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: durationMs,
        error: `${error}`
      };
    }
  }

  /**
   * Request a pinch gesture from the accessibility service using dispatchGesture API.
   */
  async requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yPinchResult> {
    const startTime = Date.now();

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for pinch");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `pinch_${Date.now()}_${generateSecureId()}`;
      this.pendingPinchRequestId = requestId;

      const pinchPromise = new Promise<A11yPinchResult>(resolve => {
        this.pendingPinchResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingPinchResolve === resolve) {
            this.pendingPinchResolve = null;
            this.pendingPinchRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Pinch timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_pinch",
          requestId,
          centerX: Math.round(centerX),
          centerY: Math.round(centerY),
          distanceStart: Math.round(distanceStart),
          distanceEnd: Math.round(distanceEnd),
          rotationDegrees,
          duration
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent pinch request (requestId: ${requestId}, center=${centerX},${centerY}, distanceStart=${distanceStart}, distanceEnd=${distanceEnd}, rotation=${rotationDegrees}, duration: ${duration}ms)`);
      });

      const result = await perf.track("waitForPinch", () => pinchPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Pinch completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, gestureTime=${result.gestureTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Pinch failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Pinch request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request text input via the accessibility service using ACTION_SET_TEXT.
   * This is significantly faster than ADB's input text command because it
   * bypasses the entire ADB/shell overhead and directly sets text on the
   * focused input field.
   *
   * @param text - The text to input
   * @param resourceId - Optional resource-id to target a specific element (otherwise uses focused element)
   * @param timeoutMs - Maximum time to wait for text input in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11ySetTextResult> - The text input result with timing information
   */
  async requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySetTextResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for setText");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send set text request
      const requestId = `setText_${Date.now()}_${generateSecureId()}`;
      this.pendingSetTextRequestId = requestId;

      // Create promise that will be resolved when we receive the set text result
      const setTextPromise = new Promise<A11ySetTextResult>(resolve => {
        this.pendingSetTextResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingSetTextResolve === resolve) {
            this.pendingSetTextResolve = null;
            this.pendingSetTextRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Set text timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_set_text",
          requestId,
          text,
          resourceId
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent set text request (requestId: ${requestId}, text length: ${text.length}, resourceId: ${resourceId || "focused"})`);
      });

      // Wait for response
      const result = await perf.track("waitForSetText", () => setTextPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Set text completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Set text failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Set text request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Clear text from the currently focused input field via the accessibility service.
   * This uses ACTION_SET_TEXT with an empty string, which is significantly faster
   * than sending multiple KEYCODE_DEL events via ADB.
   *
   * @param resourceId - Optional resource-id to target a specific element (otherwise uses focused element)
   * @param timeoutMs - Maximum time to wait for clear operation in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11ySetTextResult> - The clear result with timing information
   */
  async requestClearText(
    resourceId?: string,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySetTextResult> {
    logger.debug("[ACCESSIBILITY_SERVICE] Clearing text via requestSetText with empty string");
    return this.requestSetText("", resourceId, timeoutMs, perf);
  }

  /**
   * Request an IME action via the accessibility service.
   * This properly handles focus movement (next/previous) by finding the next/previous
   * focusable element and calling ACTION_FOCUS, rather than using KEYCODE_TAB
   * which would insert a tab character.
   *
   * For done/go/send/search actions, it dismisses the keyboard by going back.
   *
   * @param action - The IME action to perform: done, next, search, send, go, previous
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11yImeActionResult> - The IME action result with timing information
   */
  async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yImeActionResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for IME action");
        return {
          success: false,
          action,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send IME action request
      const requestId = `imeAction_${Date.now()}_${generateSecureId()}`;
      this.pendingImeActionRequestId = requestId;

      // Create promise that will be resolved when we receive the IME action result
      const imeActionPromise = new Promise<A11yImeActionResult>(resolve => {
        this.pendingImeActionResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingImeActionResolve === resolve) {
            this.pendingImeActionResolve = null;
            this.pendingImeActionRequestId = null;
            resolve({
              success: false,
              action,
              totalTimeMs: Date.now() - startTime,
              error: `IME action timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_ime_action",
          requestId,
          action
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent IME action request (requestId: ${requestId}, action: ${action})`);
      });

      // Wait for response
      const result = await perf.track("waitForImeAction", () => imeActionPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] IME action completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, action=${result.action}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] IME action failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] IME action request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request select all text via the accessibility service.
   * This uses ACTION_SET_SELECTION to select all text in the focused field,
   * which is significantly faster than using ADB double-tap gestures.
   *
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11ySelectAllResult> - The select all result with timing information
   */
  async requestSelectAll(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySelectAllResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for select all");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send select all request
      const requestId = `selectAll_${Date.now()}_${generateSecureId()}`;
      this.pendingSelectAllRequestId = requestId;

      // Create promise that will be resolved when we receive the select all result
      const selectAllPromise = new Promise<A11ySelectAllResult>(resolve => {
        this.pendingSelectAllResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingSelectAllResolve === resolve) {
            this.pendingSelectAllResolve = null;
            this.pendingSelectAllRequestId = null;
            resolve({
              success: false,
              totalTimeMs: Date.now() - startTime,
              error: `Select all timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_select_all",
          requestId
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent select all request (requestId: ${requestId})`);
      });

      // Wait for response
      const result = await perf.track("waitForSelectAll", () => selectAllPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Select all completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Select all failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Select all request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request a node action via the accessibility service.
   *
   * @param action - The action name (e.g., long_click)
   * @param resourceId - Optional resource-id to target a specific element
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11yActionResult> - The action result with timing information
   */
  async requestAction(
    action: string,
    resourceId?: string,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yActionResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for action");
        return {
          success: false,
          action,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send action request
      const requestId = `action_${Date.now()}_${generateSecureId()}`;
      this.pendingActionRequestId = requestId;
      logger.info(`[ACCESSIBILITY_SERVICE] Creating action request (requestId: ${requestId}, action: ${action}, resourceId: ${resourceId})`);

      // Create promise that will be resolved when we receive the action result
      const actionPromise = new Promise<A11yActionResult>(resolve => {
        this.pendingActionResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingActionResolve === resolve) {
            this.pendingActionResolve = null;
            this.pendingActionRequestId = null;
            resolve({
              success: false,
              action,
              totalTimeMs: Date.now() - startTime,
              error: `Action timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_action",
          requestId,
          action,
          resourceId
        });
        this.ws.send(message);
        logger.info(`[ACCESSIBILITY_SERVICE] Sent action request (requestId: ${requestId}, action: ${action}, resourceId: ${resourceId})`);
      });

      // Wait for response
      const result = await perf.track("waitForAction", () => actionPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Action completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, action=${result.action}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Action failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Action request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request a clipboard operation via the accessibility service
   * This uses ClipboardManager to copy/paste/clear/get clipboard content
   *
   * @param action - Clipboard action: copy, paste, clear, or get
   * @param text - Text to copy (required for 'copy' action)
   * @param timeoutMs - Maximum time to wait for action completion in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<A11yClipboardResult> - The clipboard operation result with timing information
   */
  async requestClipboard(
    action: "copy" | "paste" | "clear" | "get",
    text?: string,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yClipboardResult> {
    const startTime = Date.now();

    try {
      // Validate input
      if (action === "copy" && !text) {
        return {
          success: false,
          action,
          totalTimeMs: Date.now() - startTime,
          error: "Text is required for copy action"
        };
      }

      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for clipboard");
        return {
          success: false,
          action,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send clipboard request
      const requestId = `clipboard_${Date.now()}_${generateSecureId()}`;
      this.pendingClipboardRequestId = requestId;

      // Create promise that will be resolved when we receive the clipboard result
      const clipboardPromise = new Promise<A11yClipboardResult>(resolve => {
        this.pendingClipboardResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingClipboardResolve === resolve) {
            this.pendingClipboardResolve = null;
            this.pendingClipboardRequestId = null;
            resolve({
              success: false,
              action,
              totalTimeMs: Date.now() - startTime,
              error: `Clipboard ${action} timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_clipboard",
          requestId,
          action,
          text
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent clipboard request (requestId: ${requestId}, action: ${action})`);
      });

      // Wait for response
      const result = await perf.track("waitForClipboard", () => clipboardPromise);

      const clientDuration = Date.now() - startTime;
      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Clipboard ${action} completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Clipboard ${action} failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Clipboard request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request installation of a CA certificate via the accessibility service.
   * The certificate payload can be PEM or base64-encoded DER.
   */
  async requestInstallCaCertificate(
    certificate: string,
    timeoutMs: number = 10000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    const startTime = Date.now();
    const trimmed = certificate.trim();

    if (!trimmed) {
      return {
        success: false,
        action: "install",
        totalTimeMs: Date.now() - startTime,
        error: "Certificate payload is required"
      };
    }

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for CA cert install");
        return {
          success: false,
          action: "install",
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `ca_cert_install_${Date.now()}_${generateSecureId()}`;
      this.pendingCaCertRequestId = requestId;

      const caCertPromise = new Promise<A11yCaCertResult>(resolve => {
        this.pendingCaCertResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingCaCertResolve === resolve) {
            this.pendingCaCertResolve = null;
            this.pendingCaCertRequestId = null;
            resolve({
              success: false,
              action: "install",
              totalTimeMs: Date.now() - startTime,
              error: `CA cert install timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "install_ca_cert",
          requestId,
          certificate: trimmed
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent CA cert install request (requestId: ${requestId})`);
      });

      const result = await perf.track("waitForCaCertInstall", () => caCertPromise);
      const clientDuration = Date.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] CA cert install completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, alias=${result.alias ?? "unknown"}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] CA cert install failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] CA cert install request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action: "install",
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request installation of a CA certificate from a host file path.
   * Pushes the file to the device before requesting installation.
   */
  async requestInstallCaCertificateFromFile(
    certificatePath: string,
    timeoutMs: number = 10000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    const startTime = Date.now();
    const resolvedPath = this.resolveCertificatePath(certificatePath);

    if (!resolvedPath) {
      return {
        success: false,
        action: "install",
        totalTimeMs: Date.now() - startTime,
        error: "certificatePath must be a valid host file path"
      };
    }

    try {
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        return {
          success: false,
          action: "install",
          totalTimeMs: Date.now() - startTime,
          error: `Certificate path is not a file: ${resolvedPath}`
        };
      }

      if (stats.size === 0) {
        return {
          success: false,
          action: "install",
          totalTimeMs: Date.now() - startTime,
          error: `Certificate file is empty: ${resolvedPath}`
        };
      }

      const devicePath = await perf.track("pushCertificate", async () => {
        return this.pushCertificateToDevice(resolvedPath);
      });

      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for CA cert install");
        return {
          success: false,
          action: "install",
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `ca_cert_install_${Date.now()}_${generateSecureId()}`;
      this.pendingCaCertRequestId = requestId;

      const caCertPromise = new Promise<A11yCaCertResult>(resolve => {
        this.pendingCaCertResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingCaCertResolve === resolve) {
            this.pendingCaCertResolve = null;
            this.pendingCaCertRequestId = null;
            resolve({
              success: false,
              action: "install",
              totalTimeMs: Date.now() - startTime,
              error: `CA cert install timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "install_ca_cert_from_path",
          requestId,
          devicePath
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent CA cert install request (requestId: ${requestId}, devicePath: ${devicePath})`);
      });

      const result = await perf.track("waitForCaCertInstall", () => caCertPromise);
      const clientDuration = Date.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] CA cert install completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, alias=${result.alias ?? "unknown"}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] CA cert install failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        action: "install",
        totalTimeMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Request removal of a CA certificate via the accessibility service.
   * Uses the alias returned from installation.
   */
  async requestRemoveCaCertificate(
    alias: string,
    timeoutMs: number = 10000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yCaCertResult> {
    const startTime = Date.now();
    const trimmedAlias = alias.trim();

    if (!trimmedAlias) {
      return {
        success: false,
        action: "remove",
        totalTimeMs: Date.now() - startTime,
        error: "Certificate alias is required"
      };
    }

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for CA cert removal");
        return {
          success: false,
          action: "remove",
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `ca_cert_remove_${Date.now()}_${generateSecureId()}`;
      this.pendingCaCertRequestId = requestId;

      const caCertPromise = new Promise<A11yCaCertResult>(resolve => {
        this.pendingCaCertResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingCaCertResolve === resolve) {
            this.pendingCaCertResolve = null;
            this.pendingCaCertRequestId = null;
            resolve({
              success: false,
              action: "remove",
              totalTimeMs: Date.now() - startTime,
              error: `CA cert removal timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "remove_ca_cert",
          requestId,
          alias: trimmedAlias
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent CA cert removal request (requestId: ${requestId}, alias: ${trimmedAlias})`);
      });

      const result = await perf.track("waitForCaCertRemoval", () => caCertPromise);
      const clientDuration = Date.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] CA cert removal completed: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, alias=${result.alias ?? trimmedAlias}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] CA cert removal failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] CA cert removal request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        action: "remove",
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request device owner status via the accessibility service.
   */
  async requestDeviceOwnerStatus(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yDeviceOwnerStatusResult> {
    const startTime = Date.now();

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for device owner status");
        return {
          success: false,
          isDeviceOwner: false,
          isAdminActive: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `device_owner_status_${Date.now()}_${generateSecureId()}`;
      this.pendingDeviceOwnerStatusRequestId = requestId;

      const statusPromise = new Promise<A11yDeviceOwnerStatusResult>(resolve => {
        this.pendingDeviceOwnerStatusResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingDeviceOwnerStatusResolve === resolve) {
            this.pendingDeviceOwnerStatusResolve = null;
            this.pendingDeviceOwnerStatusRequestId = null;
            resolve({
              success: false,
              isDeviceOwner: false,
              isAdminActive: false,
              totalTimeMs: Date.now() - startTime,
              error: `Device owner status timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "get_device_owner_status",
          requestId
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent device owner status request (requestId: ${requestId})`);
      });

      const result = await perf.track("waitForDeviceOwnerStatus", () => statusPromise);
      const clientDuration = Date.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Device owner status received: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, owner=${result.isDeviceOwner}, admin=${result.isAdminActive}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Device owner status failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Device owner status request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        isDeviceOwner: false,
        isAdminActive: false,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Request permission status via the accessibility service.
   */
  async requestPermission(
    permission: string,
    requestPermission: boolean = true,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11yPermissionResult> {
    const startTime = Date.now();
    const trimmedPermission = permission.trim();

    if (!trimmedPermission) {
      return {
        success: false,
        permission: "unknown",
        granted: false,
        totalTimeMs: Date.now() - startTime,
        requestLaunched: false,
        canRequest: false,
        requiresSettings: false,
        error: "Permission name is required"
      };
    }

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for permission request");
        return {
          success: false,
          permission: trimmedPermission,
          granted: false,
          totalTimeMs: Date.now() - startTime,
          requestLaunched: false,
          canRequest: false,
          requiresSettings: false,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = `permission_${Date.now()}_${generateSecureId()}`;
      this.pendingPermissionRequestId = requestId;

      const permissionPromise = new Promise<A11yPermissionResult>(resolve => {
        this.pendingPermissionResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingPermissionResolve === resolve) {
            this.pendingPermissionResolve = null;
            this.pendingPermissionRequestId = null;
            resolve({
              success: false,
              permission: trimmedPermission,
              granted: false,
              totalTimeMs: Date.now() - startTime,
              requestLaunched: false,
              canRequest: false,
              requiresSettings: false,
              error: `Permission request timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "get_permission",
          requestId,
          permission: trimmedPermission,
          requestPermission
        });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent permission request (requestId: ${requestId}, permission: ${trimmedPermission})`);
      });

      const result = await perf.track("waitForPermission", () => permissionPromise);
      const clientDuration = Date.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Permission status received: clientTime=${clientDuration}ms, deviceTotalTime=${result.totalTimeMs}ms, permission=${result.permission}, granted=${result.granted}`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Permission request failed after ${clientDuration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Permission request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        permission: trimmedPermission,
        granted: false,
        totalTimeMs: duration,
        requestLaunched: false,
        canRequest: false,
        requiresSettings: false,
        error: `${error}`
      };
    }
  }

  private resolveCertificatePath(certificatePath: string): string | null {
    const trimmedPath = certificatePath.trim();
    if (!trimmedPath) {
      return null;
    }

    if (trimmedPath.startsWith("file://")) {
      try {
        return fileURLToPath(trimmedPath);
      } catch (error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Failed to parse certificate file URL: ${error}`);
        return null;
      }
    }

    if (trimmedPath.startsWith("content://") || trimmedPath.startsWith("/sdcard")) {
      return null;
    }

    return path.resolve(trimmedPath);
  }

  private async pushCertificateToDevice(sourcePath: string): Promise<string> {
    const deviceDir = AccessibilityServiceClient.DEVICE_CERT_DIR;
    await this.adb.executeCommand(`shell mkdir -p ${deviceDir}`, undefined, undefined, true);

    const devicePath = this.buildDeviceCertificatePath(sourcePath);
    await this.adb.executeCommand(
      `push ${quoteForAdbArg(sourcePath)} ${quoteForAdbArg(devicePath)}`,
      undefined,
      undefined,
      true
    );

    return devicePath;
  }

  private buildDeviceCertificatePath(sourcePath: string): string {
    const ext = path.extname(sourcePath) || ".crt";
    const base = path.basename(sourcePath, ext);
    const fileName = `${base}_${Date.now()}_${generateSecureId()}${ext}`;
    return `${AccessibilityServiceClient.DEVICE_CERT_DIR}/${fileName}`;
  }

  /**
   * Clear accessibility focus (TalkBack cursor) on the current element.
   *
   * STUB: This is a placeholder implementation. Full implementation is deferred to a future PR.
   * Currently logs a warning and does nothing.
   */
  async clearAccessibilityFocus(): Promise<void> {
    logger.warn("[ACCESSIBILITY_SERVICE] clearAccessibilityFocus() called but not yet implemented (stub)");
    // TODO: Implement accessibility focus clearing
    // This should send a command to the Android accessibility service to clear focus
  }

  /**
   * Set accessibility focus (TalkBack cursor) on a specific element.
   *
   * STUB: This is a placeholder implementation. Full implementation is deferred to a future PR.
   * Currently logs a warning and does nothing.
   *
   * @param resourceId - Resource ID of the element to focus
   */
  async setAccessibilityFocus(resourceId: string): Promise<void> {
    logger.warn(`[ACCESSIBILITY_SERVICE] setAccessibilityFocus(${resourceId}) called but not yet implemented (stub)`);
    // TODO: Implement accessibility focus setting
    // This should send a command to the Android accessibility service to set focus on the element
  }

  /**
   * Get the current accessibility focus element (TalkBack cursor position)
   * @param timeoutMs - Maximum time to wait for result in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<CurrentFocusResult> - The current focus result
   */
  async requestCurrentFocus(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<CurrentFocusResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for current focus");
        return {
          focusedElement: null,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send current focus request
      const requestId = `current_focus_${Date.now()}_${generateSecureId()}`;
      this.pendingCurrentFocusRequestId = requestId;

      // Create promise that will be resolved when we receive the result
      const focusPromise = new Promise<CurrentFocusResult>(resolve => {
        this.pendingCurrentFocusResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingCurrentFocusResolve === resolve) {
            this.pendingCurrentFocusResolve = null;
            this.pendingCurrentFocusRequestId = null;
            resolve({
              focusedElement: null,
              totalTimeMs: Date.now() - startTime,
              error: `Current focus timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "get_current_focus", requestId });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent current focus request (requestId: ${requestId})`);
      });

      // Wait for response
      const result = await perf.track("waitForCurrentFocus", () => focusPromise);

      const duration = Date.now() - startTime;
      if (result.error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Current focus failed after ${duration}ms: ${result.error}`);
      } else {
        logger.info(`[ACCESSIBILITY_SERVICE] Current focus received in ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Current focus request failed after ${duration}ms: ${error}`);
      return {
        focusedElement: null,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Get the traversal order of accessibility-focusable elements
   * @param timeoutMs - Maximum time to wait for result in milliseconds
   * @param perf - Performance tracker for timing
   * @returns Promise<TraversalOrderResult> - The traversal order result
   */
  async requestTraversalOrder(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<TraversalOrderResult> {
    const startTime = Date.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for traversal order");
        return {
          elements: [],
          focusedIndex: null,
          totalCount: 0,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send traversal order request
      const requestId = `traversal_order_${Date.now()}_${generateSecureId()}`;
      this.pendingTraversalOrderRequestId = requestId;

      // Create promise that will be resolved when we receive the result
      const traversalPromise = new Promise<TraversalOrderResult>(resolve => {
        this.pendingTraversalOrderResolve = resolve;

        // Set up timeout
        this.timer.setTimeout(() => {
          if (this.pendingTraversalOrderResolve === resolve) {
            this.pendingTraversalOrderResolve = null;
            this.pendingTraversalOrderRequestId = null;
            resolve({
              elements: [],
              focusedIndex: null,
              totalCount: 0,
              totalTimeMs: Date.now() - startTime,
              error: `Traversal order timeout after ${timeoutMs}ms`
            });
          }
        }, timeoutMs);
      });

      // Send the request
      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "get_traversal_order", requestId });
        this.ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent traversal order request (requestId: ${requestId})`);
      });

      // Wait for response
      const result = await perf.track("waitForTraversalOrder", () => traversalPromise);

      const duration = Date.now() - startTime;
      if (result.error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Traversal order failed after ${duration}ms: ${result.error}`);
      } else {
        logger.info(`[ACCESSIBILITY_SERVICE] Traversal order received in ${duration}ms (${result.totalCount} elements)`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Traversal order request failed after ${duration}ms: ${error}`);
      return {
        elements: [],
        focusedIndex: null,
        totalCount: 0,
        totalTimeMs: duration,
        error: `${error}`
      };
    }
  }

  /**
   * Add a visual highlight overlay entry.
   */
  async requestAddHighlight(
    id: string,
    shape: HighlightShape,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<HighlightOperationResult> {
    return this.requestHighlightOperation(
      "add_highlight",
      { id, shape },
      timeoutMs,
      perf
    );
  }

  /**
   * Remove a visual highlight overlay entry.
   */
  async requestRemoveHighlight(
    id: string,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<HighlightOperationResult> {
    return this.requestHighlightOperation(
      "remove_highlight",
      { id },
      timeoutMs,
      perf
    );
  }

  /**
   * Clear all visual highlight overlay entries.
   */
  async requestClearHighlights(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<HighlightOperationResult> {
    return this.requestHighlightOperation(
      "clear_highlights",
      {},
      timeoutMs,
      perf
    );
  }

  /**
   * List current visual highlight overlay entries.
   */
  async requestListHighlights(
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<HighlightOperationResult> {
    return this.requestHighlightOperation(
      "list_highlights",
      {},
      timeoutMs,
      perf
    );
  }

  private async requestHighlightOperation(
    type: "add_highlight" | "remove_highlight" | "clear_highlights" | "list_highlights",
    payload: { id?: string; shape?: HighlightShape },
    timeoutMs: number,
    perf: PerformanceTracker
  ): Promise<HighlightOperationResult> {
    const startTime = Date.now();

    try {
      const connected = await perf.track("ensureConnection", () => this.connectWebSocket(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for highlight operation");
        return {
          success: false,
          error: "Failed to connect to accessibility service",
          highlights: []
        };
      }

      const requestId = `highlight_${Date.now()}_${generateSecureId()}`;
      this.pendingHighlightRequestId = requestId;

      const highlightPromise = new Promise<HighlightOperationResult>(resolve => {
        this.pendingHighlightResolve = resolve;

        this.timer.setTimeout(() => {
          if (this.pendingHighlightResolve === resolve) {
            this.pendingHighlightResolve = null;
            this.pendingHighlightRequestId = null;
            resolve({
              success: false,
              error: `Highlight request timeout after ${timeoutMs}ms`,
              highlights: []
            });
          }
        }, timeoutMs);
      });

      await perf.track("sendRequest", async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }

        const messagePayload: Record<string, unknown> = {
          type,
          requestId
        };

        if (payload.id) {
          messagePayload.id = payload.id;
        }
        if (payload.shape) {
          messagePayload.shape = this.normalizeHighlightShape(payload.shape);
        }

        this.ws.send(JSON.stringify(messagePayload));
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent highlight request (${type}, requestId: ${requestId})`);
      });

      const result = await perf.track("waitForHighlight", () => highlightPromise);
      const duration = Date.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Highlight ${type} completed in ${duration}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Highlight ${type} failed after ${duration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Highlight ${type} request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        error: `${error}`,
        highlights: []
      };
    }
  }

  private normalizeHighlightShape(shape: HighlightShape): HighlightShape {
    const bounds = shape.bounds;
    return {
      ...shape,
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        sourceWidth: bounds.sourceWidth === null || bounds.sourceWidth === undefined
          ? bounds.sourceWidth
          : Math.round(bounds.sourceWidth),
        sourceHeight: bounds.sourceHeight === null || bounds.sourceHeight === undefined
          ? bounds.sourceHeight
          : Math.round(bounds.sourceHeight)
      }
    };
  }
}
