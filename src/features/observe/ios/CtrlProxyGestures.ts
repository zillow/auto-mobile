/**
 * CtrlProxyGestures - iOS gesture delegate.
 *
 * Thin wrapper over SharedGestureDelegate with iOS-specific config
 * (no coordinate rounding).
 */

import { SharedGestureDelegate } from "../shared/SharedGestureDelegate";
import type { DelegateContext, GestureTimingResult } from "./types";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

export class CtrlProxyGestures extends SharedGestureDelegate {
  constructor(context: DelegateContext) {
    super(context, { logTag: "CTRL_PROXY", roundCoordinates: false });
  }

  /**
   * Request a multi-finger swipe gesture for VoiceOver compatibility.
   *
   * @param x1 - Start X coordinate
   * @param y1 - Start Y coordinate
   * @param x2 - End X coordinate
   * @param y2 - End Y coordinate
   * @param fingerCount - Number of fingers (e.g. 3 for VoiceOver scroll)
   * @param duration - Gesture duration in milliseconds (default: 300)
   * @param timeoutMs - Request timeout in milliseconds (default: 5000)
   * @param perf - Optional performance tracker
   * @returns Gesture timing result
   */
  async requestMultiFingerSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fingerCount: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<GestureTimingResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected to CtrlProxy" };
    }

    const requestId = this.context.requestManager.generateId("multi_finger_swipe");
    const promise = this.context.requestManager.register<GestureTimingResult>(
      requestId,
      "multi_finger_swipe",
      timeoutMs,
      () => ({
        success: false,
        totalTimeMs: timeoutMs,
        error: `Multi-finger swipe timed out after ${timeoutMs}ms`
      })
    );

    const message = {
      type: "request_multi_finger_swipe",
      requestId,
      x1,
      y1,
      x2,
      y2,
      fingerCount,
      duration,
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));

    return promise;
  }
}
