import type { ViewHierarchy } from "../../src/features/observe/interfaces/ViewHierarchy";
import type { Element, ViewHierarchyResult } from "../../src/models";

/**
 * Fake implementation of ViewHierarchy for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeViewHierarchy implements ViewHierarchy {
  private calls: { skipWaitForFresh?: boolean; minTimestamp?: number }[] = [];
  private configuredHierarchy: ViewHierarchyResult = { hierarchy: {} };
  private configuredFocusedElement: Element | null = null;
  private configuredAccessibilityFocusedElement: Element | null = null;
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Get the view hierarchy (fake implementation).
   */
  async getViewHierarchy(
    _queryOptions?: any,
    _perf?: any,
    skipWaitForFresh?: boolean,
    minTimestamp?: number,
    _signal?: AbortSignal
  ): Promise<ViewHierarchyResult> {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }

    this.calls.push({ skipWaitForFresh, minTimestamp });
    return { ...this.configuredHierarchy };
  }

  /**
   * Configure recomposition tracking (fake implementation - no-op).
   */
  async configureRecompositionTracking(_enabled: boolean, _perf?: any): Promise<void> {
    // No-op for testing
  }

  /**
   * Find focused element (fake implementation).
   */
  findFocusedElement(_viewHierarchy: any): Element | null {
    return this.configuredFocusedElement;
  }

  /**
   * Find accessibility-focused element (fake implementation).
   */
  findAccessibilityFocusedElement(_viewHierarchy: any): Element | null {
    return this.configuredAccessibilityFocusedElement;
  }

  /**
   * Filter offscreen nodes (fake implementation - returns input unchanged).
   */
  filterOffscreenNodes(
    viewHierarchy: any,
    _screenWidth: number,
    _screenHeight: number,
    _margin?: number
  ): any {
    return viewHierarchy;
  }

  /**
   * Execute uiautomator dump (fake implementation).
   */
  async executeUiAutomatorDump(): Promise<string> {
    return "<hierarchy></hierarchy>";
  }

  // Test helpers

  /**
   * Configure the view hierarchy to return.
   */
  configureHierarchy(hierarchy: ViewHierarchyResult): void {
    this.configuredHierarchy = hierarchy;
  }

  /**
   * Configure the focused element to return.
   */
  configureFocusedElement(element: Element | null): void {
    this.configuredFocusedElement = element;
  }

  /**
   * Configure the accessibility-focused element to return.
   */
  configureAccessibilityFocusedElement(element: Element | null): void {
    this.configuredAccessibilityFocusedElement = element;
  }

  /**
   * Configure to throw an error on getViewHierarchy().
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
   * Get the number of getViewHierarchy() calls.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Check if getViewHierarchy() was called.
   */
  wasCalled(): boolean {
    return this.calls.length > 0;
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.calls = [];
    this.configuredHierarchy = { hierarchy: {} };
    this.configuredFocusedElement = null;
    this.configuredAccessibilityFocusedElement = null;
    this.shouldFail = false;
    this.failureError = null;
  }
}
