/**
 * XCTestServiceNavigation - Delegate for navigation operations.
 *
 * This delegate handles navigation operations including pressHome and launchApp
 * via the iOS XCTestService WebSocket API.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  DelegateContext,
  XCTestPressHomeResult,
  XCTestLaunchAppResult,
} from "./types";

/**
 * Delegate class for handling navigation operations.
 */
export class XCTestServiceNavigation {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Request to press the home button.
   */
  async requestPressHome(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestPressHomeResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("pressHome");
    const promise = this.context.requestManager.register<XCTestPressHomeResult>(
      requestId,
      "press_home",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Press home timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_press_home",
      requestId
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }

  /**
   * Request to launch an app by bundle ID.
   */
  async requestLaunchApp(
    bundleId: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestLaunchAppResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("launchApp");
    const promise = this.context.requestManager.register<XCTestLaunchAppResult>(
      requestId,
      "launch_app",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Launch app timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_launch_app",
      requestId,
      bundleId
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }
}
