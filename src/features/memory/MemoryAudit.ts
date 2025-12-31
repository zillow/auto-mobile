import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { BootedDevice } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { MemoryMetricsCollector, MemoryMetrics } from "./MemoryMetricsCollector";
import { MemoryThresholdManager } from "./MemoryThresholdManager";
import { MemoryBaselineManager } from "./MemoryBaselineManager";
import { getDatabase } from "../../db/database";
import { NewMemoryAuditResult } from "../../db/types";

/**
 * Represents a single memory threshold violation
 */
export interface MemoryViolation {
  metric: string;
  threshold: number;
  actual: number;
  severity: "warning" | "critical";
  contributionWeight: number; // 0-1, how much this contributes to the overall issue
}

/**
 * Memory audit result
 */
export interface MemoryAuditResult {
  passed: boolean;
  metrics: MemoryMetrics;
  violations: MemoryViolation[];
  diagnostics: string | null;
}

/**
 * Memory audit class for collecting and validating memory metrics
 * Detects memory leaks, excessive GC, and memory pressure
 */
export class MemoryAudit {
  private adb: AdbClient;
  private device: BootedDevice;
  private metricsCollector: MemoryMetricsCollector;
  private thresholdManager: MemoryThresholdManager;
  private baselineManager: MemoryBaselineManager;
  private db = getDatabase();

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.metricsCollector = new MemoryMetricsCollector(device, this.adb);
    this.thresholdManager = new MemoryThresholdManager();
    this.baselineManager = new MemoryBaselineManager();
  }

  /**
   * Run a complete memory audit around an action
   */
  async runAudit(
    packageName: string,
    toolName: string,
    toolArgs: unknown,
    action: () => Promise<void>,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<MemoryAuditResult> {
    logger.info(`[MemoryAudit] Running memory audit for ${packageName} (${toolName})`);

    // Collect metrics around the action
    const metrics = await this.metricsCollector.collectMetrics(packageName, action, perf);

    // Get baseline for this app/tool combination
    const baseline = await this.baselineManager.getBaseline(
      this.device.id,
      packageName,
      toolName
    );

    // Get or create thresholds
    const thresholds = await this.thresholdManager.getOrCreateThresholds(
      this.device.id,
      packageName,
      baseline
    );

    // Validate metrics against thresholds
    const violations = this.validateMetrics(metrics, thresholds, baseline);

    // Generate diagnostics
    const diagnostics = violations.length > 0
      ? this.generateDiagnostics(metrics, violations)
      : null;

    const passed = violations.length === 0;

    // Store audit result in database
    await this.storeAuditResult(
      packageName,
      toolName,
      toolArgs,
      metrics,
      violations,
      diagnostics,
      passed
    );

    // Update baseline with new metrics (only if passed, to avoid poisoning baseline)
    if (passed) {
      await this.baselineManager.updateBaseline(
        this.device.id,
        packageName,
        toolName,
        metrics
      );
    }

    // Update threshold weights based on result
    await this.thresholdManager.updateThresholdWeight(
      this.device.id,
      packageName,
      passed
    );

    return {
      passed,
      metrics,
      violations,
      diagnostics,
    };
  }

  /**
   * Validate metrics against thresholds
   */
  private validateMetrics(
    metrics: MemoryMetrics,
    thresholds: {
      heapGrowthThresholdMb: number;
      nativeHeapGrowthThresholdMb: number;
      gcCountThreshold: number;
      gcDurationThresholdMs: number;
      unreachableObjectsThreshold: number;
    },
    baseline: any // MemoryBaseline | null
  ): MemoryViolation[] {
    const violations: MemoryViolation[] = [];

    // Check Java heap growth
    if (metrics.javaHeapGrowthMb > thresholds.heapGrowthThresholdMb) {
      violations.push({
        metric: "javaHeapGrowth",
        threshold: thresholds.heapGrowthThresholdMb,
        actual: metrics.javaHeapGrowthMb,
        severity: metrics.javaHeapGrowthMb > thresholds.heapGrowthThresholdMb * 1.5 ? "critical" : "warning",
        contributionWeight: 0.9, // Heap growth is very important
      });
    }

    // Check native heap growth
    if (metrics.nativeHeapGrowthMb > thresholds.nativeHeapGrowthThresholdMb) {
      violations.push({
        metric: "nativeHeapGrowth",
        threshold: thresholds.nativeHeapGrowthThresholdMb,
        actual: metrics.nativeHeapGrowthMb,
        severity: metrics.nativeHeapGrowthMb > thresholds.nativeHeapGrowthThresholdMb * 1.5 ? "critical" : "warning",
        contributionWeight: 0.85, // Native heap leaks are serious
      });
    }

    // Check GC count
    if (metrics.gcCount > thresholds.gcCountThreshold) {
      violations.push({
        metric: "gcCount",
        threshold: thresholds.gcCountThreshold,
        actual: metrics.gcCount,
        severity: metrics.gcCount > thresholds.gcCountThreshold * 2 ? "critical" : "warning",
        contributionWeight: 0.7, // Excessive GC indicates memory pressure
      });
    }

    // Check GC duration
    if (metrics.gcTotalDurationMs > thresholds.gcDurationThresholdMs) {
      violations.push({
        metric: "gcDuration",
        threshold: thresholds.gcDurationThresholdMs,
        actual: metrics.gcTotalDurationMs,
        severity: "warning",
        contributionWeight: 0.6, // GC pause time affects performance
      });
    }

    // Check unreachable objects
    const unreachableCount = metrics.unreachableObjects?.count || 0;
    if (unreachableCount > thresholds.unreachableObjectsThreshold) {
      violations.push({
        metric: "unreachableObjects",
        threshold: thresholds.unreachableObjectsThreshold,
        actual: unreachableCount,
        severity: "critical",
        contributionWeight: 0.95, // Unreachable objects are strong leak indicators
      });
    }

    // If we have a baseline, check for anomalies (2x baseline = anomaly)
    if (baseline) {
      const anomalies = this.baselineManager.calculateAnomalyMultiplier(baseline, metrics);

      // Flag anomalies that exceed 2x baseline even if under absolute threshold
      if (anomalies.javaHeapMultiplier > 2.0 && metrics.javaHeapGrowthMb > 10) {
        violations.push({
          metric: "javaHeapAnomaly",
          threshold: baseline.java_heap_baseline_mb * 2,
          actual: metrics.postSnapshot.javaHeapMb,
          severity: "warning",
          contributionWeight: 0.5,
        });
      }

      if (anomalies.gcCountMultiplier > 2.0 && metrics.gcCount > 2) {
        violations.push({
          metric: "gcCountAnomaly",
          threshold: baseline.gc_count_baseline * 2,
          actual: metrics.gcCount,
          severity: "warning",
          contributionWeight: 0.4,
        });
      }
    }

    return violations;
  }

  /**
   * Generate weighted diagnostic output based on violations
   */
  private generateDiagnostics(
    metrics: MemoryMetrics,
    violations: MemoryViolation[]
  ): string {
    if (violations.length === 0) {
      return "No memory issues detected";
    }

    // Sort violations by contribution weight (highest first)
    const sortedViolations = [...violations].sort(
      (a, b) => b.contributionWeight - a.contributionWeight
    );

    let diagnostics = "Memory issues detected:\n\n";

    // Include top contributors (weight > 0.5)
    const topContributors = sortedViolations.filter(v => v.contributionWeight > 0.5);

    diagnostics += "Top contributors:\n";
    for (const violation of topContributors) {
      diagnostics += `- ${violation.metric}: ${violation.actual.toFixed(2)} (threshold: ${violation.threshold.toFixed(2)}) [${violation.severity}]\n`;
    }

    // Include memory snapshot details
    diagnostics += "\nMemory snapshots:\n";
    diagnostics += `Pre-action:  Java: ${metrics.preSnapshot.javaHeapMb.toFixed(2)}MB, Native: ${metrics.preSnapshot.nativeHeapMb.toFixed(2)}MB, PSS: ${metrics.preSnapshot.totalPssMb.toFixed(2)}MB\n`;
    diagnostics += `Post-action: Java: ${metrics.postSnapshot.javaHeapMb.toFixed(2)}MB, Native: ${metrics.postSnapshot.nativeHeapMb.toFixed(2)}MB, PSS: ${metrics.postSnapshot.totalPssMb.toFixed(2)}MB\n`;
    diagnostics += `Growth:      Java: ${metrics.javaHeapGrowthMb > 0 ? "+" : ""}${metrics.javaHeapGrowthMb.toFixed(2)}MB, Native: ${metrics.nativeHeapGrowthMb > 0 ? "+" : ""}${metrics.nativeHeapGrowthMb.toFixed(2)}MB, PSS: ${metrics.totalPssGrowthMb > 0 ? "+" : ""}${metrics.totalPssGrowthMb.toFixed(2)}MB\n`;

    // Include GC details
    if (metrics.gcCount > 0) {
      diagnostics += "\nGC activity:\n";
      diagnostics += `Total GC events: ${metrics.gcCount}\n`;
      diagnostics += `Total GC duration: ${metrics.gcTotalDurationMs.toFixed(2)}ms\n`;
      diagnostics += `Average GC pause: ${(metrics.gcTotalDurationMs / metrics.gcCount).toFixed(2)}ms\n`;

      if (metrics.gcEvents.length > 0) {
        diagnostics += "\nGC events:\n";
        for (const event of metrics.gcEvents.slice(0, 5)) {
          diagnostics += `- ${event.type}: freed ${event.freedKb}KB, paused ${event.durationMs}ms\n`;
        }
        if (metrics.gcEvents.length > 5) {
          diagnostics += `... and ${metrics.gcEvents.length - 5} more GC events\n`;
        }
      }
    }

    // Include unreachable objects details
    if (metrics.unreachableObjects) {
      diagnostics += "\nUnreachable objects:\n";
      diagnostics += `Count: ${metrics.unreachableObjects.count}\n`;
      diagnostics += `Size: ${metrics.unreachableObjects.sizeKb.toFixed(2)}KB\n`;
    }

    // Include raw meminfo for critical heap issues
    const hasCriticalHeapIssue = topContributors.some(v =>
      ["javaHeapGrowth", "nativeHeapGrowth", "unreachableObjects"].includes(v.metric) &&
      v.severity === "critical"
    );

    if (hasCriticalHeapIssue) {
      diagnostics += "\n--- PRE-ACTION MEMINFO ---\n";
      diagnostics += this.truncateMeminfo(metrics.preSnapshot.raw);
      diagnostics += "\n--- POST-ACTION MEMINFO ---\n";
      diagnostics += this.truncateMeminfo(metrics.postSnapshot.raw);
    }

    return diagnostics;
  }

  /**
   * Truncate meminfo output to relevant sections
   */
  private truncateMeminfo(meminfo: string): string {
    const lines = meminfo.split("\n");
    const relevantLines: string[] = [];
    let inRelevantSection = false;

    for (const line of lines) {
      // Include summary sections
      if (
        line.includes("TOTAL") ||
        line.includes("Java Heap:") ||
        line.includes("Native Heap:") ||
        line.includes("Objects") ||
        line.includes("App Summary")
      ) {
        inRelevantSection = true;
        relevantLines.push(line);
      } else if (inRelevantSection && line.trim() === "") {
        inRelevantSection = false;
      } else if (inRelevantSection) {
        relevantLines.push(line);
      }
    }

    return relevantLines.join("\n");
  }

  /**
   * Store audit result in database
   */
  private async storeAuditResult(
    packageName: string,
    toolName: string,
    toolArgs: unknown,
    metrics: MemoryMetrics,
    violations: MemoryViolation[],
    diagnostics: string | null,
    passed: boolean
  ): Promise<void> {
    try {
      const sessionId = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

      const auditResult: NewMemoryAuditResult = {
        device_id: this.device.id,
        session_id: sessionId,
        package_name: packageName,
        tool_name: toolName,
        tool_args: JSON.stringify(toolArgs),
        timestamp: new Date().toISOString(),
        passed: passed ? 1 : 0,
        pre_java_heap_mb: metrics.preSnapshot.javaHeapMb,
        pre_native_heap_mb: metrics.preSnapshot.nativeHeapMb,
        pre_total_pss_mb: metrics.preSnapshot.totalPssMb,
        post_java_heap_mb: metrics.postSnapshot.javaHeapMb,
        post_native_heap_mb: metrics.postSnapshot.nativeHeapMb,
        post_total_pss_mb: metrics.postSnapshot.totalPssMb,
        java_heap_growth_mb: metrics.javaHeapGrowthMb,
        native_heap_growth_mb: metrics.nativeHeapGrowthMb,
        total_pss_growth_mb: metrics.totalPssGrowthMb,
        gc_count: metrics.gcCount,
        gc_total_duration_ms: metrics.gcTotalDurationMs,
        unreachable_objects_count: metrics.unreachableObjects?.count || null,
        violations_json: JSON.stringify(violations),
        diagnostics_json: diagnostics,
      };

      await this.db
        .insertInto("memory_audit_results")
        .values(auditResult)
        .execute();

      logger.info(
        `[MemoryAudit] Stored audit result for ${packageName}/${toolName}: ${passed ? "PASSED" : "FAILED"}`
      );
    } catch (error) {
      logger.error(`[MemoryAudit] Failed to store audit result: ${error}`);
    }
  }
}
