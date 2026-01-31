import { Timer, defaultTimer } from "../SystemTimer";

/**
 * Configuration for retry behavior.
 */
export interface RetryOptions {
  /**
   * Maximum number of attempts (including the initial attempt).
   * Default: 3
   */
  maxAttempts?: number;

  /**
   * Delay strategy between retries.
   * - number: Fixed delay in milliseconds
   * - number[]: Array of delays for each retry (exponential backoff pattern)
   * - (attempt: number) => number: Function to compute delay based on attempt number
   * Default: 1000ms fixed delay
   */
  delays?: number | number[] | ((attempt: number) => number);

  /**
   * Optional abort signal to cancel retry loop.
   */
  signal?: AbortSignal;

  /**
   * Optional predicate to determine if an error is retryable.
   * Return true to retry, false to fail immediately.
   * Default: all errors are retryable
   */
  shouldRetry?: (error: Error, attempt: number) => boolean;

  /**
   * Optional callback invoked before each retry.
   */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

/**
 * Result of a retry operation.
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value if successful */
  value?: T;
  /** The final error if all attempts failed */
  error?: Error;
  /** Total number of attempts made */
  attempts: number;
  /** Total time spent in milliseconds */
  totalTimeMs: number;
}

/**
 * Interface for executing operations with retry logic.
 */
export interface RetryExecutor {
  /**
   * Execute an operation with retry logic.
   * @param operation - The async operation to execute
   * @param options - Retry configuration
   * @returns Result containing success status, value, and metadata
   */
  execute<T>(
    operation: (attempt: number) => Promise<T>,
    options?: RetryOptions
  ): Promise<RetryResult<T>>;

  /**
   * Execute an operation with retry logic, throwing on failure.
   * @param operation - The async operation to execute
   * @param options - Retry configuration
   * @returns The operation result
   * @throws The final error if all attempts fail
   */
  executeOrThrow<T>(
    operation: (attempt: number) => Promise<T>,
    options?: RetryOptions
  ): Promise<T>;
}

/**
 * Default retry options.
 */
export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "signal" | "shouldRetry" | "onRetry">> = {
  maxAttempts: 3,
  delays: 1000,
};

/**
 * Compute the delay for a given attempt.
 */
function getDelay(delays: RetryOptions["delays"], attempt: number): number {
  if (typeof delays === "number") {
    return delays;
  }
  if (Array.isArray(delays)) {
    // Use the last delay if attempt exceeds array length
    return delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
  }
  if (typeof delays === "function") {
    return delays(attempt);
  }
  return DEFAULT_RETRY_OPTIONS.delays as number;
}

/**
 * Default implementation of RetryExecutor.
 */
export class DefaultRetryExecutor implements RetryExecutor {
  constructor(private readonly timer: Timer = defaultTimer) {}

  async execute<T>(
    operation: (attempt: number) => Promise<T>,
    options?: RetryOptions
  ): Promise<RetryResult<T>> {
    const maxAttempts = options?.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts;
    const delays = options?.delays ?? DEFAULT_RETRY_OPTIONS.delays;
    const shouldRetry = options?.shouldRetry ?? (() => true);
    const onRetry = options?.onRetry;
    const signal = options?.signal;

    const startTime = this.timer.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check for abort
      if (signal?.aborted) {
        return {
          success: false,
          error: new Error("Operation aborted"),
          attempts: attempt,
          totalTimeMs: this.timer.now() - startTime,
        };
      }

      try {
        const value = await operation(attempt);
        return {
          success: true,
          value,
          attempts: attempt,
          totalTimeMs: this.timer.now() - startTime,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Check if we should retry
        if (attempt < maxAttempts) {
          if (!shouldRetry(lastError, attempt)) {
            // shouldRetry returned false - stop retrying
            return {
              success: false,
              error: lastError,
              attempts: attempt,
              totalTimeMs: this.timer.now() - startTime,
            };
          }

          const delay = getDelay(delays, attempt);
          onRetry?.(lastError, attempt, delay);

          if (delay > 0) {
            await this.timer.sleep(delay);
          }
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: maxAttempts,
      totalTimeMs: this.timer.now() - startTime,
    };
  }

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
}

/**
 * Singleton instance using the default timer.
 */
export const defaultRetryExecutor: RetryExecutor = new DefaultRetryExecutor();
