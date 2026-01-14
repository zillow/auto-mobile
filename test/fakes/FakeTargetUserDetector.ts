import { TargetUserDetector } from "../../src/features/action/LaunchApp";
import { Timer } from "../../src/utils/SystemTimer";

type FakeTargetUserDetectorOptions = {
  delayMs?: number;
  resolvedUserId?: number;
  shouldThrow?: boolean;
  error?: Error;
};

export class FakeTargetUserDetector implements TargetUserDetector {
  private timer: Timer;
  private delayMs: number;
  private resolvedUserId: number;
  private shouldThrow: boolean;
  private error: Error;
  private calls: Array<{ packageName: string; userId?: number }> = [];
  private completedCount = 0;

  constructor(timer: Timer, options: FakeTargetUserDetectorOptions = {}) {
    this.timer = timer;
    this.delayMs = options.delayMs ?? 0;
    this.resolvedUserId = options.resolvedUserId ?? 0;
    this.shouldThrow = options.shouldThrow ?? false;
    this.error = options.error ?? new Error("Fake target user detector error");
  }

  async detectTargetUserId(packageName: string, userId?: number): Promise<number> {
    this.calls.push({ packageName, userId });
    await this.timer.sleep(this.delayMs);
    this.completedCount += 1;
    if (this.shouldThrow) {
      throw this.error;
    }
    return userId ?? this.resolvedUserId;
  }

  getCallCount(): number {
    return this.calls.length;
  }

  getCompletedCount(): number {
    return this.completedCount;
  }
}
