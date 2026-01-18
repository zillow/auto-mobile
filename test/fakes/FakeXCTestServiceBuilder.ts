import type { XCTestServiceBuildResult, XCTestServiceBuildConfig } from "../../src/utils/XCTestServiceBuilder";
import type { PerformanceTracker } from "../../src/utils/PerformanceTracker";

/**
 * Fake XCTestServiceBuilder for testing
 * Allows configuration of build state and tracking of operations
 */
export class FakeXCTestServiceBuilder {
  private needsRebuildValue: boolean = false;
  private buildResultValue: XCTestServiceBuildResult | null = null;
  private buildProductsPath: string | null = null;
  private xctestrunPath: string | null = null;
  private buildShouldFail: boolean = false;
  private buildError: string = "Mock build failure";

  // Operation tracking
  private operations: string[] = [];
  private methodCalls: Map<string, number> = new Map();

  // Static state to mimic class behavior
  private static prefetchResult: XCTestServiceBuildResult | null = null;
  private static prefetchError: Error | null = null;

  // Configuration
  private config: XCTestServiceBuildConfig = {
    projectRoot: "/mock/project/root",
    derivedDataPath: "/tmp/mock-xctestservice",
    scheme: "XCTestServiceApp",
    destination: "generic/platform=iOS Simulator",
  };

  constructor(config?: Partial<XCTestServiceBuildConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Configure whether a rebuild is needed
   */
  public setNeedsRebuild(value: boolean): void {
    this.needsRebuildValue = value;
  }

  /**
   * Configure the build result
   */
  public setBuildResult(result: XCTestServiceBuildResult): void {
    this.buildResultValue = result;
  }

  /**
   * Configure build to fail
   */
  public setBuildShouldFail(shouldFail: boolean, errorMessage?: string): void {
    this.buildShouldFail = shouldFail;
    if (errorMessage) {
      this.buildError = errorMessage;
    }
  }

  /**
   * Configure build products path
   */
  public setBuildProductsPath(path: string | null): void {
    this.buildProductsPath = path;
  }

  /**
   * Configure xctestrun path
   */
  public setXctestrunPath(path: string | null): void {
    this.xctestrunPath = path;
  }

  /**
   * Check if a rebuild is needed
   */
  public async needsRebuild(_platform?: "simulator" | "device"): Promise<boolean> {
    this.trackOperation("needsRebuild");
    return this.needsRebuildValue;
  }

  /**
   * Build XCTestService
   */
  public async build(_platform?: "simulator" | "device", _perf?: PerformanceTracker): Promise<XCTestServiceBuildResult> {
    this.trackOperation("build");

    if (this.buildShouldFail) {
      return {
        success: false,
        message: "XCTestService build failed",
        error: this.buildError,
      };
    }

    if (this.buildResultValue) {
      return this.buildResultValue;
    }

    return {
      success: true,
      message: "XCTestService built successfully",
      buildPath: this.buildProductsPath || "/tmp/mock-xctestservice/Build/Products/Debug-iphonesimulator",
      xctestrunPath: this.xctestrunPath || "/tmp/mock-xctestservice/Build/Products/XCTestServiceApp_iphonesimulator.xctestrun",
    };
  }

  /**
   * Get build products path
   */
  public async getBuildProductsPath(_platform?: "simulator" | "device"): Promise<string | null> {
    this.trackOperation("getBuildProductsPath");
    return this.buildProductsPath;
  }

  /**
   * Get xctestrun path
   */
  public async getXctestrunPath(_platform?: "simulator" | "device"): Promise<string | null> {
    this.trackOperation("getXctestrunPath");
    return this.xctestrunPath;
  }

  /**
   * Clean build artifacts
   */
  public async cleanBuildArtifacts(): Promise<void> {
    this.trackOperation("cleanBuildArtifacts");
    this.buildProductsPath = null;
    this.xctestrunPath = null;
  }

  /**
   * Get configuration
   */
  public getConfig(): XCTestServiceBuildConfig {
    return { ...this.config };
  }

  // Static methods to match XCTestServiceBuilder interface

  /**
   * Prefetch build
   */
  public static prefetchBuild(): void {
    // No-op for fake
  }

  /**
   * Wait for prefetch
   */
  public static async waitForPrefetch(): Promise<XCTestServiceBuildResult | null> {
    return FakeXCTestServiceBuilder.prefetchResult;
  }

  /**
   * Get prefetched result
   */
  public static getPrefetchedResult(): XCTestServiceBuildResult | null {
    return FakeXCTestServiceBuilder.prefetchResult;
  }

  /**
   * Get prefetch error
   */
  public static getPrefetchError(): Error | null {
    return FakeXCTestServiceBuilder.prefetchError;
  }

  /**
   * Configure prefetch result for testing
   */
  public static setPrefetchResult(result: XCTestServiceBuildResult | null): void {
    FakeXCTestServiceBuilder.prefetchResult = result;
  }

  /**
   * Configure prefetch error for testing
   */
  public static setPrefetchError(error: Error | null): void {
    FakeXCTestServiceBuilder.prefetchError = error;
  }

  /**
   * Reset static state
   */
  public static resetStatic(): void {
    FakeXCTestServiceBuilder.prefetchResult = null;
    FakeXCTestServiceBuilder.prefetchError = null;
  }

  // Operation tracking methods

  private trackOperation(operation: string): void {
    this.operations.push(operation);
    const count = this.methodCalls.get(operation) || 0;
    this.methodCalls.set(operation, count + 1);
  }

  /**
   * Get executed operations
   */
  public getExecutedOperations(): string[] {
    return [...this.operations];
  }

  /**
   * Check if method was called
   */
  public wasMethodCalled(method: string): boolean {
    return (this.methodCalls.get(method) || 0) > 0;
  }

  /**
   * Get call count for a method
   */
  public getCallCount(method: string): number {
    return this.methodCalls.get(method) || 0;
  }

  /**
   * Clear operation history
   */
  public clearHistory(): void {
    this.operations = [];
    this.methodCalls.clear();
  }

  /**
   * Reset all state
   */
  public reset(): void {
    this.needsRebuildValue = false;
    this.buildResultValue = null;
    this.buildProductsPath = null;
    this.xctestrunPath = null;
    this.buildShouldFail = false;
    this.buildError = "Mock build failure";
    this.clearHistory();
  }
}
