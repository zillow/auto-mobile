import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { logger } from "../../utils/logger";
import {
  getPerformancePushServer,
  LivePerformanceData,
  DEFAULT_THRESHOLDS,
  PerformancePushSocketServer,
} from "../../daemon/performancePushSocketServer";
import { defaultAdbClientFactory, AdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";

interface GfxMetrics {
  fps: number | null;
  frameTimeMs: number | null;
  jankFrames: number | null;
}

/**
 * Raw cumulative jank counters from dumpsys gfxinfo.
 * These are cumulative since last reset, so we need to track deltas.
 */
interface RawJankCounters {
  missedVsync: number;
  slowUi: number;
  deadlineMissed: number;
}

interface MonitoredDevice {
  deviceId: string;
  packageName: string;
  lastFastTick: number;
  lastMediumTick: number;
  lastSlowTick: number;
  cachedCpu: number | null;
  cachedMemory: number | null;
  /** Previous jank counters for computing deltas */
  prevJankCounters: RawJankCounters | null;
}

/**
 * Interface for pushing performance data, used for testing.
 */
export interface PerformanceDataPusher {
  pushPerformanceData(data: LivePerformanceData): void;
}

/**
 * Function type for getting the performance push server.
 */
export type ServerGetter = () => PerformanceDataPusher | null;

/**
 * Continuous performance monitor that samples device metrics at tiered intervals
 * and pushes them to the IDE via PerformancePushSocketServer.
 *
 * Sampling tiers:
 * - Fast (500ms): FPS, frame time, jank count via dumpsys gfxinfo
 * - Medium (2s): CPU usage via /proc/{pid}/stat
 * - Slow (10s): Memory usage via dumpsys meminfo
 */
export class PerformanceMonitor {
  static readonly TICK_INTERVAL_MS = 500;
  static readonly MEDIUM_INTERVAL_MS = 2000;
  static readonly SLOW_INTERVAL_MS = 10000;

  private intervalHandle: NodeJS.Timeout | null = null;
  private pending: Promise<void> | null = null;
  private readonly timer: Timer;
  private readonly adbClientFactory: AdbClientFactory;
  private readonly getServer: ServerGetter;
  private monitoredDevices = new Map<string, MonitoredDevice>();

  constructor(
    timer: Timer = defaultTimer,
    adbClientFactory: AdbClientFactory = defaultAdbClientFactory,
    serverGetter: ServerGetter = getPerformancePushServer
  ) {
    this.timer = timer;
    this.adbClientFactory = adbClientFactory;
    this.getServer = serverGetter;
  }

  /**
   * Start the background monitoring interval.
   * Does nothing if already started.
   */
  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = this.timer.setInterval(() => {
      void this.trigger();
    }, PerformanceMonitor.TICK_INTERVAL_MS);

    logger.info("[PerformanceMonitor] Started background monitoring");
  }

  /**
   * Stop the background monitoring interval.
   */
  stop(): void {
    if (this.intervalHandle) {
      this.timer.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.pending = null;
    this.monitoredDevices.clear();
    logger.info("[PerformanceMonitor] Stopped background monitoring");
  }

  /**
   * Start monitoring a specific device/package combination.
   */
  startMonitoring(deviceId: string, packageName: string): void {
    if (this.monitoredDevices.has(deviceId)) {
      // Update package name if already monitoring this device
      const existing = this.monitoredDevices.get(deviceId)!;
      if (existing.packageName !== packageName) {
        existing.packageName = packageName;
        // Reset cached metrics for the new package
        existing.cachedCpu = null;
        existing.cachedMemory = null;
        existing.lastMediumTick = 0;
        existing.lastSlowTick = 0;
        existing.prevJankCounters = null;
        logger.info(`[PerformanceMonitor] Updated monitoring to ${packageName} on ${deviceId}`);
      }
      return;
    }

    this.monitoredDevices.set(deviceId, {
      deviceId,
      packageName,
      lastFastTick: 0,
      lastMediumTick: 0,
      lastSlowTick: 0,
      cachedCpu: null,
      cachedMemory: null,
      prevJankCounters: null,
    });
    logger.info(`[PerformanceMonitor] Started monitoring ${packageName} on ${deviceId}`);
  }

  /**
   * Stop monitoring a specific device.
   */
  stopMonitoring(deviceId: string): void {
    if (this.monitoredDevices.delete(deviceId)) {
      logger.info(`[PerformanceMonitor] Stopped monitoring ${deviceId}`);
    }
  }

  /**
   * Check if a device is currently being monitored.
   */
  isMonitoring(deviceId: string): boolean {
    return this.monitoredDevices.has(deviceId);
  }

  /**
   * Get the number of devices currently being monitored.
   */
  getMonitoredDeviceCount(): number {
    return this.monitoredDevices.size;
  }

  /**
   * Trigger a sampling tick. Prevents concurrent execution.
   */
  private async trigger(): Promise<void> {
    if (this.pending) {
      return this.pending;
    }

    this.pending = this.tick().finally(() => {
      this.pending = null;
    });

    return this.pending;
  }

  /**
   * Execute one sampling tick across all monitored devices.
   */
  private async tick(): Promise<void> {
    const server = this.getServer();
    if (!server) {
      return;
    }

    if (this.monitoredDevices.size === 0) {
      return;
    }

    const now = this.timer.now();
    const promises: Promise<void>[] = [];

    for (const device of this.monitoredDevices.values()) {
      promises.push(this.sampleDevice(device, now, server));
    }

    await Promise.all(promises);
  }

  /**
   * Sample metrics for a single device based on interval tiers.
   */
  private async sampleDevice(
    device: MonitoredDevice,
    now: number,
    server: PerformancePushSocketServer
  ): Promise<void> {
    try {
      // Always collect fast metrics (gfxinfo)
      const gfxPromise = this.collectGfxMetrics(device);

      // Collect medium metrics (CPU) if interval elapsed or first collection
      const shouldCollectCpu =
        device.lastMediumTick === 0 ||
        now - device.lastMediumTick >= PerformanceMonitor.MEDIUM_INTERVAL_MS;
      const cpuPromise = shouldCollectCpu
        ? this.collectCpuMetrics(device).then(cpu => {
          device.lastMediumTick = now;
          device.cachedCpu = cpu;
          return cpu;
        })
        : Promise.resolve(device.cachedCpu);

      // Collect slow metrics (memory) if interval elapsed or first collection
      const shouldCollectMemory =
        device.lastSlowTick === 0 ||
        now - device.lastSlowTick >= PerformanceMonitor.SLOW_INTERVAL_MS;
      const memoryPromise = shouldCollectMemory
        ? this.collectMemoryMetrics(device).then(mem => {
          device.lastSlowTick = now;
          device.cachedMemory = mem;
          return mem;
        })
        : Promise.resolve(device.cachedMemory);

      const [gfx, cpu, memory] = await Promise.all([gfxPromise, cpuPromise, memoryPromise]);

      device.lastFastTick = now;

      // Calculate jank delta from cumulative counters
      let jankFrames: number | null = null;
      if (gfx.rawJankCounters) {
        const curr = gfx.rawJankCounters;
        const prev = device.prevJankCounters;
        if (prev) {
          // Compute delta (new jank since last sample)
          const deltaMissedVsync = Math.max(0, curr.missedVsync - prev.missedVsync);
          const deltaSlowUi = Math.max(0, curr.slowUi - prev.slowUi);
          const deltaDeadlineMissed = Math.max(0, curr.deadlineMissed - prev.deadlineMissed);
          jankFrames = deltaMissedVsync + deltaSlowUi + deltaDeadlineMissed;
        } else {
          // First sample - report 0 jank (we don't know what happened before)
          jankFrames = 0;
        }
        // Update previous counters for next delta calculation
        device.prevJankCounters = curr;
      }

      const metrics = {
        fps: gfx.fps,
        frameTimeMs: gfx.frameTimeMs,
        jankFrames,
        touchLatencyMs: null,
        ttffMs: null,
        ttiMs: null,
        cpuUsagePercent: cpu,
        memoryUsageMb: memory,
      };

      const data: LivePerformanceData = {
        deviceId: device.deviceId,
        packageName: device.packageName,
        timestamp: now,
        nodeId: null,
        screenName: null,
        metrics,
        thresholds: DEFAULT_THRESHOLDS,
        health: PerformancePushSocketServer.calculateHealth(metrics, DEFAULT_THRESHOLDS),
      };

      server.pushPerformanceData(data);
    } catch (error) {
      logger.debug(`[PerformanceMonitor] Error sampling ${device.deviceId}: ${error}`);
    }
  }

  /**
   * Collect graphics metrics from dumpsys gfxinfo.
   * Parses FPS, frame time percentiles, and raw jank counters (cumulative).
   * Jank delta calculation happens in sampleDevice.
   */
  private async collectGfxMetrics(device: MonitoredDevice): Promise<GfxMetrics & { rawJankCounters: RawJankCounters | null }> {
    try {
      const adb = this.adbClientFactory.create({
        deviceId: device.deviceId,
        name: device.deviceId,
        platform: "android",
      });

      const { stdout } = await adb.executeCommand(`shell dumpsys gfxinfo ${device.packageName}`);

      // Parse 50th percentile frame time
      const p50Match = stdout.match(/50th percentile:\s+(\d+(?:\.\d+)?)ms/);
      const frameTimeMs = p50Match ? parseFloat(p50Match[1]) : null;

      // Parse cumulative jank counters
      const missedVsync = parseInt(stdout.match(/Missed Vsync:\s+(\d+)/)?.[1] || "0", 10);
      const slowUi = parseInt(stdout.match(/Slow UI thread:\s+(\d+)/)?.[1] || "0", 10);
      const deadlineMissed = parseInt(stdout.match(/Frame deadline missed:\s+(\d+)/)?.[1] || "0", 10);

      // Calculate FPS from frame time
      const fps = frameTimeMs && frameTimeMs > 0 ? Math.min(1000 / frameTimeMs, 60) : null;

      return {
        fps,
        frameTimeMs,
        jankFrames: null, // Computed as delta in sampleDevice
        rawJankCounters: { missedVsync, slowUi, deadlineMissed },
      };
    } catch (error) {
      logger.debug(`[PerformanceMonitor] gfxinfo failed for ${device.deviceId}: ${error}`);
      return { fps: null, frameTimeMs: null, jankFrames: null, rawJankCounters: null };
    }
  }

  /**
   * Collect CPU usage from /proc/{pid}/stat.
   * Returns percentage of CPU time used by the process.
   */
  private async collectCpuMetrics(device: MonitoredDevice): Promise<number | null> {
    try {
      const adb = this.adbClientFactory.create({
        deviceId: device.deviceId,
        name: device.deviceId,
        platform: "android",
      });

      // Get the process ID
      const { stdout: pidOut } = await adb.executeCommand(`shell pidof ${device.packageName}`);
      const pid = pidOut.trim().split(/\s+/)[0]; // Take first PID if multiple
      if (!pid) {
        return null;
      }

      // Get CPU stats from /proc/stat
      const { stdout: statOut } = await adb.executeCommand(`shell cat /proc/${pid}/stat`);
      const fields = statOut.split(" ");
      const utime = parseInt(fields[13] || "0", 10);
      const stime = parseInt(fields[14] || "0", 10);

      // Get system uptime
      const { stdout: uptimeOut } = await adb.executeCommand("shell cat /proc/uptime");
      const uptime = parseFloat(uptimeOut.split(" ")[0] || "0");

      // Calculate CPU percentage
      // Note: This is a simplified calculation - actual CPU% would need delta sampling
      if (uptime > 0) {
        // Clock ticks per second is typically 100 (HZ)
        const cpuTime = utime + stime;
        const cpuPercent = (cpuTime / (uptime * 100)) * 100;
        return Math.min(cpuPercent, 100); // Cap at 100%
      }

      return null;
    } catch (error) {
      logger.debug(`[PerformanceMonitor] CPU metrics failed for ${device.deviceId}: ${error}`);
      return null;
    }
  }

  /**
   * Collect memory usage from dumpsys meminfo.
   * Returns total PSS in megabytes.
   */
  private async collectMemoryMetrics(device: MonitoredDevice): Promise<number | null> {
    try {
      const adb = this.adbClientFactory.create({
        deviceId: device.deviceId,
        name: device.deviceId,
        platform: "android",
      });

      const { stdout } = await adb.executeCommand(
        `shell dumpsys meminfo ${device.packageName} | grep "TOTAL PSS"`
      );

      // Format: "TOTAL PSS:    12345"
      const match = stdout.match(/TOTAL PSS:\s+(\d+)/);
      if (!match) {
        return null;
      }

      const pssKb = parseInt(match[1], 10);
      return pssKb / 1024; // Convert to MB
    } catch (error) {
      logger.debug(`[PerformanceMonitor] Memory metrics failed for ${device.deviceId}: ${error}`);
      return null;
    }
  }
}

// Singleton instance
let monitorInstance: PerformanceMonitor | null = null;

/**
 * Get the singleton PerformanceMonitor instance.
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!monitorInstance) {
    monitorInstance = new PerformanceMonitor();
  }
  return monitorInstance;
}

/**
 * Start the performance monitor.
 */
export function startPerformanceMonitor(): void {
  getPerformanceMonitor().start();
}

/**
 * Stop the performance monitor.
 */
export function stopPerformanceMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
}

// Export for testing
export function _resetPerformanceMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
  monitorInstance = null;
}

export function _setPerformanceMonitor(monitor: PerformanceMonitor): void {
  monitorInstance = monitor;
}
