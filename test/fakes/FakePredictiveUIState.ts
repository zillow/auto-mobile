import type { PredictiveUIState } from "../../src/features/observe/interfaces/PredictiveUIState";
import type { ObserveResult, Predictions } from "../../src/models";

/**
 * Fake implementation of PredictiveUIState for testing.
 * Returns configurable responses and records all calls.
 */
export class FakePredictiveUIState implements PredictiveUIState {
  private calls: { result: ObserveResult }[] = [];
  private configuredPredictions: Predictions | undefined = undefined;
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Generate predictions (fake implementation).
   */
  async generate(result: ObserveResult): Promise<Predictions | undefined> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.calls.push({ result });
    return this.configuredPredictions;
  }

  // Test helpers

  /**
   * Configure the predictions to return.
   */
  configurePredictions(predictions: Predictions | undefined): void {
    this.configuredPredictions = predictions;
  }

  /**
   * Configure to throw an error on generate().
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
   * Get the number of generate() calls.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Check if generate() was called.
   */
  wasCalled(): boolean {
    return this.calls.length > 0;
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.calls = [];
    this.configuredPredictions = undefined;
    this.shouldFail = false;
    this.failureError = null;
  }
}
