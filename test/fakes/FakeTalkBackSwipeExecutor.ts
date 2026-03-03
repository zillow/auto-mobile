import { Element, GestureOptions, SwipeDirection } from "../../src/models";
import { SwipeResult } from "../../src/models/SwipeResult";
import { PerformanceTracker } from "../../src/utils/PerformanceTracker";
import { TalkBackSwipeRunner, BoomerangConfig } from "../../src/features/action/swipeon/types";

export class FakeTalkBackSwipeExecutor implements TalkBackSwipeRunner {
  private swipeCalls: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    direction: SwipeDirection;
    containerElement: Element | null;
    gestureOptions?: GestureOptions;
  }> = [];

  private nextResult: Partial<SwipeResult> | null = null;

  setFailureResult(result: Partial<SwipeResult>): void {
    this.nextResult = result;
  }

  async executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: SwipeDirection,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    _perf?: PerformanceTracker,
    _boomerang?: BoomerangConfig
  ): Promise<SwipeResult> {
    const overrideResult = this.nextResult;
    this.nextResult = null;
    if (overrideResult) {
      this.swipeCalls.push({ x1, y1, x2, y2, direction, containerElement, gestureOptions });
      return { success: false, x1, y1, x2, y2, duration: gestureOptions?.duration ?? 300, ...overrideResult };
    }
    this.swipeCalls.push({ x1, y1, x2, y2, direction, containerElement, gestureOptions });
    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration: gestureOptions?.duration ?? 300
    };
  }

  getSwipeCalls(): Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    direction: SwipeDirection;
    containerElement: Element | null;
    gestureOptions?: GestureOptions;
  }> {
    return [...this.swipeCalls];
  }

  getDirections(): SwipeDirection[] {
    return this.swipeCalls.map(c => c.direction);
  }

  getCallCount(): number {
    return this.swipeCalls.length;
  }

  reset(): void {
    this.swipeCalls = [];
  }
}
