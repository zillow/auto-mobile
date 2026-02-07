import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { UiStabilityResult, TouchIdleResult, RotationCheckResult, BootedDevice } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";

export class Idle {
  private adb: AdbExecutor;
  private timer: Timer;

  /**
   * Create an Idle instance
   * @param device - Optional device ID
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   */
  constructor(device: BootedDevice, adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory, timer: Timer = defaultTimer) {
    // Detect if the argument is a factory (has create method) or an executor
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      this.adb = (adbFactoryOrExecutor as AdbClientFactory).create(device);
    } else if (adbFactoryOrExecutor) {
      this.adb = adbFactoryOrExecutor as AdbExecutor;
    } else {
      this.adb = defaultAdbClientFactory.create(device);
    }
    this.timer = timer;
  }

  /**
   * Check if a package is a system/launcher package that might not provide meaningful gfxinfo
   * @param packageName - Package name to check
   * @returns True if this is likely a system package
   */
  private isSystemLauncher(packageName: string | null): boolean {
    // Handle null, undefined, or empty package names
    if (!packageName) {
      return false;
    }

    const systemPackages = [
      "com.android.systemui",
      "com.android.launcher",
      "com.android.launcher3",
      "com.google.android.apps.nexuslauncher",
      "com.samsung.android.app.launcher",
      "com.miui.home",
      "com.oneplus.launcher",
      "com.huawei.android.launcher",
      "com.sec.android.app.launcher",
      "com.android.settings"
    ];

    return systemPackages.some(sysPackage =>
      packageName.includes(sysPackage) || sysPackage.includes(packageName)
    );
  }

  /**
   * Check touch idle status
   * @param startTime - When the idle checking started
   * @param lastEventTime - When the last touch event was detected
   * @param timeoutMs - Required idle timeout in milliseconds
   * @param hardLimitMs - Hard timeout limit in milliseconds
   * @returns Object containing idle check results
   */
  getTouchStatus(
    startTime: number,
    lastEventTime: number,
    timeoutMs: number,
    hardLimitMs: number
  ): TouchIdleResult {
    const currentElapsed = this.timer.now() - startTime;
    const idleTime = this.timer.now() - lastEventTime;
    const isIdle = idleTime >= timeoutMs;
    const shouldContinue = !isIdle && currentElapsed < hardLimitMs;

    return {
      isIdle,
      shouldContinue,
      currentElapsed,
      idleTime
    };
  }

  /**
   * Check rotation status against target
   * @param targetRotation - The expected rotation value
   * @param startTime - When rotation checking started
   * @param timeoutMs - Maximum time to wait for rotation
   * @param perf - Optional performance tracker
   * @returns Object containing rotation check results
   */
  async getRotationStatus(
    targetRotation: number,
    startTime: number,
    timeoutMs: number,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<RotationCheckResult> {
    const currentElapsed = this.timer.now() - startTime;
    const shouldContinue = currentElapsed < timeoutMs;

    try {
      // Check the current rotation through window manager service
      const { stdout } = await perf.track("adbDumpsysWindowRotation", () =>
        this.adb.executeCommand('shell dumpsys window | grep -i "mRotation="')
      );
      const rotationMatch = stdout.match(/mRotation=(\d+)/);

      if (rotationMatch) {
        const currentRotation = parseInt(rotationMatch[1], 10);
        logger.debug(`Current rotation: ${currentRotation}, target: ${targetRotation}`);

        if (currentRotation === targetRotation) {
          logger.debug(`Rotation to ${targetRotation} complete, took ${currentElapsed}ms`);
          return {
            rotationComplete: true,
            currentRotation,
            shouldContinue: false
          };
        }

        return {
          rotationComplete: false,
          currentRotation,
          shouldContinue
        };
      }

      return {
        rotationComplete: false,
        currentRotation: null,
        shouldContinue
      };
    } catch (err) {
      // Just continue polling on error
      return {
        rotationComplete: false,
        currentRotation: null,
        shouldContinue
      };
    }
  }

  /**
   * Measure UI idle status by resetting gfx stats and taking an immediate measurement
   * @param packageName - Package name of the app to monitor
   * @param measurementDelayMs - Time to wait after reset before measuring (default 200ms)
   * @param perf - Optional performance tracker
   * @returns Object containing UI idle measurement results
   */
  async getUiStabilitySnapshot(
    packageName: string,
    measurementDelayMs: number = 200,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<UiStabilityResult> {
    logger.info(`[AwaitIdle] Measuring UI idle for ${packageName} with ${measurementDelayMs}ms delay`);

    try {
      // Reset the gfxinfo stats for the package
      await perf.track("adbGfxinfoReset", () =>
        this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName} reset`)
      );

      // Wait for measurement period to accumulate data
      await defaultTimer.sleep(measurementDelayMs);

      // Take immediate measurement with no previous state
      return await this.getUiStability(
        packageName,
        null, // No previous missed vsync
        null, // No previous slow UI thread
        null, // No previous frame deadline missed
        null, // No previous total frames
        false, // Not first log since we just reset
        perf
      );
    } catch (err) {
      logger.info(`[Idle] Error measuring UI idle: ${err}`);
      return {
        isStable: false,
        shouldUpdateLastNonIdleTime: true,
        updatedPrevMissedVsync: null,
        updatedPrevSlowUiThread: null,
        updatedPrevFrameDeadlineMissed: null,
        updatedFirstGfxInfoLog: false
      };
    }
  }

  /**
   * Get frame stats from adb command
   * @param packageName - Package name of the app
   * @param firstGfxInfoLog - Whether this is the first gfx info log
   * @param perf - Optional performance tracker
   * @returns Frame stats output string
   */
  private async getFrameStats(
    packageName: string,
    firstGfxInfoLog: boolean,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<string> {
    try {
      const { stdout } = await perf.track("adbGfxinfo", () =>
        this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`)
      );
      if (firstGfxInfoLog) {
        logger.info(`[AwaitIdle] Initial gfxinfo stdout for ${packageName}:\n${stdout}`);
      }
      return stdout;
    } catch (error) {
      // If gfxinfo fails, return empty string to trigger fallback behavior
      logger.info(`[AwaitIdle] Failed to get gfxinfo for ${packageName}: ${error}`);
      return "";
    }
  }

  /**
   * Parse all metrics from gfxinfo output
   * @param stdout - The gfxinfo output string
   * @returns Object containing parsed metrics
   */
  parseMetrics(stdout: string): {
    percentile50th: number | null;
    percentile90th: number | null;
    percentile95th: number | null;
    percentile99th: number | null;
    totalFrames: number | null;
    missedVsync: number | null;
    slowUiThread: number | null;
    frameDeadlineMissed: number | null;
  } {
    const percentile50th = this.extractMetric(stdout, /50th percentile:\s+(\d+(?:\.\d+)?)ms/);
    const percentile90th = this.extractMetric(stdout, /90th percentile:\s+(\d+(?:\.\d+)?)ms/);
    const percentile95th = this.extractMetric(stdout, /95th percentile:\s+(\d+(?:\.\d+)?)ms/);
    const percentile99th = this.extractMetric(stdout, /99th percentile:\s+(\d+(?:\.\d+)?)ms/);
    const totalFrames = this.extractMetric(stdout, /Total frames rendered:\s+(\d+)/);
    const missedVsync = this.extractMetric(stdout, /Number Missed Vsync:\s+(\d+)/);
    const slowUiThread = this.extractMetric(stdout, /Number Slow UI thread:\s+(\d+)/);
    const frameDeadlineMissed = this.extractMetric(stdout, /Number Frame deadline missed:\s+(\d+)/);

    logger.debug(`Metrics: 50th=${percentile50th}ms 90th=${percentile90th}ms 95th=${percentile95th}ms 99th=${percentile99th}ms TotalFrames=${totalFrames} MissedVsync=${missedVsync} SlowUI=${slowUiThread} DeadlineMissed=${frameDeadlineMissed}`);

    return {
      percentile50th,
      percentile90th,
      percentile95th,
      percentile99th,
      totalFrames,
      missedVsync,
      slowUiThread,
      frameDeadlineMissed
    };
  }

  /**
   * Validate frame data metrics
   * @param metrics - Parsed metrics object
   * @returns True if metrics contain valid frame data
   */
  public validateFrameData(metrics: {
    percentile50th: number | null;
    missedVsync: number | null;
    slowUiThread: number | null;
  }): boolean {
    return metrics.percentile50th !== null &&
      metrics.missedVsync !== null &&
      metrics.slowUiThread !== null;
  }

  /**
   * Update stability state with current metrics
   * @param current - Current metric values
   * @param previous - Previous metric values
   * @returns Updated state object
   */
  public updateStabilityState(
    current: { missedVsync: number | null; slowUiThread: number | null; frameDeadlineMissed: number | null; totalFrames: number | null },
    previous: { missedVsync: number | null; slowUiThread: number | null; frameDeadlineMissed: number | null; totalFrames: number | null }
  ): {
    updatedPrevMissedVsync: number | null;
    updatedPrevSlowUiThread: number | null;
    updatedPrevFrameDeadlineMissed: number | null;
    updatedPrevTotalFrames: number | null;
    deltas: { missedVsyncDelta: number; slowUiThreadDelta: number; frameDeadlineMissedDelta: number; totalFramesDelta: number | null };
  } {
    const updatedPrevMissedVsync = current.missedVsync;
    const updatedPrevSlowUiThread = current.slowUiThread;
    const updatedPrevFrameDeadlineMissed = current.frameDeadlineMissed;
    const updatedPrevTotalFrames = current.totalFrames;

    const deltas = this.calculateDeltas(current, previous);

    return {
      updatedPrevMissedVsync,
      updatedPrevSlowUiThread,
      updatedPrevFrameDeadlineMissed,
      updatedPrevTotalFrames,
      deltas
    };
  }

  /**
   * Process frame stats and determine stability
   * @param stdout - Frame stats output
   * @param prevMissedVsync - Previous missed vsync count
   * @param prevSlowUiThread - Previous slow UI thread count
   * @param prevFrameDeadlineMissed - Previous frame deadline missed count
   * @returns Object containing stability determination and updated state
   */
  public processFrameStatsForStability(
    stdout: string,
    prevMissedVsync: number | null,
    prevSlowUiThread: number | null,
    prevFrameDeadlineMissed: number | null,
    prevTotalFrames: number | null
  ): {
    isStable: boolean;
    shouldUpdateLastNonIdleTime: boolean;
    updatedPrevMissedVsync: number | null;
    updatedPrevSlowUiThread: number | null;
    updatedPrevFrameDeadlineMissed: number | null;
    updatedPrevTotalFrames: number | null;
  } {
    // Parse specific metrics
    const metrics = this.parseMetrics(stdout);

    // Check if we have valid data
    if (!this.validateFrameData(metrics)) {
      logger.info(`[AwaitIdle] No valid frame data yet: percentile50th ${metrics.percentile50th} && missedVsync ${metrics.missedVsync} && slowUiThread ${metrics.slowUiThread}`);
      return {
        isStable: false,
        shouldUpdateLastNonIdleTime: true,
        updatedPrevMissedVsync: prevMissedVsync,
        updatedPrevSlowUiThread: prevSlowUiThread,
        updatedPrevFrameDeadlineMissed: prevFrameDeadlineMissed,
        updatedPrevTotalFrames: prevTotalFrames
      };
    }

    // Update state with current values and calculate deltas
    const stateUpdate = this.updateStabilityState(
      {
        missedVsync: metrics.missedVsync,
        slowUiThread: metrics.slowUiThread,
        frameDeadlineMissed: metrics.frameDeadlineMissed,
        totalFrames: metrics.totalFrames
      },
      {
        missedVsync: prevMissedVsync,
        slowUiThread: prevSlowUiThread,
        frameDeadlineMissed: prevFrameDeadlineMissed,
        totalFrames: prevTotalFrames
      }
    );

    // Check stability criteria
    const isStable = this.checkStabilityCriteria(stateUpdate.deltas, {
      percentile50th: metrics.percentile50th,
      percentile90th: metrics.percentile90th,
      percentile95th: metrics.percentile95th
    }, metrics.totalFrames);

    return {
      isStable,
      shouldUpdateLastNonIdleTime: !isStable,
      updatedPrevMissedVsync: stateUpdate.updatedPrevMissedVsync,
      updatedPrevSlowUiThread: stateUpdate.updatedPrevSlowUiThread,
      updatedPrevFrameDeadlineMissed: stateUpdate.updatedPrevFrameDeadlineMissed,
      updatedPrevTotalFrames: stateUpdate.updatedPrevTotalFrames
    };
  }

  /**
   * Calculate deltas between current and previous metrics
   * @param current - Current metric values
   * @param previous - Previous metric values
   * @returns Object containing calculated deltas
   */
  calculateDeltas(
    current: { missedVsync: number | null; slowUiThread: number | null; frameDeadlineMissed: number | null; totalFrames: number | null },
    previous: { missedVsync: number | null; slowUiThread: number | null; frameDeadlineMissed: number | null; totalFrames: number | null }
  ): {
    missedVsyncDelta: number;
    slowUiThreadDelta: number;
    frameDeadlineMissedDelta: number;
    totalFramesDelta: number | null;
  } {
    const missedVsyncDelta = previous.missedVsync !== null && current.missedVsync !== null
      ? current.missedVsync - previous.missedVsync : 0;
    const slowUiThreadDelta = previous.slowUiThread !== null && current.slowUiThread !== null
      ? current.slowUiThread - previous.slowUiThread : 0;
    const frameDeadlineMissedDelta = previous.frameDeadlineMissed !== null && current.frameDeadlineMissed !== null
      ? current.frameDeadlineMissed - previous.frameDeadlineMissed : 0;
    const totalFramesDelta = previous.totalFrames !== null && current.totalFrames !== null
      ? (current.totalFrames >= previous.totalFrames ? current.totalFrames - previous.totalFrames : null)
      : null;

    logger.debug(`Deltas: MissedVsync=${missedVsyncDelta} SlowUI=${slowUiThreadDelta} DeadlineMissed=${frameDeadlineMissedDelta} TotalFrames=${totalFramesDelta}`);

    return {
      missedVsyncDelta,
      slowUiThreadDelta,
      frameDeadlineMissedDelta,
      totalFramesDelta
    };
  }

  /**
   * Check if metrics meet stability criteria
   * @param deltas - Delta values between measurements
   * @param percentiles - Current percentile metrics
   * @returns Whether the UI is stable
   */
  checkStabilityCriteria(
    deltas: { missedVsyncDelta: number; slowUiThreadDelta: number; frameDeadlineMissedDelta: number; totalFramesDelta: number | null },
    percentiles: { percentile50th: number | null; percentile90th: number | null; percentile95th: number | null },
    totalFrames: number | null
  ): boolean {
    // Check idle criteria:
    // - Zero delta in missed vsyncs
    // - Zero delta in slow UI threads
    // - Zero delta in frame deadline missed
    // - All percentiles < reasonable thresholds (when there are enough new frames)
    const p50Int = percentiles.percentile50th !== null ? Math.floor(percentiles.percentile50th) : 0;
    const p90Int = percentiles.percentile90th !== null ? Math.floor(percentiles.percentile90th) : 0;
    const p95Int = percentiles.percentile95th !== null ? Math.floor(percentiles.percentile95th) : 0;
    const minFramesForPercentiles = 5;
    const hasNewFrames = deltas.totalFramesDelta !== null && deltas.totalFramesDelta > 0;
    const hasEnoughFrames = totalFrames !== null && totalFrames >= minFramesForPercentiles;
    const shouldCheckPercentiles = deltas.totalFramesDelta === null || (hasNewFrames && hasEnoughFrames);
    const percentilesOk = !shouldCheckPercentiles ||
      (p50Int < 100 && p90Int < 100 && p95Int < 200);

    const isStable = deltas.missedVsyncDelta === 0 &&
      deltas.slowUiThreadDelta === 0 &&
      deltas.frameDeadlineMissedDelta === 0 &&
      percentilesOk;

    if (isStable) {
      logger.info("[AwaitIdle] UI appears stable (criteria met)");
    } else {
      const percentileMessage = shouldCheckPercentiles
        ? `percentiles (50th=${p50Int}, 90th=${p90Int}, 95th=${p95Int})`
        : `percentiles skipped (frames=${totalFrames ?? "n/a"}, delta=${deltas.totalFramesDelta ?? "n/a"})`;
      logger.info(`[AwaitIdle] UI not stable: deltas (Vsync=${deltas.missedVsyncDelta}, UI=${deltas.slowUiThreadDelta}, Deadline=${deltas.frameDeadlineMissedDelta}, Frames=${deltas.totalFramesDelta ?? "n/a"}), ${percentileMessage}`);
    }

    return isStable;
  }

  /**
   * Check UI stability metrics and return calculation results
   * @param packageName - Package name of the app to monitor
   * @param prevMissedVsync - Previous missed vsync count
   * @param prevSlowUiThread - Previous slow UI thread count
   * @param prevFrameDeadlineMissed - Previous frame deadline missed count
   * @param firstGfxInfoLog - Whether this is the first gfx info log
   * @param perf - Optional performance tracker
   * @returns Object containing stability check results and updated state
   */
  async getUiStability(
    packageName: string,
    prevMissedVsync: number | null,
    prevSlowUiThread: number | null,
    prevFrameDeadlineMissed: number | null,
    prevTotalFrames: number | null,
    firstGfxInfoLog: boolean,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<UiStabilityResult> {
    try {
      // For system packages, use a simpler approach
      if (this.isSystemLauncher(packageName)) {
        logger.info(`[AwaitIdle] ${packageName} is a system package, using simplified stability check`);
        return {
          isStable: true,
          shouldUpdateLastNonIdleTime: false,
          updatedPrevMissedVsync: null,
          updatedPrevSlowUiThread: null,
          updatedPrevFrameDeadlineMissed: null,
          updatedPrevTotalFrames: null,
          updatedFirstGfxInfoLog: false
        };
      }

      // Get the frame stats
      const stdout = await this.getFrameStats(packageName, firstGfxInfoLog, perf);

      // If we get empty output, treat as stable (package might not support gfxinfo)
      if (!stdout || stdout.trim() === "") {
        logger.info(`[AwaitIdle] No gfxinfo data for ${packageName}, treating as stable`);
        return {
          isStable: true,
          shouldUpdateLastNonIdleTime: false,
          updatedPrevMissedVsync: null,
          updatedPrevSlowUiThread: null,
          updatedPrevFrameDeadlineMissed: null,
          updatedPrevTotalFrames: null,
          updatedFirstGfxInfoLog: false
        };
      }

      // Process frame stats and determine stability
      const result = this.processFrameStatsForStability(
        stdout,
        prevMissedVsync,
        prevSlowUiThread,
        prevFrameDeadlineMissed,
        prevTotalFrames
      );

      return {
        isStable: result.isStable,
        shouldUpdateLastNonIdleTime: result.shouldUpdateLastNonIdleTime,
        updatedPrevMissedVsync: result.updatedPrevMissedVsync,
        updatedPrevSlowUiThread: result.updatedPrevSlowUiThread,
        updatedPrevFrameDeadlineMissed: result.updatedPrevFrameDeadlineMissed,
        updatedPrevTotalFrames: result.updatedPrevTotalFrames,
        updatedFirstGfxInfoLog: false
      };
    } catch (err) {
      // Just continue polling on error
      logger.info(`[AwaitIdle] Error checking frame stats: ${err}`);
      return {
        isStable: false,
        shouldUpdateLastNonIdleTime: true,
        updatedPrevMissedVsync: prevMissedVsync,
        updatedPrevSlowUiThread: prevSlowUiThread,
        updatedPrevFrameDeadlineMissed: prevFrameDeadlineMissed,
        updatedPrevTotalFrames: prevTotalFrames,
        updatedFirstGfxInfoLog: false
      };
    }
  }

  /**
   * Helper method to extract numeric metrics from gfxinfo output
   * @param output - The gfxinfo output string
   * @param regex - Regular expression to match the metric
   * @returns The extracted number or null if not found
   */
  extractMetric(output: string, regex: RegExp): number | null {
    const match = output.match(regex);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      return isNaN(value) ? null : value;
    }
    return null;
  }
}
