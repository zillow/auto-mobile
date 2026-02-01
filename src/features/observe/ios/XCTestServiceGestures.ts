/**
 * XCTestServiceGestures - Delegate for gesture operations.
 *
 * This delegate handles gesture operations including swipe, tap, drag, and pinch
 * via the iOS XCTestService WebSocket API.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type {
  DelegateContext,
  XCTestSwipeResult,
  XCTestTapResult,
  XCTestDragResult,
  XCTestPinchResult,
} from "./types";

/**
 * Delegate class for handling gesture operations.
 */
export class XCTestServiceGestures {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Request a coordinate-based tap from the XCTestService.
   */
  async requestTapCoordinates(
    x: number,
    y: number,
    duration: number = 0,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestTapResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("tap");
    const promise = this.context.requestManager.register<XCTestTapResult>(
      requestId,
      "tap_coordinates",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Tap timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_tap_coordinates",
      requestId,
      x,
      y,
      duration
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }

  /**
   * Request a swipe gesture from the XCTestService.
   */
  async requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestSwipeResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("swipe");
    const promise = this.context.requestManager.register<XCTestSwipeResult>(
      requestId,
      "swipe",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Swipe timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_swipe",
      requestId,
      x1,
      y1,
      x2,
      y2,
      duration
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }

  /**
   * Request a drag gesture from the XCTestService.
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
  ): Promise<XCTestDragResult> {
    if (!await this.context.ensureConnected()) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("drag");
    const promise = this.context.requestManager.register<XCTestDragResult>(
      requestId,
      "drag",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Drag timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_drag",
      requestId,
      x1,
      y1,
      x2,
      y2,
      pressDurationMs,
      dragDurationMs,
      holdDurationMs
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }

  /**
   * Request a pinch gesture from the XCTestService.
   */
  async requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<XCTestPinchResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("pinch");
    const promise = this.context.requestManager.register<XCTestPinchResult>(
      requestId,
      "pinch",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Pinch timed out after ${timeout}ms`
      })
    );

    const message = {
      type: "request_pinch",
      requestId,
      centerX,
      centerY,
      distanceStart,
      distanceEnd,
      duration
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));
    return promise;
  }
}
