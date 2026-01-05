import { ObserveResult } from "../../src/models";

/**
 * Fake implementation of ObserveScreen for testing
 * Allows configuring observation responses and asserting method calls
 */
export class FakeObserveScreen {
  private executedOperations: string[] = [];
  private configuredObserveResult: ObserveResult | null = null;
  private observeResultFactory: (() => ObserveResult) | null = null;
  private executeCallCount: number = 0;
  private getMostRecentCachedObserveResultCallCount: number = 0;
  private failures: Map<string, Error> = new Map();

  /**
   * Set the observe result to be returned by execute and getMostRecentCachedObserveResult
   * Can either be a static result or a factory function that creates new results on each call
   */
  setObserveResult(result: ObserveResult): void;
  setObserveResult(resultFactory: () => ObserveResult): void;
  setObserveResult(resultOrFactory: ObserveResult | (() => ObserveResult)): void {
    if (typeof resultOrFactory === "function") {
      this.observeResultFactory = resultOrFactory as () => ObserveResult;
      this.configuredObserveResult = null;
    } else {
      this.configuredObserveResult = resultOrFactory;
      this.observeResultFactory = null;
    }
  }

  /**
   * Get the next observe result (either from factory or static)
   */
  private getNextObserveResult(): ObserveResult {
    if (this.observeResultFactory) {
      return this.observeResultFactory();
    }
    if (!this.configuredObserveResult) {
      throw new Error("No observe result configured");
    }
    return this.configuredObserveResult;
  }

  /**
   * Get the configured observe result
   */
  getConfiguredObserveResult(): ObserveResult | null {
    return this.configuredObserveResult;
  }

  /**
   * Configure a failure mode for a specific operation
   * @param operation - The operation name (e.g., "execute", "getMostRecentCachedObserveResult")
   * @param error - The error to throw for this operation
   */
  setFailureMode(operation: string, error: Error | null): void {
    if (error === null) {
      this.failures.delete(operation);
    } else {
      this.failures.set(operation, error);
    }
  }

  /**
   * Get history of executed operations
   */
  getExecutedOperations(): string[] {
    return [...this.executedOperations];
  }

  /**
   * Check if a method was called
   */
  wasMethodCalled(methodName: string): boolean {
    return this.executedOperations.some(op => op.includes(methodName));
  }

  /**
   * Get call count for a specific method
   */
  getCallCount(methodName: string): number {
    return this.executedOperations.filter(op => op.includes(methodName)).length;
  }

  /**
   * Clear operation history
   */
  clearHistory(): void {
    this.executedOperations = [];
    this.executeCallCount = 0;
    this.getMostRecentCachedObserveResultCallCount = 0;
  }

  /**
   * Get total execute call count
   */
  getExecuteCallCount(): number {
    return this.executeCallCount;
  }

  /**
   * Get total getMostRecentCachedObserveResult call count
   */
  getGetMostRecentCachedObserveResultCallCount(): number {
    return this.getMostRecentCachedObserveResultCallCount;
  }

  // Implementation of ObserveScreen interface

  async execute(
    _queryOptions?: any,
    _perf?: any,
    _skipWaitForFresh?: boolean,
    _minTimestamp?: number,
    _signal?: AbortSignal
  ): Promise<ObserveResult> {
    this.executedOperations.push("execute");
    this.executeCallCount++;

    const error = this.failures.get("execute");
    if (error) {
      throw error;
    }

    return this.getNextObserveResult();
  }

  async getMostRecentCachedObserveResult(): Promise<ObserveResult> {
    this.executedOperations.push("getMostRecentCachedObserveResult");
    this.getMostRecentCachedObserveResultCallCount++;

    const error = this.failures.get("getMostRecentCachedObserveResult");
    if (error) {
      throw error;
    }

    return this.getNextObserveResult();
  }
}
