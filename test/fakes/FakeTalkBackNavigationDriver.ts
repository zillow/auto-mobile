import type { TalkBackNavigationDriver } from "../../src/features/talkback/TalkBackNavigationDriver";
import type { A11yActionResult, A11yTapCoordinatesResult } from "../../src/features/observe/accessibility/types";
import { FakeFocusNavigationDriver } from "./FakeFocusNavigationDriver";

/**
 * Fake implementation of TalkBackNavigationDriver for testing.
 * Extends FakeFocusNavigationDriver with tap and action capabilities.
 */
export class FakeTalkBackNavigationDriver
  extends FakeFocusNavigationDriver
  implements TalkBackNavigationDriver {
  tapResult: A11yTapCoordinatesResult = { success: true, totalTimeMs: 1 };
  actionResult: A11yActionResult = { success: true, action: "click", totalTimeMs: 1 };

  tapHistory: Array<{ x: number; y: number; durationMs: number }> = [];
  actionHistory: Array<{ action: string; resourceId?: string }> = [];

  private tapOverrides: A11yTapCoordinatesResult[] = [];
  private actionOverrides: A11yActionResult[] = [];

  setTapResult(result: A11yTapCoordinatesResult): void {
    this.tapResult = result;
  }

  setActionResult(result: A11yActionResult): void {
    this.actionResult = result;
  }

  queueTapResult(result: A11yTapCoordinatesResult): void {
    this.tapOverrides.push(result);
  }

  queueActionResult(result: A11yActionResult): void {
    this.actionOverrides.push(result);
  }

  getTapCount(): number {
    return this.tapHistory.length;
  }

  getActionCount(): number {
    return this.actionHistory.length;
  }

  async requestTapCoordinates(
    x: number,
    y: number,
    durationMs: number
  ): Promise<A11yTapCoordinatesResult> {
    this.tapHistory.push({ x, y, durationMs });

    if (this.tapOverrides.length > 0) {
      return this.tapOverrides.shift()!;
    }

    return this.tapResult;
  }

  async requestAction(action: string, resourceId?: string): Promise<A11yActionResult> {
    this.actionHistory.push({ action, resourceId });

    if (this.actionOverrides.length > 0) {
      return this.actionOverrides.shift()!;
    }

    return this.actionResult;
  }
}
