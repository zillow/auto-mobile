/**
 * CtrlProxyGestures - Android gesture delegate.
 *
 * Extends SharedGestureDelegate with Android-specific config (coordinate rounding)
 * and the Android-only two-finger swipe operation for TalkBack mode.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { SharedGestureDelegate } from "../shared/SharedGestureDelegate";
import type { DelegateContext, A11ySwipeResult } from "./types";
import { generateSecureId } from "./types";

export class CtrlProxyGestures extends SharedGestureDelegate {
  // Legacy pending request state for two-finger swipe (uses manual promise pattern)
  private pendingSwipeRequestId: string | null = null;
  private pendingSwipeResolve: ((result: A11ySwipeResult) => void) | null = null;

  constructor(context: DelegateContext) {
    super(context, { logTag: "ACCESSIBILITY_SERVICE", roundCoordinates: true });
  }

  /**
   * Request a two-finger swipe gesture for TalkBack mode.
   * This is Android-only and uses a legacy manual promise pattern.
   */
  async requestTwoFingerSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    offset: number = 100,
    timeoutMs: number = 5000,
    _perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<A11ySwipeResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected()) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = `two_finger_swipe_${this.context.timer.now()}_${generateSecureId()}`;
    this.pendingSwipeRequestId = requestId;

    const swipePromise = new Promise<A11ySwipeResult>(resolve => {
      this.pendingSwipeResolve = resolve;

      this.context.timer.setTimeout(() => {
        if (this.pendingSwipeResolve === resolve) {
          this.pendingSwipeResolve = null;
          this.pendingSwipeRequestId = null;
          resolve({
            success: false,
            totalTimeMs: timeoutMs,
            error: `Two-finger swipe timeout after ${timeoutMs}ms`
          });
        }
      }, timeoutMs);
    });

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
    this.context.getWebSocket()?.send(message);

    return swipePromise;
  }

  /**
   * Handle two-finger swipe result from WebSocket message.
   * Called by the main client when a two_finger_swipe result is received.
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
