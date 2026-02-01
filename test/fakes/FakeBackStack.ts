import type { BackStack } from "../../src/features/observe/interfaces/BackStack";
import type { BackStackInfo } from "../../src/models";

/**
 * Fake implementation of BackStack for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeBackStack implements BackStack {
  private calls: { signal?: AbortSignal }[] = [];
  private configuredBackStack: BackStackInfo = {
    depth: 0,
    activities: [],
    tasks: [],
    capturedAt: Date.now(),
    source: "adb"
  };
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Get the back stack (fake implementation).
   */
  async execute(_perf?: any, signal?: AbortSignal): Promise<BackStackInfo> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.calls.push({ signal });
    return { ...this.configuredBackStack, capturedAt: Date.now() };
  }

  // Test helpers

  /**
   * Configure the back stack to return.
   */
  configureBackStack(backStack: BackStackInfo): void {
    this.configuredBackStack = backStack;
  }

  /**
   * Configure to throw an error on execute().
   */
  setFailure(error: Error): void {
    this.shouldFail = true;
    this.failureError = error;
  }

  /**
   * Clear failure configuration.
   */
  clearFailure(): void {
    this.shouldFail = false;
    this.failureError = null;
  }

  /**
   * Get the number of execute() calls.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Check if execute() was called.
   */
  wasCalled(): boolean {
    return this.calls.length > 0;
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.calls = [];
    this.configuredBackStack = {
      depth: 0,
      activities: [],
      tasks: [],
      capturedAt: Date.now(),
      source: "adb"
    };
    this.shouldFail = false;
    this.failureError = null;
  }
}
