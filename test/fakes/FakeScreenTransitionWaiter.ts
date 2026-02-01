import { ScreenTransitionWaiter } from "../../src/features/navigation/interfaces/ScreenTransitionWaiter";
import { defaultTimer } from "../../src/utils/SystemTimer";

/**
 * Fake implementation of ScreenTransitionWaiter for testing.
 * Allows full control over screen transition behavior and tracks method calls.
 */
export class FakeScreenTransitionWaiter implements ScreenTransitionWaiter {
  // Configurable responses
  private waitResults: Map<string, boolean> = new Map();
  private defaultWaitResult: boolean = true;
  private waitDelay: number = 0;
  private shouldThrow: boolean = false;
  private errorMessage: string = "Fake error";

  // Call tracking
  private methodCalls: Map<string, any[][]> = new Map();

  // ==================== Configuration Methods ====================

  /**
   * Set the result for waitForScreen for a specific screen name.
   */
  setWaitResult(screenName: string, result: boolean): void {
    this.waitResults.set(screenName, result);
  }

  /**
   * Set the default result for waitForScreen when no specific result is configured.
   */
  setDefaultWaitResult(result: boolean): void {
    this.defaultWaitResult = result;
  }

  /**
   * Set a delay to simulate wait time.
   */
  setWaitDelay(delayMs: number): void {
    this.waitDelay = delayMs;
  }

  /**
   * Configure the fake to throw an error on the next call.
   */
  setShouldThrow(shouldThrow: boolean, errorMessage?: string): void {
    this.shouldThrow = shouldThrow;
    if (errorMessage) {
      this.errorMessage = errorMessage;
    }
  }

  /**
   * Clear all configured wait results.
   */
  clearWaitResults(): void {
    this.waitResults.clear();
  }

  // ==================== Call Tracking ====================

  private trackCall(method: string, args: any[]): void {
    if (!this.methodCalls.has(method)) {
      this.methodCalls.set(method, []);
    }
    this.methodCalls.get(method)!.push(args);
  }

  /**
   * Check if a method was called.
   */
  wasMethodCalled(method: string): boolean {
    return (this.methodCalls.get(method)?.length ?? 0) > 0;
  }

  /**
   * Get number of times a method was called.
   */
  getMethodCallCount(method: string): number {
    return this.methodCalls.get(method)?.length ?? 0;
  }

  /**
   * Get the arguments of a specific call to a method.
   */
  getMethodCallArgs(method: string, callIndex: number = 0): any[] | undefined {
    return this.methodCalls.get(method)?.[callIndex];
  }

  /**
   * Clear all tracked method calls.
   */
  clearCallHistory(): void {
    this.methodCalls.clear();
  }

  // ==================== ScreenTransitionWaiter Interface Implementation ====================

  async waitForScreen(screenName: string, timeoutMs: number): Promise<boolean> {
    this.trackCall("waitForScreen", [screenName, timeoutMs]);

    if (this.shouldThrow) {
      throw new Error(this.errorMessage);
    }

    // Simulate delay if configured
    if (this.waitDelay > 0) {
      await defaultTimer.sleep(this.waitDelay);
    }

    // Return configured result for this screen, or default
    return this.waitResults.get(screenName) ?? this.defaultWaitResult;
  }
}
