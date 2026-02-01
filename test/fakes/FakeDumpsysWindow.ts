import type { DumpsysWindow } from "../../src/features/observe/interfaces/DumpsysWindow";
import type { ExecResult } from "../../src/models";

/**
 * Fake implementation of DumpsysWindow for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeDumpsysWindow implements DumpsysWindow {
  private executeCalls: { signal?: AbortSignal }[] = [];
  private refreshCalls: { signal?: AbortSignal }[] = [];
  private configuredResult: ExecResult = { stdout: "", stderr: "" };
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Get dumpsys window (fake implementation).
   */
  async execute(_perf?: any, signal?: AbortSignal): Promise<ExecResult> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.executeCalls.push({ signal });
    return { ...this.configuredResult };
  }

  /**
   * Refresh dumpsys window (fake implementation).
   */
  async refresh(_perf?: any, signal?: AbortSignal): Promise<ExecResult> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.refreshCalls.push({ signal });
    return { ...this.configuredResult };
  }

  // Test helpers

  /**
   * Configure the result to return.
   */
  configureResult(result: ExecResult): void {
    this.configuredResult = result;
  }

  /**
   * Configure to throw an error on execute()/refresh().
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
  getExecuteCallCount(): number {
    return this.executeCalls.length;
  }

  /**
   * Get the number of refresh() calls.
   */
  getRefreshCallCount(): number {
    return this.refreshCalls.length;
  }

  /**
   * Check if execute() was called.
   */
  wasExecuteCalled(): boolean {
    return this.executeCalls.length > 0;
  }

  /**
   * Check if refresh() was called.
   */
  wasRefreshCalled(): boolean {
    return this.refreshCalls.length > 0;
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.executeCalls = [];
    this.refreshCalls = [];
    this.configuredResult = { stdout: "", stderr: "" };
    this.shouldFail = false;
    this.failureError = null;
  }
}
