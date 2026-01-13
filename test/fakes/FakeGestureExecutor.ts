import { GestureOptions } from "../../src/models";
import { SwipeResult } from "../../src/models/SwipeResult";
import { PerformanceTracker } from "../../src/utils/PerformanceTracker";
import { GestureExecutor } from "../../src/features/action/SwipeOn";

export class FakeGestureExecutor implements GestureExecutor {
  private swipeCalls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    options?: GestureOptions;
  }> = [];

  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: GestureOptions = {},
    _perf: PerformanceTracker | undefined = undefined
  ): Promise<SwipeResult> {
    this.swipeCalls.push({ x1, y1, x2, y2, options });
    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration: options.duration ?? 0
    };
  }

  getSwipeCalls(): Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    options?: GestureOptions;
  }> {
    return [...this.swipeCalls];
  }
}
