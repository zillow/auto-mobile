import type { SystemInsets } from "../../src/features/observe/interfaces/SystemInsets";
import type { SystemInsets as SystemInsetsModel, ExecResult } from "../../src/models";

/**
 * Fake implementation of SystemInsets for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeSystemInsets implements SystemInsets {
  private calls: { dumpsysWindow: ExecResult }[] = [];
  private configuredInsets: SystemInsetsModel = { top: 0, right: 0, bottom: 0, left: 0 };
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Get the system insets (fake implementation).
   */
  async execute(dumpsysWindow: ExecResult): Promise<SystemInsetsModel> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.calls.push({ dumpsysWindow });
    return { ...this.configuredInsets };
  }

  // Test helpers

  /**
   * Configure the system insets to return.
   */
  configureInsets(insets: SystemInsetsModel): void {
    this.configuredInsets = insets;
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
    this.configuredInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.shouldFail = false;
    this.failureError = null;
  }
}
