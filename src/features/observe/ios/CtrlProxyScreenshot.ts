/**
 * CtrlProxy iOSScreenshot - Delegate for screenshot operations.
 *
 * This delegate handles screenshot capture via the iOS CtrlProxy iOS WebSocket API.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  DelegateContext,
  XCTestScreenshotResult,
} from "./types";

/**
 * Delegate class for handling screenshot operations.
 */
export class CtrlProxyScreenshot {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Request a screenshot from the CtrlProxy iOS.
   */
  async requestScreenshot(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestScreenshotResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("screenshot");
    const promise = this.context.requestManager.register<XCTestScreenshotResult>(
      requestId,
      "screenshot",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        error: `Screenshot timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_screenshot",
      requestId
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }
}
