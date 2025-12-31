import { UIStateSetup } from "../../src/features/navigation/interfaces/UIStateSetup";
import { NavigationEdge, ScrollPosition } from "../../src/utils/interfaces/NavigationGraph";

/**
 * Fake implementation of UIStateSetup for testing.
 * Allows full control over UI state setup behavior and tracks method calls.
 */
export class FakeUIStateSetup implements UIStateSetup {
  // Configurable responses
  private uiStateSetupActions: string[] = [];
  private scrollPositionResult: string | null = null;
  private shouldThrow: boolean = false;
  private errorMessage: string = "Fake error";

  // Call tracking
  private methodCalls: Map<string, any[][]> = new Map();

  // ==================== Configuration Methods ====================

  /**
   * Set the actions that setupUIState will return.
   */
  setUIStateSetupActions(actions: string[]): void {
    this.uiStateSetupActions = actions;
  }

  /**
   * Set the result that setupScrollPosition will return.
   */
  setScrollPositionResult(result: string | null): void {
    this.scrollPositionResult = result;
  }

  /**
   * Configure the fake to throw an error on the next call.
   */
  setShouldThrow(shouldThrow: boolean, errorMessage?: string): void {
    this.shouldThrow = shouldThrow;
    if (errorMessage) {
      this.errorMessage = errorMessage;
    }
  }

  // ==================== Call Tracking ====================

  private trackCall(method: string, args: any[]): void {
    if (!this.methodCalls.has(method)) {
      this.methodCalls.set(method, []);
    }
    this.methodCalls.get(method)!.push(args);
  }

  /**
   * Check if a method was called.
   */
  wasMethodCalled(method: string): boolean {
    return (this.methodCalls.get(method)?.length ?? 0) > 0;
  }

  /**
   * Get number of times a method was called.
   */
  getMethodCallCount(method: string): number {
    return this.methodCalls.get(method)?.length ?? 0;
  }

  /**
   * Get the arguments of a specific call to a method.
   */
  getMethodCallArgs(method: string, callIndex: number = 0): any[] | undefined {
    return this.methodCalls.get(method)?.[callIndex];
  }

  /**
   * Clear all tracked method calls.
   */
  clearCallHistory(): void {
    this.methodCalls.clear();
  }

  // ==================== UIStateSetup Interface Implementation ====================

  async setupUIState(edge: NavigationEdge, platform: string): Promise<string[]> {
    this.trackCall("setupUIState", [edge, platform]);

    if (this.shouldThrow) {
      throw new Error(this.errorMessage);
    }

    return this.uiStateSetupActions;
  }

  async setupScrollPosition(
    scrollPosition: ScrollPosition,
    platform: string
  ): Promise<string | null> {
    this.trackCall("setupScrollPosition", [scrollPosition, platform]);

    if (this.shouldThrow) {
      throw new Error(this.errorMessage);
    }

    return this.scrollPositionResult;
  }
}
