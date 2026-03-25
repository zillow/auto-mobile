/**
 * SharedTextDelegate - Unified delegate for text input operations.
 *
 * Handles setText, clearText, IME actions, and selectAll for both Android and iOS.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type { DelegateContext, BaseResult, ActionTimingResult } from "./types";
import { createMessage } from "../DeviceServiceUtils";

export class SharedTextDelegate {
  protected readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * @param dismissKeyboard Android-only. Suppresses the soft keyboard via
   *   SHOW_MODE_HIDDEN after setText. Ignored on iOS (no handler on Swift side).
   */
  async requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker,
    dismissKeyboard: boolean = false
  ): Promise<BaseResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("setText");
    const promise = this.context.requestManager.register<BaseResult>(
      requestId,
      "set_text",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Set text timed out after ${timeout}ms`
      })
    );

    const params: Record<string, unknown> = { text };
    if (resourceId) {
      params.resourceId = resourceId;
    }
    if (dismissKeyboard) {
      params.dismissKeyboard = true;
    }

    const msg = createMessage("request_set_text", requestId, params);
    this.context.getWebSocket()?.send(msg);
    return promise;
  }

  async requestClearText(
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<BaseResult> {
    return this.requestSetText("", resourceId, timeoutMs, perf);
  }

  async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<ActionTimingResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, action, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("imeAction");
    const promise = this.context.requestManager.register<ActionTimingResult>(
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

    const msg = createMessage("request_ime_action", requestId, { action });
    this.context.getWebSocket()?.send(msg);
    return promise;
  }

  async requestSelectAll(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<BaseResult> {
    this.context.cancelScreenshotBackoff();

    if (!await this.context.ensureConnected(perf)) {
      return { success: false, totalTimeMs: 0, error: "Not connected" };
    }

    const requestId = this.context.requestManager.generateId("selectAll");
    const promise = this.context.requestManager.register<BaseResult>(
      requestId,
      "select_all",
      timeoutMs,
      (_id, _type, timeout) => ({
        success: false,
        totalTimeMs: timeout,
        error: `Select all timed out after ${timeout}ms`
      })
    );

    const msg = createMessage("request_select_all", requestId);
    this.context.getWebSocket()?.send(msg);
    return promise;
  }
}
