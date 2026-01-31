import type { ScreenshotService } from "../../src/features/observe/interfaces/ScreenshotService";
import type { ScreenshotOptions } from "../../src/features/observe/TakeScreenshot";
import type { ScreenshotResult } from "../../src/models/ScreenshotResult";

/**
 * Recorded screenshot call for testing.
 */
export interface RecordedScreenshotCall {
  options: ScreenshotOptions;
  timestamp: number;
  result: ScreenshotResult;
}

/**
 * Fake implementation of ScreenshotService for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeScreenshotService implements ScreenshotService {
  private calls: RecordedScreenshotCall[] = [];
  private nextResult: ScreenshotResult = { success: true, path: "/tmp/fake-screenshot.png" };
  private activityHash = "fake-activity-hash";
  private shouldFail = false;
  private failureError: Error | null = null;
  private screenshotCounter = 1;

  /**
   * Take a screenshot (fake implementation).
   */
  async execute(
    options: ScreenshotOptions = { format: "png" },
    _signal?: AbortSignal
  ): Promise<ScreenshotResult> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    const result = { ...this.nextResult };
    this.calls.push({
      options,
      timestamp: Date.now(),
      result,
    });
    return result;
  }

  /**
   * Generate screenshot file path.
   */
  generateScreenshotPath(timestamp: number, options: ScreenshotOptions): string {
    const ext = options.format === "webp" ? "webp" : "png";
    return `/tmp/fake-screenshot_${timestamp}.${ext}`;
  }

  /**
   * Get activity hash.
   */
  async getActivityHash(activityHash: string | null): Promise<string> {
    return activityHash ?? this.activityHash;
  }

  // Test helpers

  /**
   * Set the result to return for the next execute() call.
   */
  setNextResult(result: ScreenshotResult): void {
    this.nextResult = result;
  }

  /**
   * Set a successful result with the given path.
   */
  setSuccessPath(path: string): void {
    this.nextResult = { success: true, path };
  }

  /**
   * Set an error result.
   */
  setErrorResult(error: string): void {
    this.nextResult = { success: false, error };
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
   * Set the activity hash to return.
   */
  setActivityHash(hash: string): void {
    this.activityHash = hash;
  }

  /**
   * Get all recorded calls.
   */
  getCalls(): RecordedScreenshotCall[] {
    return [...this.calls];
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
    this.nextResult = { success: true, path: "/tmp/fake-screenshot.png" };
    this.activityHash = "fake-activity-hash";
    this.shouldFail = false;
    this.failureError = null;
    this.screenshotCounter = 1;
  }
}
