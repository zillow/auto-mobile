import {
  PathOptimizer,
  BackButtonRecommendation,
  NavigationRecommendation
} from "../../src/features/navigation/interfaces/PathOptimizer";

/**
 * Fake implementation of PathOptimizer for testing.
 * Allows full control over optimization behavior and tracks method calls.
 */
export class FakePathOptimizer implements PathOptimizer {
  // Configurable responses
  private backButtonRecommendation: BackButtonRecommendation = {
    shouldUseBack: false,
    backPresses: 0,
    reason: "Default fake response"
  };
  private sameTaskResult: boolean = false;
  private navigationRecommendation: NavigationRecommendation = {
    method: "unknown",
    reason: "Default fake response"
  };

  // Call tracking
  private methodCalls: Map<string, any[][]> = new Map();

  // ==================== Configuration Methods ====================

  /**
   * Set the result that shouldUseBackButton will return.
   */
  setBackButtonRecommendation(recommendation: BackButtonRecommendation): void {
    this.backButtonRecommendation = recommendation;
  }

  /**
   * Set the result that areInSameTask will return.
   */
  setSameTaskResult(result: boolean): void {
    this.sameTaskResult = result;
  }

  /**
   * Set the result that getNavigationRecommendation will return.
   */
  setNavigationRecommendation(recommendation: NavigationRecommendation): void {
    this.navigationRecommendation = recommendation;
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

  // ==================== PathOptimizer Interface Implementation ====================

  shouldUseBackButton(
    currentScreen: string,
    targetScreen: string,
    currentBackStackDepth: number
  ): BackButtonRecommendation {
    this.trackCall("shouldUseBackButton", [currentScreen, targetScreen, currentBackStackDepth]);
    return this.backButtonRecommendation;
  }

  areInSameTask(screen1: string, screen2: string): boolean {
    this.trackCall("areInSameTask", [screen1, screen2]);
    return this.sameTaskResult;
  }

  getNavigationRecommendation(
    targetScreen: string,
    currentScreen: string,
    currentBackStackDepth: number
  ): NavigationRecommendation {
    this.trackCall("getNavigationRecommendation", [targetScreen, currentScreen, currentBackStackDepth]);
    return this.navigationRecommendation;
  }
}
