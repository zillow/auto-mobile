/**
 * SharedGestureDelegate - Unified delegate for gesture operations.
 *
 * Handles swipe, tap, drag, and pinch gestures for both Android and iOS.
 * Platform differences are captured in SharedGestureConfig:
 * - logTag: log prefix ("ACCESSIBILITY_SERVICE" vs "XCTEST_SERVICE")
 * - roundCoordinates: Android rounds to integers, iOS passes exact values
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type { DelegateContext, GestureTimingResult, BaseResult } from "./types";
import { createMessage } from "../DeviceServiceUtils";

export interface SharedGestureConfig {
  logTag: string;
  roundCoordinates: boolean;
}

export class SharedGestureDelegate {
  protected readonly context: DelegateContext;
  private readonly config: SharedGestureConfig;

  constructor(context: DelegateContext, config: SharedGestureConfig) {
    this.context = context;
    this.config = config;
  }

  private coord(v: number): number {
    return this.config.roundCoordinates ? Math.round(v) : v;
  }

  async requestTapCoordinates(
    x: number,
    y: number,
    duration: number = 0,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<BaseResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("tap");
    const promise = this.context.requestManager.register<BaseResult>(
      requestId,
      "tap_coordinates",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Tap timed out after ${timeout}ms`
      })
    );

    const msg = createMessage("request_tap_coordinates", requestId, {
      x: this.coord(x),
      y: this.coord(y),
      duration
    });
    this.context.getWebSocket()?.send(msg);
    return promise;
  }

  async requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<GestureTimingResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("swipe");
    const promise = this.context.requestManager.register<GestureTimingResult>(
      requestId,
      "swipe",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Swipe timed out after ${timeout}ms`
      })
    );

    const msg = createMessage("request_swipe", requestId, {
      x1: this.coord(x1),
      y1: this.coord(y1),
      x2: this.coord(x2),
      y2: this.coord(y2),
      duration
    });
    this.context.getWebSocket()?.send(msg);
    return promise;
  }

  async requestDrag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pressDurationMs: number,
    dragDurationMs: number,
    holdDurationMs: number,
    timeoutMs: number
  ): Promise<GestureTimingResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected()) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("drag");
    const promise = this.context.requestManager.register<GestureTimingResult>(
      requestId,
      "drag",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Drag timed out after ${timeout}ms`
      })
    );

    const msg = createMessage("request_drag", requestId, {
      x1: this.coord(x1),
      y1: this.coord(y1),
      x2: this.coord(x2),
      y2: this.coord(y2),
      pressDurationMs,
      dragDurationMs,
      holdDurationMs
    });
    this.context.getWebSocket()?.send(msg);
    return promise;
  }

  async requestPinch(
    centerX: number,
    centerY: number,
    distanceStart: number,
    distanceEnd: number,
    rotationDegrees: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<GestureTimingResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("pinch");
    const promise = this.context.requestManager.register<GestureTimingResult>(
      requestId,
      "pinch",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Pinch timed out after ${timeout}ms`
      })
    );

    const msg = createMessage("request_pinch", requestId, {
      centerX: this.coord(centerX),
      centerY: this.coord(centerY),
      distanceStart: this.coord(distanceStart),
      distanceEnd: this.coord(distanceEnd),
      rotationDegrees,
      duration
    });
    this.context.getWebSocket()?.send(msg);
    return promise;
  }
}
