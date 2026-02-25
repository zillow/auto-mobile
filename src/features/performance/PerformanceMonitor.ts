import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { logger } from "../../utils/logger";
import {
  getPerformancePushServer,
  LivePerformanceData,
  DEFAULT_THRESHOLDS,
  PerformancePushSocketServer,
} from "../../daemon/performancePushSocketServer";
import { getDeviceDataStreamServer, PerformanceStreamData } from "../../daemon/deviceDataStreamSocketServer";
import { RecompositionTracker } from "./RecompositionTracker";
import { defaultAdbClientFactory, AdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import { SimCtlClient, SimCtl } from "../../utils/ios-cmdline-tools/SimCtlClient";
import { execFile } from "child_process";
import { promisify } from "util";

const defaultExecFileAsync = promisify(execFile);

/**
 * Type for the exec function used to run host commands.
 * Injected for testing.
 */
export type ExecFileAsyncFn = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

/**
 * Factory interface for creating SimCtlClient instances.
 * Enables dependency injection for testing.
 */
export interface SimCtlClientFactory {
  create(deviceId: string): SimCtl;
}

/**
 * Default factory that creates real SimCtlClient instances.
 */
class DefaultSimCtlClientFactory implements SimCtlClientFactory {
  create(deviceId: string): SimCtl {
    return new SimCtlClient({ deviceId, name: deviceId, platform: "ios" });
  }
}

/**
 * Singleton instance of the default factory.
 */
export const defaultSimCtlClientFactory: SimCtlClientFactory = new DefaultSimCtlClientFactory();

interface GfxMetrics {
  fps: number | null;
  frameTimeMs: number | null;
  jankFrames: number | null;
  /** Number of frames with high input latency in this interval */
  highInputLatencyFrames: number | null;
  /** Total frames rendered in this interval (for calculating latency ratio) */
  totalFrames: number | null;
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
  platform: "android" | "ios";
  lastFastTick: number;
  lastMediumTick: number;
  lastSlowTick: number;
  cachedCpu: number | null;
  cachedMemory: number | null;
  /** Cached FPS from last interval with actual frames */
  cachedFps: number | null;
  /** Cached frame time from last interval with actual frames */
  cachedFrameTime: number | null;
  /** Cached touch latency from last interval with actual frames */
  cachedTouchLatency: number | null;
  /** Previous jank counters for computing deltas */
  prevJankCounters: RawJankCounters | null;
  /** PID of the app process (cached for iOS since it requires a lookup) */
  cachedPid: number | null;
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
  private readonly simCtlClientFactory: SimCtlClientFactory;
  private readonly getServer: ServerGetter;
  private readonly execFileAsync: ExecFileAsyncFn;
  private monitoredDevices = new Map<string, MonitoredDevice>();

  constructor(
    timer: Timer = defaultTimer,
    adbClientFactory: AdbClientFactory = defaultAdbClientFactory,
    serverGetter: ServerGetter = getPerformancePushServer,
    simCtlClientFactory: SimCtlClientFactory = defaultSimCtlClientFactory,
    execFileAsync: ExecFileAsyncFn = defaultExecFileAsync
  ) {
    this.timer = timer;
    this.adbClientFactory = adbClientFactory;
    this.simCtlClientFactory = simCtlClientFactory;
    this.getServer = serverGetter;
    this.execFileAsync = execFileAsync;
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
   * @param deviceId - The device identifier
   * @param packageName - The package/bundle identifier to monitor
   * @param platform - The platform ("android" or "ios"), defaults to "android"
   */
  startMonitoring(deviceId: string, packageName: string, platform: "android" | "ios" = "android"): void {
    if (this.monitoredDevices.has(deviceId)) {
      // Update package name if already monitoring this device
      const existing = this.monitoredDevices.get(deviceId)!;
      if (existing.packageName !== packageName) {
        existing.packageName = packageName;
        existing.platform = platform;
        // Reset cached metrics for the new package
        existing.cachedCpu = null;
        existing.cachedMemory = null;
        existing.cachedFps = null;
        existing.cachedFrameTime = null;
        existing.cachedTouchLatency = null;
        existing.cachedPid = null;
        existing.lastMediumTick = 0;
        existing.lastSlowTick = 0;
        existing.prevJankCounters = null;
        logger.info(`[PerformanceMonitor] Updated monitoring to ${packageName} on ${deviceId} (${platform})`);
      }
      return;
    }

    this.monitoredDevices.set(deviceId, {
      deviceId,
      packageName,
      platform,
      lastFastTick: 0,
      lastMediumTick: 0,
      lastSlowTick: 0,
      cachedCpu: null,
      cachedMemory: null,
      cachedFps: null,
      cachedFrameTime: null,
      cachedTouchLatency: null,
      prevJankCounters: null,
      cachedPid: null,
    });
    logger.info(`[PerformanceMonitor] Started monitoring ${packageName} on ${deviceId} (${platform})`);
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
      if (device.platform === "ios") {
        await this.sampleIOSDevice(device, now, server);
      } else {
        await this.sampleAndroidDevice(device, now, server);
      }
    } catch (error) {
      logger.debug(`[PerformanceMonitor] Error sampling ${device.deviceId}: ${error}`);
    }
  }

  /**
   * Sample metrics for an Android device.
   */
  private async sampleAndroidDevice(
    device: MonitoredDevice,
    now: number,
    server: PerformancePushSocketServer
  ): Promise<void> {
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

    // Update cached FPS/frame time when we have valid data from actual frames
    // When app is idle (no frames rendered), use cached values instead of showing 0
    let fps: number | null;
    let frameTimeMs: number | null;
    if (gfx.fps !== null && gfx.frameTimeMs !== null) {
      // Got valid data from rendered frames - update cache
      device.cachedFps = gfx.fps;
      device.cachedFrameTime = gfx.frameTimeMs;
      fps = gfx.fps;
      frameTimeMs = gfx.frameTimeMs;
    } else {
      // No frames rendered this interval - use cached values
      fps = device.cachedFps;
      frameTimeMs = device.cachedFrameTime;
    }

    // Jank counters are now per-interval (since we reset gfxinfo after each read)
    let jankFrames: number | null = null;
    if (gfx.rawJankCounters) {
      const curr = gfx.rawJankCounters;
      // Sum all jank indicators for this interval
      jankFrames = curr.missedVsync + curr.slowUi + curr.deadlineMissed;
    }

    // Estimate touch latency from high input latency frame count
    // Android flags "high input latency" when input-to-draw exceeds ~16ms
    // If we have high latency frames, estimate actual latency as 2-3x frame time
    let touchLatencyMs: number | null = null;
    if (gfx.totalFrames !== null && gfx.totalFrames > 0 && frameTimeMs !== null) {
      if (gfx.highInputLatencyFrames !== null && gfx.highInputLatencyFrames > 0) {
        // High latency frames detected - estimate latency based on ratio
        const latencyRatio = gfx.highInputLatencyFrames / gfx.totalFrames;
        // Scale from 2x frame time (few high latency) to 4x (many high latency)
        const multiplier = 2 + latencyRatio * 2;
        touchLatencyMs = Math.round(frameTimeMs * multiplier);
      } else {
        // No high latency frames - estimate as 1x frame time (responsive)
        touchLatencyMs = Math.round(frameTimeMs);
      }
      // Update cache when we have actual data
      device.cachedTouchLatency = touchLatencyMs;
    } else {
      // No frames this interval - assume optimal latency (idle app is responsive)
      touchLatencyMs = 16;
    }

    // Get TTI from the global store if available
    const ttiMs = getLastTtiMs(device.packageName);

    const metrics = {
      fps,
      frameTimeMs,
      jankFrames,
      touchLatencyMs,
      ttffMs: null,
      ttiMs,
      cpuUsagePercent: cpu,
      memoryUsageMb: memory,
    };

    this.pushMetrics(device, now, metrics, jankFrames, server);
  }

  /**
   * Sample metrics for an iOS device.
   * iOS metrics are limited compared to Android:
   * - FPS/frame time: Not available without in-app SDK
   * - CPU/Memory: Available via simctl spawn
   */
  private async sampleIOSDevice(
    device: MonitoredDevice,
    now: number,
    server: PerformancePushSocketServer
  ): Promise<void> {
    // Collect medium metrics (CPU) if interval elapsed or first collection
    const shouldCollectCpu =
      device.lastMediumTick === 0 ||
      now - device.lastMediumTick >= PerformanceMonitor.MEDIUM_INTERVAL_MS;
    const cpuPromise = shouldCollectCpu
      ? this.collectIOSCpuMetrics(device).then(cpu => {
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
      ? this.collectIOSMemoryMetrics(device).then(mem => {
        device.lastSlowTick = now;
        device.cachedMemory = mem;
        return mem;
      })
      : Promise.resolve(device.cachedMemory);

    const [cpu, memory] = await Promise.all([cpuPromise, memoryPromise]);

    device.lastFastTick = now;

    // iOS doesn't provide FPS/frame time metrics without in-app SDK
    // We report null to indicate "not available" rather than assuming values
    const fps: number | null = null;
    const frameTimeMs: number | null = null;
    const jankFrames: number | null = null;
    const touchLatencyMs: number | null = null;

    // Get TTI from the global store if available
    const ttiMs = getLastTtiMs(device.packageName);

    const metrics = {
      fps,
      frameTimeMs,
      jankFrames,
      touchLatencyMs,
      ttffMs: null,
      ttiMs,
      cpuUsagePercent: cpu,
      memoryUsageMb: memory,
    };

    this.pushMetrics(device, now, metrics, jankFrames, server);
  }

  /**
   * Push metrics to both the performance server and observation stream.
   */
  private pushMetrics(
    device: MonitoredDevice,
    now: number,
    metrics: {
      fps: number | null;
      frameTimeMs: number | null;
      jankFrames: number | null;
      touchLatencyMs: number | null;
      ttffMs: number | null;
      ttiMs: number | null;
      cpuUsagePercent: number | null;
      memoryUsageMb: number | null;
    },
    jankFrames: number | null,
    server: PerformancePushSocketServer
  ): void {
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

    // Also push to the observation stream for IDE plugin
    // Skip for iOS - CtrlProxy iOSClient handles observation stream updates via CADisplayLink
    if (device.platform === "ios") {
      return;
    }

    const observationServer = getDeviceDataStreamServer();
    if (observationServer) {
      const recompositionSummary = RecompositionTracker.getInstance().getLatestSummary(device.deviceId, device.packageName);
      const streamData: PerformanceStreamData = {
        fps: metrics.fps ?? 0,
        frameTimeMs: metrics.frameTimeMs ?? 0,
        jankFrames: jankFrames ?? 0,
        droppedFrames: 0, // Not tracked in real-time monitoring
        memoryUsageMb: metrics.memoryUsageMb ?? 0,
        cpuUsagePercent: metrics.cpuUsagePercent ?? 0,
        touchLatencyMs: metrics.touchLatencyMs,
        timeToInteractiveMs: metrics.ttiMs,
        screenName: null, // Could be enhanced with current activity
        isResponsive: data.health !== "critical",
        recompositionCount: recompositionSummary?.totalRecompositions ?? null,
        recompositionRate: recompositionSummary?.averagePerSecond ?? null,
      };
      observationServer.pushPerformanceUpdate(device.deviceId, streamData);
    }
  }

  /**
   * Collect graphics metrics from dumpsys gfxinfo.
   * Parses FPS, frame time percentiles, and raw jank counters.
   * Resets gfxinfo after reading to get fresh data for the next interval.
   * Jank delta calculation happens in sampleDevice.
   */
  private async collectGfxMetrics(device: MonitoredDevice): Promise<GfxMetrics & { rawJankCounters: RawJankCounters | null }> {
    try {
      const adb = this.adbClientFactory.create({
        deviceId: device.deviceId,
        name: device.deviceId,
        platform: "android",
      });

      // Read and reset gfxinfo in one command to get fresh interval data
      // The 'reset' flag clears stats after reading, so next read reflects only new frames
      const { stdout } = await adb.executeCommand(`shell dumpsys gfxinfo ${device.packageName} reset`);

      // Check if any frames were actually rendered in this interval
      const totalFramesMatch = stdout.match(/Total frames rendered:\s+(\d+)/);
      const totalFrames = totalFramesMatch ? parseInt(totalFramesMatch[1], 10) : 0;

      // Only parse P50 frame time if frames were rendered (otherwise it's a garbage default value)
      let frameTimeMs: number | null = null;
      if (totalFrames > 0) {
        const p50Match = stdout.match(/50th percentile:\s+(\d+(?:\.\d+)?)ms/);
        frameTimeMs = p50Match ? parseFloat(p50Match[1]) : null;
      }

      // Parse jank counters (now reflects only jank since last reset)
      const missedVsync = parseInt(stdout.match(/Missed Vsync:\s+(\d+)/)?.[1] || "0", 10);
      const slowUi = parseInt(stdout.match(/Slow UI thread:\s+(\d+)/)?.[1] || "0", 10);
      const deadlineMissed = parseInt(stdout.match(/Frame deadline missed:\s+(\d+)/)?.[1] || "0", 10);

      // Parse high input latency frame count
      const highInputLatencyMatch = stdout.match(/Number High input latency:\s+(\d+)/);
      const highInputLatencyFrames = highInputLatencyMatch ? parseInt(highInputLatencyMatch[1], 10) : null;

      // Calculate FPS from frame time
      const fps = frameTimeMs && frameTimeMs > 0 ? Math.min(1000 / frameTimeMs, 60) : null;

      return {
        fps,
        frameTimeMs,
        jankFrames: null, // Computed as delta in sampleDevice
        highInputLatencyFrames,
        totalFrames,
        rawJankCounters: { missedVsync, slowUi, deadlineMissed },
      };
    } catch (error) {
      logger.debug(`[PerformanceMonitor] gfxinfo failed for ${device.deviceId}: ${error}`);
      return { fps: null, frameTimeMs: null, jankFrames: null, highInputLatencyFrames: null, totalFrames: null, rawJankCounters: null };
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

  /**
   * Collect CPU usage for an iOS app.
   * iOS Simulator apps run as macOS processes, so we use `ps` on the host.
   * Searches for the process by bundle ID in the command line.
   */
  private async collectIOSCpuMetrics(device: MonitoredDevice): Promise<number | null> {
    try {
      // Run ps on the HOST (not inside simulator) to find the app process
      // iOS simulator apps run as macOS processes
      const { stdout } = await this.execFileAsync("ps", ["aux"]);

      // Find the line with our bundle ID
      // The process command line contains the bundle ID for iOS apps
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.includes(device.packageName)) {
          // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
          const parts = line.trim().split(/\s+/);
          const cpuPercent = parseFloat(parts[2]);
          if (!isNaN(cpuPercent)) {
            // Cache the PID while we're at it
            const pid = parseInt(parts[1], 10);
            if (!isNaN(pid) && pid > 0) {
              device.cachedPid = pid;
            }
            return Math.min(cpuPercent, 100); // Cap at 100%
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(`[PerformanceMonitor] iOS CPU metrics failed for ${device.deviceId}: ${error}`);
      return null;
    }
  }

  /**
   * Collect memory usage for an iOS app.
   * iOS Simulator apps run as macOS processes, so we use `ps` on the host.
   * Returns RSS (Resident Set Size) in megabytes.
   */
  private async collectIOSMemoryMetrics(device: MonitoredDevice): Promise<number | null> {
    try {
      // Run ps on the HOST (not inside simulator) to find the app process
      const { stdout } = await this.execFileAsync("ps", ["aux"]);

      // Find the line with our bundle ID
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.includes(device.packageName)) {
          // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
          const parts = line.trim().split(/\s+/);
          // RSS is in KB on macOS
          const rssKb = parseInt(parts[5], 10);
          if (!isNaN(rssKb)) {
            // Cache the PID while we're at it
            const pid = parseInt(parts[1], 10);
            if (!isNaN(pid) && pid > 0) {
              device.cachedPid = pid;
            }
            return rssKb / 1024; // Convert to MB
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(`[PerformanceMonitor] iOS memory metrics failed for ${device.deviceId}: ${error}`);
      return null;
    }
  }
}

// TTI (Time to Interactive) store - tracks last known TTI per package
// TTI is an event-based metric captured at app launch, not continuous
const ttiStore = new Map<string, { ttiMs: number; timestamp: number }>();

/**
 * Store the last known TTI for a package.
 * Called by LaunchApp after measuring displayed time.
 */
export function setLastTtiMs(packageName: string, ttiMs: number): void {
  ttiStore.set(packageName, { ttiMs, timestamp: defaultTimer.now() });
  logger.debug(`[PerformanceMonitor] Stored TTI for ${packageName}: ${ttiMs}ms`);
}

/**
 * Get the last known TTI for a package.
 * Returns null if no TTI has been recorded or if it's stale (>5 minutes old).
 */
function getLastTtiMs(packageName: string): number | null {
  const entry = ttiStore.get(packageName);
  if (!entry) {
    return null;
  }
  // TTI is only relevant for recent launches (within 5 minutes)
  const MAX_AGE_MS = 5 * 60 * 1000;
  if (defaultTimer.now() - entry.timestamp > MAX_AGE_MS) {
    ttiStore.delete(packageName);
    return null;
  }
  return entry.ttiMs;
}

/**
 * Clear all stored TTI values (for testing).
 */
export function _clearTtiStore(): void {
  ttiStore.clear();
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
