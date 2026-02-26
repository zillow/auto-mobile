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
  longPressResult: TalkBackTapResult = { success: true, method: "accessibility-action" };

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

  longPressCalls: Array<{
    x: number;
    y: number;
    durationMs: number;
    element: Element;
  }> = [];

  private tapOverrides: TalkBackTapResult[] = [];
  private fallbackOverrides: TalkBackTapResult[] = [];
  private longPressOverrides: TalkBackTapResult[] = [];

  setTapResult(result: TalkBackTapResult): void {
    this.tapResult = result;
  }

  setFallbackResult(result: TalkBackTapResult): void {
    this.fallbackResult = result;
  }

  setLongPressResult(result: TalkBackTapResult): void {
    this.longPressResult = result;
  }

  queueTapResult(result: TalkBackTapResult): void {
    this.tapOverrides.push(result);
  }

  queueFallbackResult(result: TalkBackTapResult): void {
    this.fallbackOverrides.push(result);
  }

  queueLongPressResult(result: TalkBackTapResult): void {
    this.longPressOverrides.push(result);
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

  async executeLongPress(
    x: number,
    y: number,
    durationMs: number,
    element: Element,
    _driver: TalkBackNavigationDriver
  ): Promise<TalkBackTapResult> {
    this.longPressCalls.push({ x, y, durationMs, element });

    if (this.longPressOverrides.length > 0) {
      return this.longPressOverrides.shift()!;
    }

    return this.longPressResult;
  }
}
