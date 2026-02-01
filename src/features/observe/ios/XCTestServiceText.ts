/**
 * XCTestServiceText - Delegate for text input operations.
 *
 * This delegate handles text input operations including setText, clearText,
 * IME actions, and selectAll via the iOS XCTestService WebSocket API.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  DelegateContext,
  XCTestSetTextResult,
  XCTestImeActionResult,
  XCTestSelectAllResult,
} from "./types";

/**
 * Delegate class for handling text input operations.
 */
export class XCTestServiceText {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Request to set text in the currently focused text field.
   */
  async requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("setText");
    const promise = this.context.requestManager.register<XCTestSetTextResult>(
      requestId,
      "set_text",
      timeoutMs,
      (_id, _type, timeout) => ({
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

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }

  /**
   * Request to clear text in the currently focused text field.
   */
  async requestClearText(
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSetTextResult> {
    return this.requestSetText("", resourceId, timeoutMs, perf);
  }

  /**
   * Request an IME action (done, next, search, send, go, previous).
   */
  async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestImeActionResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, action, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("imeAction");
    const promise = this.context.requestManager.register<XCTestImeActionResult>(
      requestId,
      "ime_action",
      timeoutMs,
      (_id, _type, timeout) => ({
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

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }

  /**
   * Request to select all text in the currently focused text field.
   */
  async requestSelectAll(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSelectAllResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("selectAll");
    const promise = this.context.requestManager.register<XCTestSelectAllResult>(
      requestId,
      "select_all",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Select all timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_select_all",
      requestId
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }
}
