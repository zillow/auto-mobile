import { ActiveWindow } from "../../src/models";
import type { Window } from "../../src/features/observe/interfaces/Window";

/**
 * Fake implementation of Window for testing
 * Allows configuring window responses and asserting method calls
 */
export class FakeWindow implements Window {
  private executedOperations: string[] = [];
  private configuredCachedActiveWindow: ActiveWindow | null = null;
  private configuredActiveWindow: ActiveWindow | null = null;
  private cachedActiveWindowCallCount: number = 0;
  private getActiveCallCount: number = 0;
  private configuredActiveHash: string = "fake-active-hash";

  /**
   * Configure the cached active window to be returned by getCachedActiveWindow
   */
  configureCachedActiveWindow(window: ActiveWindow | null): void {
    this.configuredCachedActiveWindow = window;
  }

  /**
   * Configure the active window to be returned by getActive
   */
  configureActiveWindow(window: ActiveWindow): void {
    this.configuredActiveWindow = window;
  }

  /**
   * Configure the active hash to be returned by getActiveHash
   */
  configureActiveHash(hash: string): void {
    this.configuredActiveHash = hash;
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
    this.cachedActiveWindowCallCount = 0;
    this.getActiveCallCount = 0;
  }

  /**
   * Get total getCachedActiveWindow call count
   */
  getGetCachedActiveWindowCallCount(): number {
    return this.cachedActiveWindowCallCount;
  }

  /**
   * Get total getActive call count
   */
  getGetActiveCallCount(): number {
    return this.getActiveCallCount;
  }

  // Implementation of Window interface

  async getCachedActiveWindow(): Promise<ActiveWindow | null> {
    this.executedOperations.push("getCachedActiveWindow");
    this.cachedActiveWindowCallCount++;
    return this.configuredCachedActiveWindow;
  }

  async getActive(): Promise<ActiveWindow> {
    this.executedOperations.push("getActive");
    this.getActiveCallCount++;
    if (!this.configuredActiveWindow) {
      throw new Error("No active window configured");
    }
    return this.configuredActiveWindow;
  }

  async getActiveHash(): Promise<string> {
    this.executedOperations.push("getActiveHash");
    return this.configuredActiveHash;
  }

  async setCachedActiveWindow(activeWindow: ActiveWindow): Promise<void> {
    this.executedOperations.push("setCachedActiveWindow");
    this.configuredCachedActiveWindow = activeWindow;
  }

  async clearCache(): Promise<void> {
    this.executedOperations.push("clearCache");
    this.configuredCachedActiveWindow = null;
  }
}
