/**
 * AccessibilityServiceText - Delegate for text input operations.
 *
 * This delegate handles text input operations including setting text, clearing text,
 * IME actions (done, next, search, etc.), and select all.
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import type { DelegateContext, A11ySetTextResult, A11yImeActionResult, A11ySelectAllResult } from "./types";

/**
 * Delegate class for handling text input operations.
 */
export class AccessibilityServiceText {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for setText");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send set text request
      const requestId = this.context.requestManager.generateId("setText");

      // Register request with automatic timeout handling
      const setTextPromise = this.context.requestManager.register<A11ySetTextResult>(
        requestId,
        "setText",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Set text timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_set_text",
          requestId,
          text,
          resourceId
        });
        ws.send(message);
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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
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
      const requestId = this.context.requestManager.generateId("imeAction");

      // Register request with automatic timeout handling
      const imeActionPromise = this.context.requestManager.register<A11yImeActionResult>(
        requestId,
        "imeAction",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          action,
          totalTimeMs: Date.now() - startTime,
          error: `IME action timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_ime_action",
          requestId,
          action
        });
        ws.send(message);
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

    // Cancel any pending screenshot backoff - new action will change the screen
    this.context.cancelScreenshotBackoff();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for select all");
        return {
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send select all request
      const requestId = this.context.requestManager.generateId("selectAll");

      // Register request with automatic timeout handling
      const selectAllPromise = this.context.requestManager.register<A11ySelectAllResult>(
        requestId,
        "selectAll",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          totalTimeMs: Date.now() - startTime,
          error: `Select all timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({
          type: "request_select_all",
          requestId
        });
        ws.send(message);
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
}
