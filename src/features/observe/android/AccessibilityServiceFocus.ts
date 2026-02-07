/**
 * AccessibilityServiceFocus - Delegate for TalkBack focus and traversal operations.
 *
 * This delegate handles accessibility focus (TalkBack cursor) operations including
 * getting current focus, traversal order, and setting/clearing focus.
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import type { CurrentFocusResult, TraversalOrderResult, Element } from "../../../models";
import type { DelegateContext, AccessibilityNode } from "./types";
import { ElementParser } from "../../utility/ElementParser";

/**
 * Delegate class for handling TalkBack focus and traversal operations.
 */
export class AccessibilityServiceFocus {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
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
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for current focus");
        return {
          focusedElement: null,
          totalTimeMs: this.context.timer.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send current focus request
      const requestId = this.context.requestManager.generateId("currentFocus");

      // Register request with automatic timeout handling
      const focusPromise = this.context.requestManager.register<CurrentFocusResult>(
        requestId,
        "currentFocus",
        timeoutMs,
        (_id, _type, timeout) => ({
          focusedElement: null,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Current focus timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "get_current_focus", requestId });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent current focus request (requestId: ${requestId})`);
      });

      // Wait for response
      const result = await perf.track("waitForCurrentFocus", () => focusPromise);

      const duration = this.context.timer.now() - startTime;
      if (result.error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Current focus failed after ${duration}ms: ${result.error}`);
      } else {
        logger.info(`[ACCESSIBILITY_SERVICE] Current focus received in ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
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
    const startTime = this.context.timer.now();

    try {
      // Ensure WebSocket connection is established
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for traversal order");
        return {
          elements: [],
          focusedIndex: null,
          totalCount: 0,
          totalTimeMs: this.context.timer.now() - startTime,
          error: "Failed to connect to accessibility service"
        };
      }

      // Send traversal order request
      const requestId = this.context.requestManager.generateId("traversalOrder");

      // Register request with automatic timeout handling
      const traversalPromise = this.context.requestManager.register<TraversalOrderResult>(
        requestId,
        "traversalOrder",
        timeoutMs,
        (_id, _type, timeout) => ({
          elements: [],
          focusedIndex: null,
          totalCount: 0,
          totalTimeMs: this.context.timer.now() - startTime,
          error: `Traversal order timeout after ${timeout}ms`
        })
      );

      // Send the request
      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }
        const message = JSON.stringify({ type: "get_traversal_order", requestId });
        ws.send(message);
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent traversal order request (requestId: ${requestId})`);
      });

      // Wait for response
      const result = await perf.track("waitForTraversalOrder", () => traversalPromise);

      const duration = this.context.timer.now() - startTime;
      if (result.error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Traversal order failed after ${duration}ms: ${result.error}`);
      } else {
        logger.info(`[ACCESSIBILITY_SERVICE] Traversal order received in ${duration}ms (${result.totalCount} elements)`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
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
   * Convert AccessibilityNode to Element type.
   * This is used by the main client's message handler to process focus results.
   * @param node - Accessibility node from WebSocket message
   * @returns Converted Element or null if conversion fails
   */
  convertAccessibilityNodeToElement(node: AccessibilityNode): Element | null {
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

  /**
   * Convert accessibility node to intermediate format for ElementParser.
   */
  private convertAccessibilityNode(node: AccessibilityNode | AccessibilityNode[]): any {
    // Handle array of nodes
    if (Array.isArray(node)) {
      const convertedArray = node.map(child => this.convertAccessibilityNode(child));
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
}
