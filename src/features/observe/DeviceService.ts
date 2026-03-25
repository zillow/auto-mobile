/**
 * DeviceService - Unified interface for device automation clients
 *
 * This interface defines common operations shared between Android (CtrlProxyClient)
 * and iOS (CtrlProxyClient) device clients. Platform-specific operations are defined
 * in extended interfaces.
 */

import type { PerformanceTracker } from "../../utils/PerformanceTracker";

// =============================================================================
// Common Result Types
// =============================================================================

/**
 * Base result interface for all device operations.
 */
interface DeviceOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Result for gesture operations (tap, swipe, drag, pinch).
 */
export interface GestureResult extends DeviceOperationResult {
  totalTimeMs: number;
  gestureTimeMs?: number;
}

/**
 * Result for text input operations.
 */
export interface TextResult extends DeviceOperationResult {
  totalTimeMs: number;
}

/**
 * Result for screenshot operations.
 */
export interface ScreenshotResult extends DeviceOperationResult {
  /** Base64 encoded image data */
  data?: string;
  /** Image format (e.g., "png", "jpeg") */
  format?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Capture timestamp */
  timestamp?: number;
}

/**
 * Result for IME (Input Method Editor) actions.
 */
interface ImeActionResult extends DeviceOperationResult {
  totalTimeMs: number;
  /** The action that was performed */
  action?: string;
}

// =============================================================================
// Device Service Interface
// =============================================================================

/**
 * Core device service interface with operations common to all platforms.
 *
 * Implementations:
 * - CtrlProxyClient (Android)
 * - CtrlProxyClient (iOS)
 */
export interface DeviceService {
  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  /**
   * Ensure connection to the device service is established.
   * @param perf Optional performance tracker for timing
   * @returns true if connected, false otherwise
   */
  ensureConnected(perf?: PerformanceTracker): Promise<boolean>;

  /**
   * Wait for connection with retry logic.
   * @param maxAttempts Maximum number of connection attempts
   * @param delayMs Delay between attempts in milliseconds
   * @returns true if connected, false if all attempts failed
   */
  waitForConnection(maxAttempts?: number, delayMs?: number): Promise<boolean>;

  /**
   * Check if currently connected to the device service.
   */
  isConnected(): boolean;

  /**
   * Close the connection to the device service.
   */
  close(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Gestures
  // ---------------------------------------------------------------------------

  /**
   * Perform a tap at the specified coordinates.
   * @param x X coordinate
   * @param y Y coordinate
   * @param duration Tap duration in milliseconds (0 for instant tap)
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestTapCoordinates(
    x: number,
    y: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<GestureResult>;

  /**
   * Perform a swipe gesture.
   * @param x1 Start X coordinate
   * @param y1 Start Y coordinate
   * @param x2 End X coordinate
   * @param y2 End Y coordinate
   * @param duration Swipe duration in milliseconds
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<GestureResult>;

  /**
   * Perform a drag gesture (press, move, release).
   * @param x1 Start X coordinate
   * @param y1 Start Y coordinate
   * @param x2 End X coordinate
   * @param y2 End Y coordinate
   * @param pressDurationMs Duration to hold before dragging
   * @param dragDurationMs Duration of the drag motion
   * @param holdDurationMs Duration to hold at destination before release
   * @param timeoutMs Operation timeout in milliseconds
   */
  requestDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pressDurationMs: number,
    dragDurationMs: number,
    holdDurationMs: number,
    timeoutMs: number
  ): Promise<GestureResult>;

  /**
   * Perform a pinch gesture (zoom in/out).
   * @param centerX Center X coordinate
   * @param centerY Center Y coordinate
   * @param distanceStart Starting distance between fingers
   * @param distanceEnd Ending distance between fingers
   * @param rotationDegrees Rotation during pinch (optional)
   * @param duration Gesture duration in milliseconds
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees?: number,
    duration?: number,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<GestureResult>;

  // ---------------------------------------------------------------------------
  // Text Input
  // ---------------------------------------------------------------------------

  /**
   * Set text in the focused input field.
   * @param text Text to input
   * @param resourceId Optional element identifier to target
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker,
    dismissKeyboard?: boolean
  ): Promise<TextResult>;

  /**
   * Clear text from the focused input field.
   * @param resourceId Optional element identifier to target
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestClearText(
    resourceId?: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<TextResult>;

  /**
   * Perform an IME action (done, next, search, send, go, previous).
   * @param action The IME action to perform
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestImeAction(
    action: string,
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<ImeActionResult>;

  // ---------------------------------------------------------------------------
  // Screenshot
  // ---------------------------------------------------------------------------

  /**
   * Capture a screenshot of the device screen.
   * @param timeoutMs Operation timeout in milliseconds
   * @param perf Optional performance tracker
   */
  requestScreenshot(
    timeoutMs?: number,
    perf?: PerformanceTracker
  ): Promise<ScreenshotResult>;
}

// =============================================================================
// Platform-Specific Extensions
// =============================================================================

/**
 * Android-specific device service operations.
 */
export interface AndroidDeviceService extends DeviceService {
  /**
   * Perform clipboard operations.
   * @param action The clipboard action: "copy", "paste", "clear", "get"
   * @param text Text to copy (required for "copy" action)
   * @param timeoutMs Operation timeout in milliseconds
   */
  requestClipboard(
    action: string,
    text?: string,
    timeoutMs?: number
  ): Promise<ClipboardResult>;

  /**
   * Select all text in the focused input field.
   * @param timeoutMs Operation timeout in milliseconds
   */
  requestSelectAll(timeoutMs?: number): Promise<TextResult>;

  /**
   * Perform a node action on an element.
   * @param action The action to perform (e.g., "long_click")
   * @param resourceId Optional element identifier
   * @param timeoutMs Operation timeout in milliseconds
   */
  requestAction(
    action: string,
    resourceId?: string,
    timeoutMs?: number
  ): Promise<ActionResult>;

  /**
   * Get current accessibility focus information.
   * @param timeoutMs Operation timeout in milliseconds
   */
  requestCurrentFocus(timeoutMs?: number): Promise<FocusResult>;

  /**
   * Get accessibility traversal order.
   * @param timeoutMs Operation timeout in milliseconds
   */
  requestTraversalOrder(timeoutMs?: number): Promise<TraversalResult>;
}

// =============================================================================
// Additional Result Types for Platform-Specific Operations
// =============================================================================

/**
 * Result for clipboard operations (Android).
 */
interface ClipboardResult extends DeviceOperationResult {
  totalTimeMs: number;
  /** The action that was performed */
  action: string;
  /** Text content (for "get" action) */
  text?: string;
}

/**
 * Result for node action operations (Android).
 */
interface ActionResult extends DeviceOperationResult {
  totalTimeMs: number;
  /** The action that was performed */
  action?: string;
}

/**
 * Result for focus query (Android).
 */
interface FocusResult extends DeviceOperationResult {
  totalTimeMs: number;
  /** JSON string of focused element */
  focusedElement?: string;
}

/**
 * Result for traversal order query (Android).
 */
interface TraversalResult extends DeviceOperationResult {
  totalTimeMs: number;
  /** Traversal order data */
  result?: {
    elements: string[];
    focusedIndex?: number;
    totalCount: number;
  };
}
