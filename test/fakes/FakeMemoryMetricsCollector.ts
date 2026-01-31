import type { MemoryMetricsProvider } from "../../src/features/memory/interfaces/MemoryMetricsProvider";
import type {
  MemorySnapshot,
  GCEvent,
  UnreachableObjectsInfo,
  MemoryMetrics,
} from "../../src/features/memory/MemoryMetricsCollector";
import type { PerformanceTracker } from "../../src/utils/PerformanceTracker";

/**
 * Recorded call to the fake collector.
 */
export interface RecordedCollectorCall {
  method: string;
  args: unknown[];
  timestamp: number;
}

/**
 * Fake implementation of MemoryMetricsProvider for testing.
 * Returns configurable memory metrics and records all calls.
 */
export class FakeMemoryMetricsCollector implements MemoryMetricsProvider {
  private calls: RecordedCollectorCall[] = [];
  private nextSnapshot: MemorySnapshot = this.createDefaultSnapshot();
  private nextGCEvents: GCEvent[] = [];
  private nextUnreachableObjects: UnreachableObjectsInfo | null = null;
  private shouldFail = false;
  private failureError: Error | null = null;
  private gcTriggered = false;
  private logcatCleared = false;

  /**
   * Take a memory snapshot.
   */
  async takeSnapshot(
    packageName: string,
    _perf?: PerformanceTracker
  ): Promise<MemorySnapshot> {
    this.recordCall("takeSnapshot", [packageName]);
    this.checkShouldFail();
    return { ...this.nextSnapshot, timestamp: Date.now() };
  }

  /**
   * Trigger explicit GC.
   */
  async triggerGC(
    packageName: string,
    _perf?: PerformanceTracker
  ): Promise<void> {
    this.recordCall("triggerGC", [packageName]);
    this.checkShouldFail();
    this.gcTriggered = true;
  }

  /**
   * Capture GC events.
   */
  async captureGCEvents(
    startTimestamp: number,
    endTimestamp: number,
    _perf?: PerformanceTracker
  ): Promise<GCEvent[]> {
    this.recordCall("captureGCEvents", [startTimestamp, endTimestamp]);
    this.checkShouldFail();
    return [...this.nextGCEvents];
  }

  /**
   * Get unreachable objects.
   */
  async getUnreachableObjects(
    packageName: string,
    _perf?: PerformanceTracker
  ): Promise<UnreachableObjectsInfo | null> {
    this.recordCall("getUnreachableObjects", [packageName]);
    this.checkShouldFail();
    return this.nextUnreachableObjects ? { ...this.nextUnreachableObjects } : null;
  }

  /**
   * Clear logcat buffer.
   */
  async clearLogcat(_perf?: PerformanceTracker): Promise<void> {
    this.recordCall("clearLogcat", []);
    this.checkShouldFail();
    this.logcatCleared = true;
  }

  /**
   * Collect complete memory metrics.
   */
  async collectMetrics(
    packageName: string,
    beforeAction: () => Promise<void>,
    _perf?: PerformanceTracker
  ): Promise<MemoryMetrics> {
    this.recordCall("collectMetrics", [packageName]);
    this.checkShouldFail();

    const preSnapshot = { ...this.nextSnapshot, timestamp: Date.now() };

    // Execute the action
    await beforeAction();

    const postSnapshot = { ...this.nextSnapshot, timestamp: Date.now() };

    return {
      preSnapshot,
      postSnapshot,
      javaHeapGrowthMb: postSnapshot.javaHeapMb - preSnapshot.javaHeapMb,
      nativeHeapGrowthMb: postSnapshot.nativeHeapMb - preSnapshot.nativeHeapMb,
      totalPssGrowthMb: postSnapshot.totalPssMb - preSnapshot.totalPssMb,
      gcEvents: [...this.nextGCEvents],
      gcCount: this.nextGCEvents.length,
      gcTotalDurationMs: this.nextGCEvents.reduce((sum, e) => sum + e.durationMs, 0),
      unreachableObjects: this.nextUnreachableObjects ? { ...this.nextUnreachableObjects } : null,
    };
  }

  // Test helpers

  /**
   * Set the snapshot to return.
   */
  setSnapshot(snapshot: Partial<MemorySnapshot>): void {
    this.nextSnapshot = { ...this.createDefaultSnapshot(), ...snapshot };
  }

  /**
   * Set the GC events to return.
   */
  setGCEvents(events: GCEvent[]): void {
    this.nextGCEvents = events;
  }

  /**
   * Set the unreachable objects to return.
   */
  setUnreachableObjects(info: UnreachableObjectsInfo | null): void {
    this.nextUnreachableObjects = info;
  }

  /**
   * Configure to throw an error.
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
   * Check if GC was triggered.
   */
  wasGCTriggered(): boolean {
    return this.gcTriggered;
  }

  /**
   * Check if logcat was cleared.
   */
  wasLogcatCleared(): boolean {
    return this.logcatCleared;
  }

  /**
   * Get all recorded calls.
   */
  getCalls(): RecordedCollectorCall[] {
    return [...this.calls];
  }

  /**
   * Get calls to a specific method.
   */
  getCallsTo(method: string): RecordedCollectorCall[] {
    return this.calls.filter(c => c.method === method);
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.calls = [];
    this.nextSnapshot = this.createDefaultSnapshot();
    this.nextGCEvents = [];
    this.nextUnreachableObjects = null;
    this.shouldFail = false;
    this.failureError = null;
    this.gcTriggered = false;
    this.logcatCleared = false;
  }

  private createDefaultSnapshot(): MemorySnapshot {
    return {
      javaHeapMb: 50,
      nativeHeapMb: 30,
      totalPssMb: 100,
      timestamp: Date.now(),
      raw: "",
    };
  }

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }

  private checkShouldFail(): void {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }
  }
}
