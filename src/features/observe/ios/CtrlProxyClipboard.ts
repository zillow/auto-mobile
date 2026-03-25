/**
 * CtrlProxy iOS Clipboard - Delegate for clipboard operations.
 *
 * This delegate handles clipboard operations (get, copy, paste, clear)
 * via the iOS CtrlProxy WebSocket API.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  DelegateContext,
  CtrlProxyClipboardResult,
} from "./types";

/**
 * Delegate class for handling clipboard operations.
 */
export class CtrlProxyClipboard {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Request a clipboard operation.
   */
  async requestClipboard(
    action: "copy" | "paste" | "clear" | "get",
    text?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<CtrlProxyClipboardResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, action, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("clipboard");
    const promise = this.context.requestManager.register<CtrlProxyClipboardResult>(
      requestId,
      "clipboard",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        action,
        totalTimeMs: timeout,
        error: `Clipboard operation timed out after ${timeout}ms`
      })
    );

    const message: Record<string, unknown> = {
      type: "request_clipboard",
      requestId,
      action
    };
    if (text !== undefined) {
      message.text = text;
    }

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }
}
