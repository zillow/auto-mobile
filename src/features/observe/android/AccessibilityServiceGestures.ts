/**
 * AccessibilityServiceGestures - Delegate for gesture operations.
 *
 * This delegate handles gesture operations including swipe, tap, drag, and pinch
 * via the dispatchGesture API which is faster than ADB input commands.
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  DelegateContext,
  A11ySwipeResult,
  A11yTapCoordinatesResult,
  A11yDragResult,
  A11yPinchResult,
} from "./types";
import { generateSecureId } from "./types";

/**
 * Delegate class for handling gesture operations.
 */
export class AccessibilityServiceGestures {
  private readonly context: DelegateContext;

  // Legacy pending request state for two-finger swipe (still uses manual promise pattern)
  private pendingSwipeRequestId: string | null = null;
  private pendingSwipeResolve: ((result: A11ySwipeResult) => void) | null = null;

  constructor(context: DelegateContext) {
    this.context = context;
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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for swipe");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Generate request ID and register with RequestManager
      const requestId = this.context.requestManager.generateId("swipe");

      // Register request with automatic timeout handling
      const swipePromise = this.context.requestManager.register<A11ySwipeResult>(
        requestId,
        "swipe",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Swipe timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
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
        ws.send(message);
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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for tap coordinates");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Generate request ID and register with RequestManager
      const requestId = this.context.requestManager.generateId("tap_coordinates");

      // Register request with automatic timeout handling
      const tapPromise = this.context.requestManager.register<A11yTapCoordinatesResult>(
        requestId,
        "tap_coordinates",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Tap coordinates timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_tap_coordinates",
          requestId,
          x: Math.round(x),
          y: Math.round(y),
          duration
        });
        ws.send(message);
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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for two-finger swipe");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send two-finger swipe request (uses legacy promise pattern)
      const requestId = `two_finger_swipe_${Date.now()}_${generateSecureId()}`;
      this.pendingSwipeRequestId = requestId;

      // Create promise that will be resolved when we receive the swipe result
      const swipePromise = new Promise<A11ySwipeResult>(resolve => {
        this.pendingSwipeResolve = resolve;

        // Set up timeout
        this.context.timer.setTimeout(() => {
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
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
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
        ws.send(message);
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
   * @param pressDurationMs - Press duration before dragging in milliseconds
   * @param dragDurationMs - Drag duration in milliseconds
   * @param holdDurationMs - Hold duration after dragging in milliseconds
   * @param timeoutMs - Maximum time to wait for drag completion in milliseconds
   * @returns Promise<A11yDragResult> - The drag result with timing information
   */
  async requestDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pressDurationMs: number,
    dragDurationMs: number,
    holdDurationMs: number,
    timeoutMs: number
  ): Promise<A11yDragResult> {
    const startTime = Date.now();

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      const connected = await this.context.ensureConnected();
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for drag");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("drag");

      // Register request with automatic timeout handling
      const dragPromise = this.context.requestManager.register<A11yDragResult>(
        requestId,
        "drag",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Drag timeout after ${timeout}ms`
        })
      );

      const ws = this.context.getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
      }
      const message = JSON.stringify({
        type: "request_drag",
        requestId,
        x1: Math.round(x1),
        y1: Math.round(y1),
        x2: Math.round(x2),
        y2: Math.round(y2),
        pressDurationMs,
        dragDurationMs,
        holdDurationMs
      });
      ws.send(message);
      logger.debug(`[ACCESSIBILITY_SERVICE] Sent drag request (requestId: ${requestId}, ${x1},${y1} -> ${x2},${y2}, press: ${pressDurationMs}ms, drag: ${dragDurationMs}ms, hold: ${holdDurationMs}ms)`);

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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for pinch");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("pinch");

      // Register request with automatic timeout handling
      const pinchPromise = this.context.requestManager.register<A11yPinchResult>(
        requestId,
        "pinch",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Pinch timeout after ${timeout}ms`
        })
      );

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
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
        ws.send(message);
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
   * Handle two-finger swipe result from WebSocket message.
   * This is called by the main client when a two_finger_swipe result is received.
   */
  handleTwoFingerSwipeResult(requestId: string, result: A11ySwipeResult): boolean {
    if (this.pendingSwipeRequestId === requestId && this.pendingSwipeResolve) {
      const resolve = this.pendingSwipeResolve;
      this.pendingSwipeResolve = null;
      this.pendingSwipeRequestId = null;
      resolve(result);
      return true;
    }
    return false;
  }
}
