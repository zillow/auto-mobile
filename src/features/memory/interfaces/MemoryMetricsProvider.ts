import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type { MemorySnapshot, GCEvent, UnreachableObjectsInfo, MemoryMetrics } from "../MemoryMetricsCollector";

/**
 * Interface for collecting memory metrics from a device.
 */
export interface MemoryMetricsProvider {
  /**
   * Take a memory snapshot using dumpsys meminfo.
   * @param packageName - Target app package name
   * @param perf - Optional performance tracker
   * @returns Promise with memory snapshot
   */
  takeSnapshot(packageName: string, perf?: PerformanceTracker): Promise<MemorySnapshot>;

  /**
   * Trigger explicit GC on the target app.
   * @param packageName - Target app package name
   * @param perf - Optional performance tracker
   */
  triggerGC(packageName: string, perf?: PerformanceTracker): Promise<void>;

  /**
   * Capture GC events from logcat within a time window.
   * @param startTimestamp - Start of capture window
   * @param endTimestamp - End of capture window
   * @param perf - Optional performance tracker
   * @returns Promise with array of GC events
   */
  captureGCEvents(
    startTimestamp: number,
    endTimestamp: number,
    perf?: PerformanceTracker
  ): Promise<GCEvent[]>;

  /**
   * Get unreachable objects info.
   * @param packageName - Target app package name
   * @param perf - Optional performance tracker
   * @returns Promise with unreachable objects info or null
   */
  getUnreachableObjects(
    packageName: string,
    perf?: PerformanceTracker
  ): Promise<UnreachableObjectsInfo | null>;

  /**
   * Clear logcat buffer to prepare for GC event capture.
   * @param perf - Optional performance tracker
   */
  clearLogcat(perf?: PerformanceTracker): Promise<void>;

  /**
   * Collect complete memory metrics around an action.
   * This is the main entry point that orchestrates all metric collection.
   * @param packageName - Target app package name
   * @param beforeAction - Action to execute between pre and post snapshots
   * @param perf - Optional performance tracker
   * @returns Promise with complete memory metrics
   */
  collectMetrics(
    packageName: string,
    beforeAction: () => Promise<void>,
    perf?: PerformanceTracker
  ): Promise<MemoryMetrics>;
}
