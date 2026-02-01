import type { ScreenSize } from "../../src/features/observe/interfaces/ScreenSize";
import type { ScreenSize as ScreenSizeModel, ExecResult } from "../../src/models";

/**
 * Fake implementation of ScreenSize for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeScreenSize implements ScreenSize {
  private calls: { dumpsysResult?: ExecResult }[] = [];
  private configuredScreenSize: ScreenSizeModel = { width: 1080, height: 1920 };
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Get the screen size (fake implementation).
   */
  async execute(dumpsysResult?: ExecResult): Promise<ScreenSizeModel> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.calls.push({ dumpsysResult });
    return { ...this.configuredScreenSize };
  }

  // Test helpers

  /**
   * Configure the screen size to return.
   */
  configureScreenSize(size: ScreenSizeModel): void {
    this.configuredScreenSize = size;
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
    this.configuredScreenSize = { width: 1080, height: 1920 };
    this.shouldFail = false;
    this.failureError = null;
  }
}
