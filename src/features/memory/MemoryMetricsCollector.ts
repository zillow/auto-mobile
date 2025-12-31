import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { BootedDevice } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

/**
 * Memory snapshot from dumpsys meminfo
 */
export interface MemorySnapshot {
  javaHeapMb: number;
  nativeHeapMb: number;
  totalPssMb: number;
  timestamp: number;
  raw: string;
}

/**
 * GC event parsed from logcat
 */
export interface GCEvent {
  type: string; // GC_FOR_ALLOC, GC_EXPLICIT, etc.
  freedKb: number;
  durationMs: number;
  timestamp: number;
}

/**
 * Unreachable objects data from dumpsys meminfo --unreachable
 */
export interface UnreachableObjectsInfo {
  count: number;
  sizeKb: number;
  raw: string;
}

/**
 * Complete memory metrics collected during audit
 */
export interface MemoryMetrics {
  preSnapshot: MemorySnapshot;
  postSnapshot: MemorySnapshot;
  javaHeapGrowthMb: number;
  nativeHeapGrowthMb: number;
  totalPssGrowthMb: number;
  gcEvents: GCEvent[];
  gcCount: number;
  gcTotalDurationMs: number;
  unreachableObjects: UnreachableObjectsInfo | null;
}

/**
 * Collector for memory metrics via ADB commands
 */
export class MemoryMetricsCollector {
  private adb: AdbClient;
  private device: BootedDevice;

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
  }

  /**
   * Take a memory snapshot using dumpsys meminfo
   */
  async takeSnapshot(
    packageName: string,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<MemorySnapshot> {
    try {
      const { stdout } = await perf.track("adbMeminfo", () =>
        this.adb.executeCommand(`shell dumpsys meminfo ${packageName}`)
      );

      const metrics = this.parseMeminfo(stdout);

      return {
        javaHeapMb: metrics.javaHeapMb,
        nativeHeapMb: metrics.nativeHeapMb,
        totalPssMb: metrics.totalPssMb,
        timestamp: Date.now(),
        raw: stdout,
      };
    } catch (error) {
      logger.warn(`[MemoryMetricsCollector] Failed to take memory snapshot: ${error}`);
      throw error;
    }
  }

  /**
   * Parse dumpsys meminfo output
   */
  private parseMeminfo(output: string): {
    javaHeapMb: number;
    nativeHeapMb: number;
    totalPssMb: number;
  } {
    // Parse Java heap
    // Looking for: "Java Heap:     12345"
    const javaHeapMatch = output.match(/Java Heap:\s+(\d+)/i);
    const javaHeapKb = javaHeapMatch ? parseInt(javaHeapMatch[1], 10) : 0;

    // Parse Native heap
    // Looking for: "Native Heap:   12345"
    const nativeHeapMatch = output.match(/Native Heap:\s+(\d+)/i);
    const nativeHeapKb = nativeHeapMatch ? parseInt(nativeHeapMatch[1], 10) : 0;

    // Parse Total PSS
    // Looking for: "TOTAL:         12345" or "TOTAL PSS:     12345"
    const totalPssMatch = output.match(/TOTAL(?:\s+PSS)?:\s+(\d+)/i);
    const totalPssKb = totalPssMatch ? parseInt(totalPssMatch[1], 10) : 0;

    return {
      javaHeapMb: javaHeapKb / 1024,
      nativeHeapMb: nativeHeapKb / 1024,
      totalPssMb: totalPssKb / 1024,
    };
  }

  /**
   * Trigger explicit GC on the target app
   */
  async triggerGC(
    packageName: string,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<void> {
    try {
      logger.info(`[MemoryMetricsCollector] Triggering explicit GC for ${packageName}`);

      // Get the PID first
      const { stdout: pidOutput } = await perf.track("adbGetPid", () =>
        this.adb.executeCommand(`shell pidof ${packageName}`)
      );

      const pid = pidOutput.trim();
      if (!pid) {
        logger.warn(`[MemoryMetricsCollector] No PID found for ${packageName}, cannot trigger GC`);
        return;
      }

      // Send SIGUSR1 to trigger GC (Android uses this signal for GC)
      await perf.track("adbTriggerGC", () =>
        this.adb.executeCommand(`shell kill -USR1 ${pid}`)
      );

      // Wait for GC to complete (small delay)
      await new Promise(resolve => setTimeout(resolve, 500));

      logger.info(`[MemoryMetricsCollector] GC triggered for ${packageName}`);
    } catch (error) {
      logger.warn(`[MemoryMetricsCollector] Failed to trigger GC: ${error}`);
    }
  }

  /**
   * Capture GC events from logcat
   * Should be called with timestamps around the action being monitored
   */
  async captureGCEvents(
    startTimestamp: number,
    endTimestamp: number,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<GCEvent[]> {
    try {
      // Clear logcat buffer before starting if this is the start
      // For now, we'll just read the recent buffer and filter by timestamp
      const { stdout } = await perf.track("adbLogcatGC", () =>
        this.adb.executeCommand(`shell logcat -d -s dalvikvm:I art:I | grep "GC_"`, 5000)
      );

      return this.parseGCEvents(stdout, startTimestamp, endTimestamp);
    } catch (error) {
      logger.warn(`[MemoryMetricsCollector] Failed to capture GC events: ${error}`);
      return [];
    }
  }

  /**
   * Parse GC events from logcat output
   */
  private parseGCEvents(output: string, startTimestamp: number, endTimestamp: number): GCEvent[] {
    const events: GCEvent[] = [];
    const lines = output.split("\n");

    // Pattern: "I/art: Background concurrent mark sweep GC freed 1234KB, 50% free, 5678KB/11356KB, paused 123ms"
    // Pattern: "I/dalvikvm: GC_FOR_ALLOC freed 1234K, 50% free 5678K/11356K, paused 123ms"
    const gcPattern = /GC[_\s](\w+).*?freed\s+(\d+)K?B?.*?paused\s+(\d+)ms/i;

    for (const line of lines) {
      const match = line.match(gcPattern);
      if (match) {
        const type = match[1];
        const freedKb = parseInt(match[2], 10);
        const durationMs = parseInt(match[3], 10);

        // We don't have exact timestamps in logcat without -v time, so we'll accept all recent GC events
        // In production, we'd parse logcat with timestamp format
        events.push({
          type,
          freedKb,
          durationMs,
          timestamp: Date.now(), // Approximate - logcat would give us real timestamp with -v time
        });
      }
    }

    return events;
  }

  /**
   * Get unreachable objects info
   */
  async getUnreachableObjects(
    packageName: string,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<UnreachableObjectsInfo | null> {
    try {
      const { stdout } = await perf.track("adbMeminfoUnreachable", () =>
        this.adb.executeCommand(`shell dumpsys meminfo --unreachable ${packageName}`, 10000)
      );

      return this.parseUnreachableObjects(stdout);
    } catch (error) {
      logger.warn(`[MemoryMetricsCollector] Failed to get unreachable objects: ${error}`);
      return null;
    }
  }

  /**
   * Parse unreachable objects from dumpsys output
   */
  private parseUnreachableObjects(output: string): UnreachableObjectsInfo {
    // Pattern: "Unreachable memory: 123 bytes in 45 unreachable objects"
    const unreachableMatch = output.match(/Unreachable memory:\s+(\d+)\s+bytes in\s+(\d+)\s+unreachable objects/i);

    if (unreachableMatch) {
      const sizeBytes = parseInt(unreachableMatch[1], 10);
      const count = parseInt(unreachableMatch[2], 10);

      return {
        count,
        sizeKb: sizeBytes / 1024,
        raw: output,
      };
    }

    // If pattern not found, look for alternative format or count manually
    // Just count occurrences of "Unreachable" as a fallback
    const unreachableCount = (output.match(/unreachable/gi) || []).length;

    return {
      count: unreachableCount,
      sizeKb: 0,
      raw: output,
    };
  }

  /**
   * Clear logcat buffer to prepare for GC event capture
   */
  async clearLogcat(perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<void> {
    try {
      await perf.track("adbLogcatClear", () =>
        this.adb.executeCommand("logcat -c")
      );
      logger.debug("[MemoryMetricsCollector] Logcat buffer cleared");
    } catch (error) {
      logger.warn(`[MemoryMetricsCollector] Failed to clear logcat: ${error}`);
    }
  }

  /**
   * Collect complete memory metrics around an action
   * This is the main entry point that orchestrates all metric collection
   */
  async collectMetrics(
    packageName: string,
    beforeAction: () => Promise<void>,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<MemoryMetrics> {
    logger.info(`[MemoryMetricsCollector] Collecting memory metrics for ${packageName}`);

    // Clear logcat to prepare for GC event capture
    await this.clearLogcat(perf);

    // Take pre-action snapshot
    const preSnapshot = await this.takeSnapshot(packageName, perf);
    const startTimestamp = Date.now();

    // Execute the action
    await beforeAction();

    const endTimestamp = Date.now();

    // Trigger explicit GC to ensure we get post-GC measurements
    await this.triggerGC(packageName, perf);

    // Take post-action snapshot (after GC)
    const postSnapshot = await this.takeSnapshot(packageName, perf);

    // Capture GC events that occurred during the action
    const gcEvents = await this.captureGCEvents(startTimestamp, endTimestamp, perf);

    // Get unreachable objects
    const unreachableObjects = await this.getUnreachableObjects(packageName, perf);

    // Calculate deltas
    const javaHeapGrowthMb = postSnapshot.javaHeapMb - preSnapshot.javaHeapMb;
    const nativeHeapGrowthMb = postSnapshot.nativeHeapMb - preSnapshot.nativeHeapMb;
    const totalPssGrowthMb = postSnapshot.totalPssMb - preSnapshot.totalPssMb;

    // Aggregate GC metrics
    const gcCount = gcEvents.length;
    const gcTotalDurationMs = gcEvents.reduce((sum, event) => sum + event.durationMs, 0);

    return {
      preSnapshot,
      postSnapshot,
      javaHeapGrowthMb,
      nativeHeapGrowthMb,
      totalPssGrowthMb,
      gcEvents,
      gcCount,
      gcTotalDurationMs,
      unreachableObjects,
    };
  }
}
