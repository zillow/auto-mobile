import { AccessibilityService } from "../../src/features/observe/interfaces/AccessibilityService";
import {
  ScreenshotResult,
  A11ySwipeResult,
  A11ySetTextResult,
  A11yImeActionResult,
  A11ySelectAllResult,
  AccessibilityHierarchyResponse,
  AndroidPerfTiming,
  AccessibilityHierarchy
} from "../../src/features/observe/AccessibilityServiceClient";
import { ViewHierarchyResult } from "../../src/models";
import { ViewHierarchyQueryOptions } from "../../src/models/ViewHierarchyQueryOptions";
import { PerformanceTracker } from "../../src/utils/PerformanceTracker";

/**
 * Fake implementation of AccessibilityService for testing
 * Allows configuring responses for hierarchy, screenshots, and gesture operations
 * Tracks method calls for test assertions
 */
export class FakeAccessibilityService implements AccessibilityService {
  // Configurable response data
  private hierarchyData: AccessibilityHierarchy | null = null;
  private screenshotData: string | null = null;
  private screenshotFormat: string = "jpeg";
  private performanceTiming: AndroidPerfTiming[] | null = null;
  private isConnectedState: boolean = true;
  private hasCachedHierarchyState: boolean = false;

  // Failure modes
  private failureMap: Map<string, Error> = new Map();

  // Operation delays
  private operationDelays: Map<string, number> = new Map();

  // Call history
  private swipeHistory: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    duration: number;
  }> = [];

  private setTextHistory: Array<{
    text: string;
    resourceId?: string;
  }> = [];

  private imeActionHistory: Array<{
    action: "done" | "next" | "search" | "send" | "go" | "previous";
  }> = [];

  private screenshotRequestCount: number = 0;
  private hierarchyRequestCount: number = 0;

  /**
   * Configure hierarchy data to be returned by getAccessibilityHierarchy
   * @param hierarchy - The accessibility hierarchy to return
   */
  setHierarchyData(hierarchy: AccessibilityHierarchy | null): void {
    this.hierarchyData = hierarchy;
  }

  /**
   * Configure screenshot data to be returned by requestScreenshot
   * @param base64Data - Base64 encoded screenshot data
   * @param format - Screenshot format (default: "jpeg")
   */
  setScreenshotData(base64Data: string | null, format: string = "jpeg"): void {
    this.screenshotData = base64Data;
    this.screenshotFormat = format;
  }

  /**
   * Configure a failure mode for a specific operation
   * @param operation - The operation name (e.g., "swipe", "setText", "screenshot", "getHierarchy")
   * @param error - The error to throw for this operation
   */
  setFailureMode(operation: string, error: Error | null): void {
    if (error === null) {
      this.failureMap.delete(operation);
    } else {
      this.failureMap.set(operation, error);
    }
  }

  /**
   * Configure a delay for a specific operation (for simulating slow operations)
   * @param operation - The operation name
   * @param delayMs - Delay in milliseconds
   */
  setOperationDelay(operation: string, delayMs: number): void {
    this.operationDelays.set(operation, delayMs);
  }

  /**
   * Set connection state
   * @param connected - Whether the service is connected
   */
  setConnected(connected: boolean): void {
    this.isConnectedState = connected;
  }

  /**
   * Set cached hierarchy state
   * @param hasCached - Whether there is cached hierarchy data
   */
  setCachedHierarchy(hasCached: boolean): void {
    this.hasCachedHierarchyState = hasCached;
  }

  /**
   * Configure Android-side performance timing data
   * @param perfTiming - Performance timing data from Android
   */
  setPerformanceTiming(perfTiming: AndroidPerfTiming[] | null): void {
    this.performanceTiming = perfTiming;
  }

  // Assertion methods

  /**
   * Get the history of swipe requests
   * @returns Array of swipe requests with coordinates and duration
   */
  getSwipeHistory(): Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    duration: number;
  }> {
    return [...this.swipeHistory];
  }

  /**
   * Get the history of text input requests
   * @returns Array of setText requests with text and optional resourceId
   */
  getTextInputHistory(): Array<{
    text: string;
    resourceId?: string;
  }> {
    return [...this.setTextHistory];
  }

  /**
   * Get the history of IME action requests
   * @returns Array of IME action requests with action type
   */
  getImeActionHistory(): Array<{
    action: "done" | "next" | "search" | "send" | "go" | "previous";
  }> {
    return [...this.imeActionHistory];
  }

  /**
   * Check if a specific IME action was called
   * @param action - The IME action to check for
   * @returns true if the action was called at least once
   */
  wasImeActionCalled(action: "done" | "next" | "search" | "send" | "go" | "previous"): boolean {
    return this.imeActionHistory.some(entry => entry.action === action);
  }

  /**
   * Get the number of screenshot requests made
   * @returns Number of screenshot requests
   */
  getScreenshotRequestCount(): number {
    return this.screenshotRequestCount;
  }

  /**
   * Get the number of hierarchy requests made
   * @returns Number of hierarchy requests (both getAccessibilityHierarchy and getLatestHierarchy)
   */
  getHierarchyRequestCount(): number {
    return this.hierarchyRequestCount;
  }

  /**
   * Clear all call history
   */
  clearHistory(): void {
    this.swipeHistory = [];
    this.setTextHistory = [];
    this.imeActionHistory = [];
    this.screenshotRequestCount = 0;
    this.hierarchyRequestCount = 0;
  }

  // Helper method to apply operation delay
  private async applyDelay(operation: string): Promise<void> {
    const delay = this.operationDelays.get(operation);
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Helper method to check for failures
  private checkFailure(operation: string): void {
    const error = this.failureMap.get(operation);
    if (error) {
      throw error;
    }
  }

  // AccessibilityService implementation

  async getAccessibilityHierarchy(
    queryOptions?: ViewHierarchyQueryOptions,
    perf?: PerformanceTracker,
    skipWaitForFresh?: boolean,
    minTimestamp?: number
  ): Promise<ViewHierarchyResult | null> {
    this.hierarchyRequestCount++;
    await this.applyDelay("getHierarchy");
    this.checkFailure("getHierarchy");

    if (!this.hierarchyData) {
      return null;
    }

    return this.convertToViewHierarchyResult(this.hierarchyData);
  }

  async getLatestHierarchy(
    waitForFresh: boolean = false,
    timeout: number = 100,
    perf?: PerformanceTracker,
    skipWaitForFresh: boolean = false,
    minTimestamp: number = 0
  ): Promise<AccessibilityHierarchyResponse> {
    this.hierarchyRequestCount++;
    await this.applyDelay("getLatestHierarchy");
    this.checkFailure("getLatestHierarchy");

    if (!this.hierarchyData) {
      return {
        hierarchy: null,
        fresh: false
      };
    }

    return {
      hierarchy: this.hierarchyData,
      fresh: true,
      updatedAt: this.hierarchyData.updatedAt,
      perfTiming: this.performanceTiming || undefined
    };
  }

  async requestHierarchySync(
    perf?: PerformanceTracker
  ): Promise<{ hierarchy: AccessibilityHierarchy; perfTiming?: AndroidPerfTiming[] } | null> {
    this.hierarchyRequestCount++;
    await this.applyDelay("requestHierarchySync");
    this.checkFailure("requestHierarchySync");

    if (!this.hierarchyData) {
      return null;
    }

    return {
      hierarchy: this.hierarchyData,
      perfTiming: this.performanceTiming || undefined
    };
  }

  convertToViewHierarchyResult(accessibilityHierarchy: AccessibilityHierarchy): ViewHierarchyResult {
    // Simple conversion - just wrap the hierarchy
    return {
      hierarchy: {
        node: {
          $: {
            text: "Fake Hierarchy"
          }
        }
      },
      packageName: accessibilityHierarchy.packageName,
      updatedAt: accessibilityHierarchy.updatedAt,
      intentChooserDetected: accessibilityHierarchy.intentChooserDetected
    };
  }

  async requestSwipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    duration: number = 300,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<A11ySwipeResult> {
    await this.applyDelay("swipe");
    this.checkFailure("swipe");

    this.swipeHistory.push({ x1, y1, x2, y2, duration });

    return {
      success: true,
      totalTimeMs: duration,
      gestureTimeMs: duration,
      perfTiming: this.performanceTiming || undefined
    };
  }

  async requestSetText(
    text: string,
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<A11ySetTextResult> {
    await this.applyDelay("setText");
    this.checkFailure("setText");

    this.setTextHistory.push({ text, resourceId });

    return {
      success: true,
      totalTimeMs: 100,
      perfTiming: this.performanceTiming || undefined
    };
  }

  async requestClearText(
    resourceId?: string,
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<A11ySetTextResult> {
    await this.applyDelay("clearText");
    this.checkFailure("clearText");

    // Clear text is essentially setText with empty string
    this.setTextHistory.push({ text: "", resourceId });

    return {
      success: true,
      totalTimeMs: 100,
      perfTiming: this.performanceTiming || undefined
    };
  }

  async requestImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<A11yImeActionResult> {
    await this.applyDelay("imeAction");

    // Check for failure and return error result instead of throwing
    const error = this.failureMap.get("imeAction");
    if (error) {
      return {
        success: false,
        action,
        totalTimeMs: 100,
        error: error.message,
        perfTiming: this.performanceTiming || undefined
      };
    }

    this.imeActionHistory.push({ action });

    return {
      success: true,
      action,
      totalTimeMs: 100,
      perfTiming: this.performanceTiming || undefined
    };
  }

  async requestSelectAll(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<A11ySelectAllResult> {
    await this.applyDelay("selectAll");
    this.checkFailure("selectAll");

    return {
      success: true,
      totalTimeMs: 100,
      perfTiming: this.performanceTiming || undefined
    };
  }

  async requestScreenshot(
    timeoutMs: number = 5000,
    perf?: PerformanceTracker
  ): Promise<ScreenshotResult> {
    this.screenshotRequestCount++;
    await this.applyDelay("screenshot");
    this.checkFailure("screenshot");

    if (!this.screenshotData) {
      return {
        success: false,
        error: "No screenshot data configured"
      };
    }

    return {
      success: true,
      data: this.screenshotData,
      format: this.screenshotFormat,
      timestamp: Date.now()
    };
  }

  isConnected(): boolean {
    return this.isConnectedState;
  }

  hasCachedHierarchy(): boolean {
    return this.hasCachedHierarchyState;
  }

  invalidateCache(): void {
    this.hasCachedHierarchyState = false;
  }

  async close(): Promise<void> {
    this.isConnectedState = false;
  }
}
