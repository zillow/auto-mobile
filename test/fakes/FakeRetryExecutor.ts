import {
  RetryExecutor,
  RetryOptions,
  RetryResult,
} from "../../src/utils/retry/RetryExecutor";

/**
 * Recorded retry execution for verification.
 */
export interface RetryExecutionRecord {
  /** Number of attempts made */
  attempts: number;
  /** Options passed to execute */
  options?: RetryOptions;
  /** Result of the execution */
  result: RetryResult<unknown>;
  /** Timestamp when execution started */
  startedAt: number;
}

/**
 * Fake RetryExecutor for testing.
 * Allows configuring success/failure behavior and recording executions.
 */
export class FakeRetryExecutor implements RetryExecutor {
  private executions: RetryExecutionRecord[] = [];
  private shouldSucceed: boolean = true;
  private successAfterAttempts: number = 1;
  private errorToThrow: Error = new Error("Fake retry error");
  private executionCount: number = 0;

  /**
   * Configure the executor to succeed on all executions.
   */
  setSuccess(): void {
    this.shouldSucceed = true;
    this.successAfterAttempts = 1;
  }

  /**
   * Configure the executor to fail on all executions.
   */
  setFailure(error?: Error): void {
    this.shouldSucceed = false;
    this.errorToThrow = error ?? new Error("Fake retry error");
  }

  /**
   * Configure the executor to succeed after a specific number of attempts.
   * Useful for testing retry behavior.
   */
  setSuccessAfterAttempts(attempts: number): void {
    this.shouldSucceed = true;
    this.successAfterAttempts = attempts;
  }

  /**
   * Execute an operation with simulated retry behavior.
   */
  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    options?: RetryOptions
  ): Promise<RetryResult<T>> {
    const maxAttempts = options?.maxAttempts ?? 3;
    const startedAt = Date.now();
    let attempts = 0;
    let lastError: Error | undefined;
    let value: T | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;

      if (options?.signal?.aborted) {
        const result: RetryResult<T> = {
          success: false,
          error: new Error("Operation aborted"),
          attempts,
          totalTimeMs: 0,
        };
        this.recordExecution(attempts, options, result, startedAt);
        return result;
      }

      if (this.shouldSucceed && attempt >= this.successAfterAttempts) {
        try {
          value = await operation(attempt);
          const result: RetryResult<T> = {
            success: true,
            value,
            attempts,
            totalTimeMs: 0,
          };
          this.recordExecution(attempts, options, result, startedAt);
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      } else {
        try {
          // Still call the operation to simulate real behavior
          await operation(attempt);
        } catch {
          // Ignore operation errors - we use the configured errorToThrow
        }
        lastError = this.errorToThrow;
      }
    }

    const result: RetryResult<T> = {
      success: false,
      error: lastError ?? this.errorToThrow,
      attempts,
      totalTimeMs: 0,
    };
    this.recordExecution(attempts, options, result, startedAt);
    return result;
  }

  /**
   * Execute an operation with simulated retry behavior, throwing on failure.
   */
  async executeOrThrow<T>(
    operation: (attempt: number) => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const result = await this.execute(operation, options);
    if (!result.success) {
      throw result.error ?? new Error("Operation failed after retries");
    }
    return result.value as T;
  }

  private recordExecution(
    attempts: number,
    options: RetryOptions | undefined,
    result: RetryResult<unknown>,
    startedAt: number
  ): void {
    this.executionCount++;
    this.executions.push({
      attempts,
      options,
      result,
      startedAt,
    });
  }

  /**
   * Get all recorded executions.
   */
  getExecutions(): RetryExecutionRecord[] {
    return [...this.executions];
  }

  /**
   * Get the total number of executions.
   */
  getExecutionCount(): number {
    return this.executionCount;
  }

  /**
   * Get the last recorded execution.
   */
  getLastExecution(): RetryExecutionRecord | undefined {
    return this.executions[this.executions.length - 1];
  }

  /**
   * Check if any execution was attempted.
   */
  wasExecuted(): boolean {
    return this.executions.length > 0;
  }

  /**
   * Clear all recorded executions.
   */
  clearHistory(): void {
    this.executions = [];
    this.executionCount = 0;
  }

  /**
   * Reset the executor to default state.
   */
  reset(): void {
    this.clearHistory();
    this.shouldSucceed = true;
    this.successAfterAttempts = 1;
    this.errorToThrow = new Error("Fake retry error");
  }
}
