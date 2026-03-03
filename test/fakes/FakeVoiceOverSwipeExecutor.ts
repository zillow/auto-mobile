import { GestureOptions } from "../../src/models";
import { SwipeResult } from "../../src/models/SwipeResult";
import { PerformanceTracker } from "../../src/utils/PerformanceTracker";
import { VoiceOverSwipeRunner } from "../../src/features/action/swipeon/types";

export class FakeVoiceOverSwipeExecutor implements VoiceOverSwipeRunner {
  private swipeCalls: Array<{ x1: number; y1: number; x2: number; y2: number; gestureOptions?: GestureOptions }> = [];

  async executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions?: GestureOptions,
    _perf?: PerformanceTracker
  ): Promise<SwipeResult> {
    this.swipeCalls.push({ x1, y1, x2, y2, gestureOptions });
    return { success: true, x1, y1, x2, y2, duration: gestureOptions?.duration ?? 300 };
  }

  getSwipeCalls() { return [...this.swipeCalls]; }
  getCallCount() { return this.swipeCalls.length; }
  reset() { this.swipeCalls = []; }
}
