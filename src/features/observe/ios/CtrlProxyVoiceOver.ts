/**
 * CtrlProxy iOS VoiceOver - Delegate for VoiceOver state detection.
 *
 * Sends a get_voiceover_state command over the WebSocket connection to the
 * iOS CtrlProxy, which calls UIAccessibility.isVoiceOverRunning and returns
 * the result.
 */

import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type { DelegateContext, CtrlProxyVoiceOverResult } from "./types";

/**
 * Delegate class for VoiceOver state detection via CtrlProxy WebSocket.
 */
export class CtrlProxyVoiceOver {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Request current VoiceOver state from the iOS CtrlProxy.
   *
   * @param timeoutMs - Request timeout in milliseconds (default: 5000)
   * @param perf - Optional performance tracker
   * @returns VoiceOver state result with enabled boolean
   */
  async requestVoiceOverState(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<CtrlProxyVoiceOverResult> {
    if (!await this.context.ensureConnected(perf)) {
      return { success: false, enabled: false, error: "Not connected to CtrlProxy" };
    }

    const requestId = this.context.requestManager.generateId("voiceover");
    const promise = this.context.requestManager.register<CtrlProxyVoiceOverResult>(
      requestId,
      "voiceover",
      timeoutMs,
      () => ({ success: false, enabled: false, error: "Timeout waiting for voiceover_state_result" })
    );

    const message = {
      type: "get_voiceover_state",
      requestId,
    };

    const ws = this.context.getWebSocket();
    ws?.send(JSON.stringify(message));

    return promise;
  }
}
