import type { Element } from "../../src/models/Element";
import type {
  TalkBackTapResult,
  TalkBackTapAction,
  TalkBackFallbackAction
} from "../../src/features/talkback/TalkBackTapStrategy";
import type { TalkBackNavigationDriver } from "../../src/features/talkback/TalkBackNavigationDriver";

/**
 * Fake implementation of TalkBackTapStrategy for testing TapOnElement delegation.
 */
export class FakeTalkBackTapStrategy {
  tapResult: TalkBackTapResult = { success: true, method: "focus-navigation" };
  fallbackResult: TalkBackTapResult = { success: true, method: "coordinate-fallback" };

  tapCalls: Array<{
    deviceId: string;
    element: Element;
    action: TalkBackTapAction;
  }> = [];

  fallbackCalls: Array<{
    x: number;
    y: number;
    action: TalkBackFallbackAction;
    durationMs: number;
  }> = [];

  private tapOverrides: TalkBackTapResult[] = [];
  private fallbackOverrides: TalkBackTapResult[] = [];

  setTapResult(result: TalkBackTapResult): void {
    this.tapResult = result;
  }

  setFallbackResult(result: TalkBackTapResult): void {
    this.fallbackResult = result;
  }

  queueTapResult(result: TalkBackTapResult): void {
    this.tapOverrides.push(result);
  }

  queueFallbackResult(result: TalkBackTapResult): void {
    this.fallbackOverrides.push(result);
  }

  async executeTap(
    deviceId: string,
    element: Element,
    action: TalkBackTapAction,
    _driver: TalkBackNavigationDriver
  ): Promise<TalkBackTapResult> {
    this.tapCalls.push({ deviceId, element, action });

    if (this.tapOverrides.length > 0) {
      return this.tapOverrides.shift()!;
    }

    return this.tapResult;
  }

  async executeCoordinateFallback(
    x: number,
    y: number,
    action: TalkBackFallbackAction,
    durationMs: number,
    _driver: TalkBackNavigationDriver
  ): Promise<TalkBackTapResult> {
    this.fallbackCalls.push({ x, y, action, durationMs });

    if (this.fallbackOverrides.length > 0) {
      return this.fallbackOverrides.shift()!;
    }

    return this.fallbackResult;
  }
}
