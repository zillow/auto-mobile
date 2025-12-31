import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { BootedDevice, ScreenSize } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { Idle } from "../observe/Idle";

/**
 * Result of a touch latency measurement
 */
export interface TouchLatencyResult {
  /** Measured latency in milliseconds */
  latencyMs: number;
  /** Touch coordinates used for measurement */
  touchCoordinates: { x: number; y: number };
  /** Whether the measurement was successful */
  success: boolean;
  /** Error message if measurement failed */
  error?: string;
  /** Number of samples taken */
  sampleCount: number;
}

/**
 * Measures touch input latency by injecting synthetic touches
 * and measuring the time until UI response is detected via gfxinfo
 */
export class TouchLatencyTracker {
  private adb: AdbClient;
  private device: BootedDevice;
  private idle: Idle;

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.idle = new Idle(device, this.adb);
  }

  /**
   * Select a safe touch location that's unlikely to trigger UI interactions
   * Uses screen edges or status bar area
   * @param screenSize - Device screen dimensions
   * @returns Touch coordinates (x, y)
   */
  private selectSafeTouchLocation(screenSize: ScreenSize): { x: number; y: number } {
    // Use top-right corner of status bar area (typically safe and non-interactive)
    // Status bar is usually ~50-75px tall
    const x = Math.floor(screenSize.width * 0.95); // 95% to right
    const y = Math.floor(screenSize.height * 0.02); // 2% from top (status bar)

    logger.debug(`[TouchLatency] Selected safe touch location: (${x}, ${y})`);
    return { x, y };
  }

  /**
   * Inject a synthetic touch event at specified coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param perf - Performance tracker
   */
  private async injectTouch(
    x: number,
    y: number,
    perf: PerformanceTracker
  ): Promise<void> {
    await perf.track("adbInputTap", () =>
      this.adb.executeCommand(`shell input tap ${x} ${y}`)
    );
  }

  /**
   * Measure time until frame statistics show activity after touch
   * Uses gfxinfo frame count changes as indicator of UI processing
   * @param packageName - Package to monitor
   * @param beforeStats - Baseline frame stats before touch
   * @param maxWaitMs - Maximum time to wait for response
   * @param perf - Performance tracker
   * @returns Time until frame activity detected, or null if timeout
   */
  private async measureFrameResponse(
    packageName: string,
    beforeStats: { missedVsync: number | null; slowUiThread: number | null; frameDeadlineMissed: number | null },
    maxWaitMs: number,
    perf: PerformanceTracker
  ): Promise<number | null> {
    const startTime = Date.now();
    const pollIntervalMs = 10; // Poll every 10ms for quick response

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      try {
        const { stdout } = await perf.track("adbGfxinfoCheck", () =>
          this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`)
        );

        const currentStats = this.idle.parseMetrics(stdout);

        // Check if any jank indicator has changed (indicates frame processing)
        const hasFrameActivity =
          (beforeStats.missedVsync !== null && currentStats.missedVsync !== null &&
           currentStats.missedVsync > beforeStats.missedVsync) ||
          (beforeStats.slowUiThread !== null && currentStats.slowUiThread !== null &&
           currentStats.slowUiThread > beforeStats.slowUiThread) ||
          (beforeStats.frameDeadlineMissed !== null && currentStats.frameDeadlineMissed !== null &&
           currentStats.frameDeadlineMissed > beforeStats.frameDeadlineMissed);

        if (hasFrameActivity) {
          const latency = Date.now() - startTime;
          logger.debug(`[TouchLatency] Frame activity detected after ${latency}ms`);
          return latency;
        }
      } catch (error) {
        logger.warn(`[TouchLatency] Error checking frame stats: ${error}`);
        // Continue polling despite errors
      }
    }

    logger.warn(`[TouchLatency] No frame activity detected within ${maxWaitMs}ms`);
    return null;
  }

  /**
   * Measure touch latency for a given package
   * @param packageName - Package name to monitor
   * @param screenSize - Device screen dimensions
   * @param options - Measurement options
   * @param perf - Performance tracker
   * @returns Touch latency result
   */
  async measureLatency(
    packageName: string,
    screenSize: ScreenSize,
    options: {
      sampleCount?: number;
      maxWaitMs?: number;
    } = {},
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<TouchLatencyResult> {
    const sampleCount = options.sampleCount || 3;
    const maxWaitMs = options.maxWaitMs || 200; // 200ms max wait per sample

    logger.info(`[TouchLatency] Measuring touch latency for ${packageName} (${sampleCount} samples)`);

    const touchLocation = this.selectSafeTouchLocation(screenSize);
    const measurements: number[] = [];

    try {
      for (let i = 0; i < sampleCount; i++) {
        logger.debug(`[TouchLatency] Taking sample ${i + 1}/${sampleCount}`);

        // Reset gfxinfo to get clean baseline
        await perf.track("adbGfxinfoReset", () =>
          this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName} reset`)
        );

        // Small delay to ensure reset is processed
        await new Promise(resolve => setTimeout(resolve, 50));

        // Get baseline frame stats
        const { stdout: baselineStdout } = await perf.track("adbGfxinfoBaseline", () =>
          this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`)
        );
        const baselineStats = this.idle.parseMetrics(baselineStdout);

        // Inject touch and immediately start measuring
        await this.injectTouch(touchLocation.x, touchLocation.y, perf);

        // Measure time until frame response
        const latency = await this.measureFrameResponse(
          packageName,
          baselineStats,
          maxWaitMs,
          perf
        );

        if (latency !== null) {
          measurements.push(latency);
          logger.debug(`[TouchLatency] Sample ${i + 1}: ${latency}ms`);
        } else {
          logger.warn(`[TouchLatency] Sample ${i + 1} timeout - no response within ${maxWaitMs}ms`);
        }

        // Wait between samples to avoid interference
        if (i < sampleCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (measurements.length === 0) {
        return {
          latencyMs: 0,
          touchCoordinates: touchLocation,
          success: false,
          error: "No successful measurements - UI may be frozen or gfxinfo unavailable",
          sampleCount: 0
        };
      }

      // Calculate median latency (more robust than average)
      measurements.sort((a, b) => a - b);
      const medianLatency = measurements.length % 2 === 0
        ? (measurements[measurements.length / 2 - 1] + measurements[measurements.length / 2]) / 2
        : measurements[Math.floor(measurements.length / 2)];

      logger.info(`[TouchLatency] Measured latency: ${medianLatency}ms (from ${measurements.length} samples)`);

      return {
        latencyMs: medianLatency,
        touchCoordinates: touchLocation,
        success: true,
        sampleCount: measurements.length
      };

    } catch (error) {
      logger.error(`[TouchLatency] Failed to measure touch latency: ${error}`);
      return {
        latencyMs: 0,
        touchCoordinates: touchLocation,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sampleCount: measurements.length
      };
    }
  }
}
