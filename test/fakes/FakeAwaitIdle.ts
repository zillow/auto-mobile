import { ObserveResult } from "../../src/models";

/**
 * Fake implementation of AwaitIdle for testing
 * Allows configuring idle tracking responses and asserting method calls
 */
export class FakeAwaitIdle {
  private executedOperations: string[] = [];
  private initializeCallCount: number = 0;
  private waitForUiStabilityCallCount: number = 0;
  private waitForUiStabilityWithStateCallCount: number = 0;

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
    this.initializeCallCount = 0;
    this.waitForUiStabilityCallCount = 0;
    this.waitForUiStabilityWithStateCallCount = 0;
  }

  /**
   * Get total initializeUiStabilityTracking call count
   */
  getInitializeCallCount(): number {
    return this.initializeCallCount;
  }

  /**
   * Get total waitForUiStability call count
   */
  getWaitForUiStabilityCallCount(): number {
    return this.waitForUiStabilityCallCount;
  }

  /**
   * Get total waitForUiStabilityWithState call count
   */
  getWaitForUiStabilityWithStateCallCount(): number {
    return this.waitForUiStabilityWithStateCallCount;
  }

  // Implementation of AwaitIdle interface

  async initializeUiStabilityTracking(): Promise<void> {
    this.executedOperations.push("initializeUiStabilityTracking");
    this.initializeCallCount++;
  }

  async waitForUiStability(): Promise<void> {
    this.executedOperations.push("waitForUiStability");
    this.waitForUiStabilityCallCount++;
  }

  async waitForUiStabilityWithState(state: ObserveResult): Promise<void> {
    this.executedOperations.push("waitForUiStabilityWithState");
    this.waitForUiStabilityWithStateCallCount++;
  }

  async waitForRotation(targetRotation: number, timeoutMs?: number): Promise<void> {
    this.executedOperations.push(`waitForRotation(${targetRotation}, ${timeoutMs ?? 500})`);
    // No delay - immediately resolve
  }
}
