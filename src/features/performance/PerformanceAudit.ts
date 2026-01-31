import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { BootedDevice, ScreenSize } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { Idle } from "../observe/Idle";
import { DeviceCapabilitiesDetector, DeviceCapabilities } from "../../utils/DeviceCapabilities";
import { TouchLatencyTracker } from "./TouchLatencyTracker";
import { serverConfig } from "../../utils/ServerConfig";
import { PerformanceAuditRepository } from "../../db/performanceAuditRepository";

/**
 * Performance metrics collected during audit
 */
export interface PerformanceMetrics {
  // Frame timing metrics
  p50Ms: number | null;
  p90Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;

  // Jank indicators
  jankCount: number | null;
  missedVsyncCount: number | null;
  slowUiThreadCount: number | null;
  frameDeadlineMissedCount: number | null;

  // CPU metrics
  cpuUsagePercent: number | null;
  threadCount: number | null;

  // Touch latency
  touchLatencyMs: number | null;

  // ANR detection
  anrDetected: boolean;
  anrDetails: string | null;

  // Live metrics extension
  timeToFirstFrameMs: number | null;
  timeToInteractiveMs: number | null;
  frameRateFps: number | null;

  // Raw diagnostics
  gfxinfoRaw: string | null;
  cpuStatsRaw: string | null;
}

/**
 * Performance audit result
 */
export interface PerformanceAuditResult {
  passed: boolean;
  metrics: PerformanceMetrics;
  violations: PerformanceViolation[];
  diagnostics: string | null;
  deviceCapabilities: DeviceCapabilities;
}

/**
 * Represents a single performance threshold violation
 */
export interface PerformanceViolation {
  metric: string;
  threshold: number;
  actual: number;
  severity: "warning" | "critical";
  contributionWeight: number; // 0-1, how much this contributes to the overall issue
}

/**
 * Options for metric collection
 */
export interface CollectMetricsOptions {
  measureTtff?: boolean;
  measureTti?: boolean;
}

/**
 * Performance audit class for collecting and validating performance metrics
 */
export class PerformanceAudit {
  private adb: AdbExecutor;
  private device: BootedDevice;
  private idle: Idle;
  private capabilitiesDetector: DeviceCapabilitiesDetector;
  private touchLatencyTracker: TouchLatencyTracker;
  private repository = new PerformanceAuditRepository();

  constructor(device: BootedDevice, adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.idle = new Idle(device, adbFactory);
    this.capabilitiesDetector = new DeviceCapabilitiesDetector(device, adbFactory);
    this.touchLatencyTracker = new TouchLatencyTracker(device, adbFactory);
  }

  /**
   * Collect all performance metrics for a package
   */
  async collectMetrics(
    packageName: string,
    screenSize?: ScreenSize,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    options?: CollectMetricsOptions
  ): Promise<PerformanceMetrics> {
    const opts = options ?? {};
    logger.info(`[PerformanceAudit] Collecting metrics for ${packageName}`);

    // Collect metrics in parallel for efficiency
    const [gfxMetrics, cpuMetrics, anrStatus, frameRate] = await Promise.all([
      this.collectGfxMetrics(packageName, perf),
      this.collectCpuMetrics(packageName, perf),
      this.checkForAnr(packageName, perf),
      this.calculateFrameRate(packageName, perf),
    ]);

    // Touch latency requires sequential execution after other metrics
    const touchLatency = await this.measureTouchLatency(packageName, screenSize, perf);

    // Optional TTFF/TTI measurement (these are heavier operations)
    let ttffMs: number | null = null;
    let ttiMs: number | null = null;

    if (opts.measureTtff) {
      ttffMs = await this.measureTimeToFirstFrame(packageName, perf);
    }

    if (opts.measureTti && ttffMs !== null) {
      ttiMs = await this.measureTimeToInteractive(packageName, ttffMs, perf);
    }

    const result: PerformanceMetrics = {
      p50Ms: gfxMetrics.p50Ms ?? null,
      p90Ms: gfxMetrics.p90Ms ?? null,
      p95Ms: gfxMetrics.p95Ms ?? null,
      p99Ms: gfxMetrics.p99Ms ?? null,
      jankCount: gfxMetrics.jankCount ?? null,
      missedVsyncCount: gfxMetrics.missedVsyncCount ?? null,
      slowUiThreadCount: gfxMetrics.slowUiThreadCount ?? null,
      frameDeadlineMissedCount: gfxMetrics.frameDeadlineMissedCount ?? null,
      cpuUsagePercent: cpuMetrics.cpuUsagePercent ?? null,
      threadCount: cpuMetrics.threadCount ?? null,
      touchLatencyMs: touchLatency,
      anrDetected: anrStatus.anrDetected ?? false,
      anrDetails: anrStatus.anrDetails ?? null,
      timeToFirstFrameMs: ttffMs,
      timeToInteractiveMs: ttiMs,
      frameRateFps: frameRate,
      gfxinfoRaw: gfxMetrics.gfxinfoRaw ?? null,
      cpuStatsRaw: cpuMetrics.cpuStatsRaw ?? null,
    };

    return result;
  }

  /**
   * Collect graphics performance metrics using gfxinfo
   */
  private async collectGfxMetrics(
    packageName: string,
    perf: PerformanceTracker
  ): Promise<Partial<PerformanceMetrics>> {
    try {
      const { stdout } = await perf.track("adbGfxinfo", () =>
        this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`)
      );

      const metrics = this.idle.parseMetrics(stdout);

      // Calculate jank count as sum of all jank indicators
      const jankCount = (metrics.missedVsync || 0) +
                        (metrics.slowUiThread || 0) +
                        (metrics.frameDeadlineMissed || 0);

      return {
        p50Ms: metrics.percentile50th,
        p90Ms: metrics.percentile90th,
        p95Ms: metrics.percentile95th,
        p99Ms: metrics.percentile99th,
        jankCount,
        missedVsyncCount: metrics.missedVsync,
        slowUiThreadCount: metrics.slowUiThread,
        frameDeadlineMissedCount: metrics.frameDeadlineMissed,
        gfxinfoRaw: stdout,
      };
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to collect gfx metrics: ${error}`);
      return {
        p50Ms: null,
        p90Ms: null,
        p95Ms: null,
        p99Ms: null,
        jankCount: null,
        missedVsyncCount: null,
        slowUiThreadCount: null,
        frameDeadlineMissedCount: null,
        gfxinfoRaw: null,
      };
    }
  }

  /**
   * Collect CPU usage metrics for the package
   */
  private async collectCpuMetrics(
    packageName: string,
    perf: PerformanceTracker
  ): Promise<Partial<PerformanceMetrics>> {
    try {
      // Get process ID
      const { stdout: pidOutput } = await perf.track("adbGetPid", () =>
        this.adb.executeCommand(`shell pidof ${packageName}`)
      );

      const pid = pidOutput.trim();
      if (!pid) {
        logger.warn(`[PerformanceAudit] No PID found for ${packageName}`);
        return {
          cpuUsagePercent: null,
          threadCount: null,
          cpuStatsRaw: null,
        };
      }

      // Get thread count
      const { stdout: threadOutput } = await perf.track("adbThreadCount", () =>
        this.adb.executeCommand(`shell ps -T -p ${pid} | wc -l`)
      );
      const threadCount = parseInt(threadOutput.trim(), 10) - 1; // Subtract header line

      // Get CPU stats from /proc/{pid}/stat
      const { stdout: statOutput } = await perf.track("adbCpuStat", () =>
        this.adb.executeCommand(`shell cat /proc/${pid}/stat`)
      );

      // Parse CPU usage
      // Format: pid (comm) state ppid pgrp session tty_nr tpgid flags minflt cminflt majflt cmajflt utime stime cutime cstime...
      const statFields = statOutput.split(" ");
      const utime = parseInt(statFields[13] || "0", 10); // User time
      const stime = parseInt(statFields[14] || "0", 10); // System time
      const totalTime = utime + stime;

      // Get system uptime to calculate CPU percentage
      const { stdout: uptimeOutput } = await perf.track("adbUptime", () =>
        this.adb.executeCommand("shell cat /proc/uptime")
      );
      const uptimeSeconds = parseFloat(uptimeOutput.split(" ")[0] || "0");

      // CPU usage = (total_time / uptime) * 100
      // Note: This is a simplified calculation. For more accurate results,
      // we should measure delta over time
      const cpuUsagePercent = uptimeSeconds > 0
        ? (totalTime / (uptimeSeconds * 100)) * 100
        : null;

      return {
        cpuUsagePercent,
        threadCount,
        cpuStatsRaw: statOutput,
      };
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to collect CPU metrics: ${error}`);
      return {
        cpuUsagePercent: null,
        threadCount: null,
        cpuStatsRaw: null,
      };
    }
  }

  /**
   * Check for pending ANRs
   */
  private async checkForAnr(
    packageName: string,
    perf: PerformanceTracker
  ): Promise<Partial<PerformanceMetrics>> {
    try {
      const { stdout } = await perf.track("adbCheckAnr", () =>
        this.adb.executeCommand(`shell dumpsys activity processes | grep -A 20 "${packageName}"`)
      );

      // Look for ANR indicators
      const anrDetected = stdout.toLowerCase().includes("anr") ||
                         stdout.toLowerCase().includes("not responding");

      return {
        anrDetected,
        anrDetails: anrDetected ? stdout : null,
      };
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to check for ANR: ${error}`);
      return {
        anrDetected: false,
        anrDetails: null,
      };
    }
  }

  /**
   * Measure touch response latency
   * Injects touch on non-clickable area and measures response time
   * Only runs when --ui-perf-mode flag is enabled
   */
  private async measureTouchLatency(
    packageName: string,
    screenSize: ScreenSize | undefined,
    perf: PerformanceTracker
  ): Promise<number | null> {
    // Only measure touch latency when UI performance mode is enabled
    if (!serverConfig.isUiPerfModeEnabled()) {
      logger.debug("[PerformanceAudit] Touch latency measurement skipped (--ui-perf-mode not enabled)");
      return null;
    }

    // Screen size is required for touch latency measurement
    if (!screenSize) {
      logger.warn("[PerformanceAudit] Touch latency measurement skipped (screen size not provided)");
      return null;
    }

    try {
      logger.info("[PerformanceAudit] Measuring touch latency with synthetic touches");
      const result = await perf.track("touchLatencyMeasurement", () =>
        this.touchLatencyTracker.measureLatency(packageName, screenSize, {
          sampleCount: 3,
          maxWaitMs: 200
        }, perf)
      );

      if (result.success) {
        logger.info(`[PerformanceAudit] Touch latency measured: ${result.latencyMs}ms`);
        return result.latencyMs;
      } else {
        logger.warn(`[PerformanceAudit] Touch latency measurement failed: ${result.error}`);
        return null;
      }
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to measure touch latency: ${error}`);
      return null;
    }
  }

  /**
   * Calculate frame rate (FPS) from gfxinfo data.
   * Uses Total frames rendered / elapsed time to compute average FPS.
   */
  private async calculateFrameRate(
    packageName: string,
    perf: PerformanceTracker
  ): Promise<number | null> {
    try {
      const { stdout } = await perf.track("adbGfxinfoFrameRate", () =>
        this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`)
      );

      // Parse "Total frames rendered: N"
      const totalFramesMatch = stdout.match(/Total frames rendered:\s*(\d+)/);
      if (!totalFramesMatch) {
        return null;
      }

      const totalFrames = parseInt(totalFramesMatch[1], 10);
      if (totalFrames === 0) {
        return null;
      }

      // Get refresh rate from device capabilities for accurate FPS calculation
      const capabilities = await this.capabilitiesDetector.getCapabilities();
      const refreshRate = capabilities.refreshRateHz || 60;

      // Parse frame histogram to estimate duration
      // Look for "Number HISTOGRAM..." or "janky frames" section
      const jankyFramesMatch = stdout.match(/Janky frames:\s*(\d+)/);
      const jankyFrames = jankyFramesMatch ? parseInt(jankyFramesMatch[1], 10) : 0;

      // Calculate FPS based on frame time percentiles
      // If we have p50, use it as the average frame time
      const metrics = this.idle.parseMetrics(stdout);
      if (metrics.percentile50th && metrics.percentile50th > 0) {
        const avgFrameTimeMs = metrics.percentile50th;
        const fps = 1000 / avgFrameTimeMs;
        return Math.min(fps, refreshRate); // Cap at refresh rate
      }

      // Fallback: estimate FPS from janky frame ratio
      // Assume janky frames take 2x normal frame time
      if (jankyFrames > 0 && totalFrames > 0) {
        const normalFrames = totalFrames - jankyFrames;
        const frameTimeTarget = 1000 / refreshRate;
        const totalTime = (normalFrames * frameTimeTarget) + (jankyFrames * frameTimeTarget * 2);
        const fps = (totalFrames * 1000) / totalTime;
        return Math.min(fps, refreshRate);
      }

      // Default to refresh rate if we can't calculate
      return refreshRate;
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to calculate frame rate: ${error}`);
      return null;
    }
  }

  /**
   * Measure time to first frame (TTFF) by parsing ActivityManager logcat output.
   * Looks for "ActivityManager: Displayed" log entries with timing information.
   */
  private async measureTimeToFirstFrame(
    packageName: string,
    perf: PerformanceTracker
  ): Promise<number | null> {
    try {
      // Clear logcat and launch the app to measure fresh TTFF
      // This looks for recent "Displayed" entries in logcat
      const { stdout } = await perf.track("adbLogcatTtff", () =>
        this.adb.executeCommand(
          `shell "logcat -d -s ActivityManager:I | grep -E 'Displayed.*${packageName}' | tail -1"`
        )
      );

      if (!stdout.trim()) {
        logger.debug("[PerformanceAudit] No TTFF data found in logcat");
        return null;
      }

      // Parse format: "Displayed com.example.app/.MainActivity: +500ms" or "+1s200ms"
      const ttffMatch = stdout.match(/Displayed\s+\S+:\s*\+?(\d+)s?(\d*)m?s?/);
      if (!ttffMatch) {
        // Try alternative format: "+500ms" or "+1s200ms"
        const altMatch = stdout.match(/\+(\d+)s(\d+)ms|\+(\d+)ms/);
        if (altMatch) {
          if (altMatch[1] && altMatch[2]) {
            // Format: +Xs+Yms
            const seconds = parseInt(altMatch[1], 10);
            const ms = parseInt(altMatch[2], 10);
            return seconds * 1000 + ms;
          } else if (altMatch[3]) {
            // Format: +Xms
            return parseInt(altMatch[3], 10);
          }
        }
        return null;
      }

      const seconds = ttffMatch[1] ? parseInt(ttffMatch[1], 10) : 0;
      const ms = ttffMatch[2] ? parseInt(ttffMatch[2], 10) : 0;

      return seconds * 1000 + ms;
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to measure TTFF: ${error}`);
      return null;
    }
  }

  /**
   * Measure time to interactive (TTI).
   * TTI = TTFF + time until UI is stable (no jank for 500ms).
   */
  private async measureTimeToInteractive(
    packageName: string,
    ttffMs: number,
    perf: PerformanceTracker
  ): Promise<number | null> {
    try {
      const stabilityCheckIntervalMs = 100;
      const stabilityThresholdMs = 500;
      const maxWaitMs = 5000;

      let stableStartTime: number | null = null;
      let elapsedMs = 0;

      while (elapsedMs < maxWaitMs) {
        // Reset gfxinfo to start fresh measurement
        await perf.track("adbGfxinfoTtiReset", () =>
          this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName} reset`)
        );

        // Wait for check interval
        await new Promise(resolve => setTimeout(resolve, stabilityCheckIntervalMs));
        elapsedMs += stabilityCheckIntervalMs;

        // Get metrics after interval
        const { stdout: afterStdout } = await perf.track("adbGfxinfoTtiAfter", () =>
          this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName}`)
        );

        const metrics = this.idle.parseMetrics(afterStdout);
        const hasJank = (metrics.missedVsync || 0) > 0 ||
                       (metrics.slowUiThread || 0) > 0 ||
                       (metrics.frameDeadlineMissed || 0) > 0;

        if (hasJank) {
          stableStartTime = null;
        } else {
          if (stableStartTime === null) {
            stableStartTime = elapsedMs;
          } else if (elapsedMs - stableStartTime >= stabilityThresholdMs) {
            // UI has been stable for threshold duration
            logger.info(`[PerformanceAudit] TTI reached: ${ttffMs + stableStartTime}ms`);
            return ttffMs + stableStartTime;
          }
        }
      }

      // Timed out waiting for stability
      logger.warn(`[PerformanceAudit] TTI measurement timed out after ${maxWaitMs}ms`);
      return null;
    } catch (error) {
      logger.warn(`[PerformanceAudit] Failed to measure TTI: ${error}`);
      return null;
    }
  }

  /**
   * Validate metrics against thresholds
   */
  validateMetrics(
    metrics: PerformanceMetrics,
    thresholds: {
      frameTimeThresholdMs: number;
      p50ThresholdMs: number;
      p90ThresholdMs: number;
      p95ThresholdMs: number;
      p99ThresholdMs: number;
      jankCountThreshold: number;
      cpuUsageThresholdPercent: number;
      touchLatencyThresholdMs: number;
    }
  ): PerformanceViolation[] {
    const violations: PerformanceViolation[] = [];

    // Check percentile thresholds
    if (metrics.p50Ms !== null && metrics.p50Ms > thresholds.p50ThresholdMs) {
      violations.push({
        metric: "p50",
        threshold: thresholds.p50ThresholdMs,
        actual: metrics.p50Ms,
        severity: "warning",
        contributionWeight: 0.6, // p50 is very important
      });
    }

    if (metrics.p90Ms !== null && metrics.p90Ms > thresholds.p90ThresholdMs) {
      violations.push({
        metric: "p90",
        threshold: thresholds.p90ThresholdMs,
        actual: metrics.p90Ms,
        severity: "warning",
        contributionWeight: 0.7,
      });
    }

    if (metrics.p95Ms !== null && metrics.p95Ms > thresholds.p95ThresholdMs) {
      violations.push({
        metric: "p95",
        threshold: thresholds.p95ThresholdMs,
        actual: metrics.p95Ms,
        severity: "critical",
        contributionWeight: 0.8,
      });
    }

    if (metrics.p99Ms !== null && metrics.p99Ms > thresholds.p99ThresholdMs) {
      violations.push({
        metric: "p99",
        threshold: thresholds.p99ThresholdMs,
        actual: metrics.p99Ms,
        severity: "warning",
        contributionWeight: 0.4, // p99 is less critical as it's outliers
      });
    }

    // Check jank count
    if (metrics.jankCount !== null && metrics.jankCount > thresholds.jankCountThreshold) {
      violations.push({
        metric: "jankCount",
        threshold: thresholds.jankCountThreshold,
        actual: metrics.jankCount,
        severity: "critical",
        contributionWeight: 0.9, // Jank is very bad
      });
    }

    // Check CPU usage
    if (metrics.cpuUsagePercent !== null &&
        metrics.cpuUsagePercent > thresholds.cpuUsageThresholdPercent) {
      violations.push({
        metric: "cpuUsage",
        threshold: thresholds.cpuUsageThresholdPercent,
        actual: metrics.cpuUsagePercent,
        severity: "warning",
        contributionWeight: 0.5,
      });
    }

    // Check touch latency
    if (metrics.touchLatencyMs !== null &&
        metrics.touchLatencyMs > thresholds.touchLatencyThresholdMs) {
      violations.push({
        metric: "touchLatency",
        threshold: thresholds.touchLatencyThresholdMs,
        actual: metrics.touchLatencyMs,
        severity: "critical",
        contributionWeight: 0.85, // Touch responsiveness is very important
      });
    }

    // ANR is always critical
    if (metrics.anrDetected) {
      violations.push({
        metric: "anr",
        threshold: 0,
        actual: 1,
        severity: "critical",
        contributionWeight: 1.0, // ANR is the worst
      });
    }

    return violations;
  }

  /**
   * Generate weighted diagnostic output based on violations
   */
  generateDiagnostics(
    metrics: PerformanceMetrics,
    violations: PerformanceViolation[]
  ): string {
    if (violations.length === 0) {
      return "No performance issues detected";
    }

    // Sort violations by contribution weight (highest first)
    const sortedViolations = [...violations].sort(
      (a, b) => b.contributionWeight - a.contributionWeight
    );

    let diagnostics = "Performance issues detected:\n\n";

    // Include top contributors (weight > 0.5)
    const topContributors = sortedViolations.filter(v => v.contributionWeight > 0.5);

    diagnostics += "Top contributors:\n";
    for (const violation of topContributors) {
      diagnostics += `- ${violation.metric}: ${violation.actual.toFixed(2)} (threshold: ${violation.threshold.toFixed(2)}) [${violation.severity}]\n`;
    }

    // Include relevant raw data based on violations
    diagnostics += "\nDiagnostic details:\n";

    // Include gfxinfo if we have frame timing issues
    const hasFrameIssues = topContributors.some(v =>
      ["p50", "p90", "p95", "p99", "jankCount"].includes(v.metric)
    );
    if (hasFrameIssues && metrics.gfxinfoRaw) {
      diagnostics += "\n--- GFXINFO DUMP ---\n";
      diagnostics += metrics.gfxinfoRaw;
      diagnostics += "\n--- END GFXINFO ---\n";
    }

    // Include CPU stats if we have CPU issues
    const hasCpuIssues = topContributors.some(v => v.metric === "cpuUsage");
    if (hasCpuIssues && metrics.cpuStatsRaw) {
      diagnostics += "\n--- CPU STATS ---\n";
      diagnostics += `Thread count: ${metrics.threadCount}\n`;
      diagnostics += `CPU usage: ${metrics.cpuUsagePercent?.toFixed(2)}%\n`;
      diagnostics += metrics.cpuStatsRaw;
      diagnostics += "\n--- END CPU STATS ---\n";
    }

    // Include ANR details if detected
    if (metrics.anrDetected && metrics.anrDetails) {
      diagnostics += "\n--- ANR DETECTED ---\n";
      diagnostics += metrics.anrDetails;
      diagnostics += "\n--- END ANR ---\n";
    }

    return diagnostics;
  }

  /**
   * Run a complete performance audit
   */
  async runAudit(
    packageName: string,
    thresholds: {
      frameTimeThresholdMs: number;
      p50ThresholdMs: number;
      p90ThresholdMs: number;
      p95ThresholdMs: number;
      p99ThresholdMs: number;
      jankCountThreshold: number;
      cpuUsageThresholdPercent: number;
      touchLatencyThresholdMs: number;
    },
    screenSize?: ScreenSize,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<PerformanceAuditResult> {
    logger.info(`[PerformanceAudit] Running audit for ${packageName}`);

    // Get device capabilities
    const deviceCapabilities = await this.capabilitiesDetector.getCapabilities();

    // Collect metrics
    const metrics = await this.collectMetrics(packageName, screenSize, perf);

    // Validate against thresholds
    const violations = this.validateMetrics(metrics, thresholds);

    // Generate diagnostics
    const diagnostics = violations.length > 0
      ? this.generateDiagnostics(metrics, violations)
      : null;

    const passed = violations.length === 0;
    const sessionId = new Date().toISOString().split("T")[0];

    await this.repository.recordAudit({
      deviceId: this.device.deviceId,
      sessionId,
      packageName,
      timestamp: new Date().toISOString(),
      passed,
      metrics: {
        p50Ms: metrics.p50Ms,
        p90Ms: metrics.p90Ms,
        p95Ms: metrics.p95Ms,
        p99Ms: metrics.p99Ms,
        jankCount: metrics.jankCount,
        missedVsyncCount: metrics.missedVsyncCount,
        slowUiThreadCount: metrics.slowUiThreadCount,
        frameDeadlineMissedCount: metrics.frameDeadlineMissedCount,
        cpuUsagePercent: metrics.cpuUsagePercent,
        touchLatencyMs: metrics.touchLatencyMs,
      },
      diagnostics,
    });

    return {
      passed,
      metrics,
      violations,
      diagnostics,
      deviceCapabilities,
    };
  }
}
