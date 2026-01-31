import { getDatabase } from "../../db/database";
import { NewPerformanceThresholds, PerformanceThresholds } from "../../db/types";
import { logger } from "../../utils/logger";
import { DeviceCapabilities, DeviceCapabilitiesDetector } from "../../utils/DeviceCapabilities";
import { sql } from "kysely";
import {
  adjustWeight,
  calculateWeightedAverage,
  calculateMode,
  WEIGHT_BOUNDS,
  DEFAULT_TTL,
} from "../shared/MetricsUtils";

/**
 * Manages performance thresholds with TTL and weighted averaging
 */
export class ThresholdManager {
  private db = getDatabase();

  /**
   * Get the current session ID
   * This is a simple timestamp-based session ID
   * In the future, this could be tied to device boot time or app start time
   */
  private getCurrentSessionId(): string {
    // Use current date as session ID (one session per day)
    const now = new Date();
    return now.toISOString().split("T")[0]; // YYYY-MM-DD
  }

  /**
   * Clean up expired thresholds based on TTL
   */
  async cleanupExpiredThresholds(deviceId: string): Promise<void> {
    try {
      // Delete thresholds where created_at + ttl_hours < now
      const deleted = await this.db
        .deleteFrom("performance_thresholds")
        .where("device_id", "=", deviceId)
        .where(
          sql`datetime(created_at, '+' || ttl_hours || ' hours')`,
          "<",
          sql`datetime('now')`
        )
        .execute();

      if (deleted.length > 0) {
        logger.info(`[ThresholdManager] Cleaned up ${deleted.length} expired thresholds for device ${deviceId}`);
      }
    } catch (error) {
      logger.warn(`[ThresholdManager] Failed to cleanup expired thresholds: ${error}`);
    }
  }

  /**
   * Get valid (non-expired) thresholds for a device
   */
  async getValidThresholds(deviceId: string): Promise<PerformanceThresholds[]> {
    // First cleanup expired thresholds
    await this.cleanupExpiredThresholds(deviceId);

    // Get all valid thresholds
    const thresholds = await this.db
      .selectFrom("performance_thresholds")
      .selectAll()
      .where("device_id", "=", deviceId)
      .where(
        sql`datetime(created_at, '+' || ttl_hours || ' hours')`,
        ">=",
        sql`datetime('now')`
      )
      .orderBy("created_at", "desc")
      .execute();

    return thresholds;
  }

  /**
   * Calculate weighted average thresholds from historical data
   */
  calculateWeightedAverageThresholds(
    thresholds: PerformanceThresholds[]
  ): Omit<NewPerformanceThresholds, "device_id" | "session_id" | "created_at"> | null {
    if (thresholds.length === 0) {
      return null;
    }

    const getWeight = (t: PerformanceThresholds) => t.weight;

    const frameTime = calculateWeightedAverage(
      thresholds,
      t => t.frame_time_threshold_ms,
      getWeight
    );
    if (frameTime === null) {return null;}

    // Use the most common refresh rate (mode)
    const refreshRate = calculateMode(thresholds.map(t => t.refresh_rate)) ?? 60;

    return {
      refresh_rate: refreshRate,
      frame_time_threshold_ms: frameTime,
      p50_threshold_ms: calculateWeightedAverage(thresholds, t => t.p50_threshold_ms, getWeight)!,
      p90_threshold_ms: calculateWeightedAverage(thresholds, t => t.p90_threshold_ms, getWeight)!,
      p95_threshold_ms: calculateWeightedAverage(thresholds, t => t.p95_threshold_ms, getWeight)!,
      p99_threshold_ms: calculateWeightedAverage(thresholds, t => t.p99_threshold_ms, getWeight)!,
      jank_count_threshold: Math.round(
        calculateWeightedAverage(thresholds, t => t.jank_count_threshold, getWeight)!
      ),
      cpu_usage_threshold_percent: calculateWeightedAverage(
        thresholds,
        t => t.cpu_usage_threshold_percent,
        getWeight
      )!,
      touch_latency_threshold_ms: calculateWeightedAverage(
        thresholds,
        t => t.touch_latency_threshold_ms,
        getWeight
      )!,
      weight: WEIGHT_BOUNDS.max / 2, // New thresholds start with weight 1.0
      ttl_hours: DEFAULT_TTL.thresholdHours,
    };
  }

  /**
   * Get or create thresholds for a device
   * If valid thresholds exist, return weighted average
   * Otherwise, detect device capabilities and create new thresholds
   */
  async getOrCreateThresholds(
    deviceId: string,
    capabilities: DeviceCapabilities
  ): Promise<{
    frameTimeThresholdMs: number;
    p50ThresholdMs: number;
    p90ThresholdMs: number;
    p95ThresholdMs: number;
    p99ThresholdMs: number;
    jankCountThreshold: number;
    cpuUsageThresholdPercent: number;
    touchLatencyThresholdMs: number;
  }> {
    // Get existing valid thresholds
    const existingThresholds = await this.getValidThresholds(deviceId);

    // If we have existing thresholds, calculate weighted average
    if (existingThresholds.length > 0) {
      const weighted = this.calculateWeightedAverageThresholds(existingThresholds);
      if (weighted) {
        logger.info(
          `[ThresholdManager] Using weighted average of ${existingThresholds.length} threshold entries for device ${deviceId}`
        );
        return {
          frameTimeThresholdMs: weighted.frame_time_threshold_ms,
          p50ThresholdMs: weighted.p50_threshold_ms,
          p90ThresholdMs: weighted.p90_threshold_ms,
          p95ThresholdMs: weighted.p95_threshold_ms,
          p99ThresholdMs: weighted.p99_threshold_ms,
          jankCountThreshold: weighted.jank_count_threshold,
          cpuUsageThresholdPercent: weighted.cpu_usage_threshold_percent,
          touchLatencyThresholdMs: weighted.touch_latency_threshold_ms,
        };
      }
    }

    // No existing thresholds, create new ones based on device capabilities
    logger.info(`[ThresholdManager] Creating new thresholds for device ${deviceId}`);
    const defaultThresholds = DeviceCapabilitiesDetector.calculateDefaultThresholds(capabilities);

    // Store the new thresholds
    await this.storeThresholds(deviceId, capabilities, defaultThresholds);

    return defaultThresholds;
  }

  /**
   * Store new thresholds for a device
   */
  async storeThresholds(
    deviceId: string,
    capabilities: DeviceCapabilities,
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
    weight: number = 1.0,
    ttlHours: number = 24
  ): Promise<void> {
    const sessionId = this.getCurrentSessionId();

    const newThresholds: NewPerformanceThresholds = {
      device_id: deviceId,
      session_id: sessionId,
      refresh_rate: capabilities.refreshRate,
      frame_time_threshold_ms: thresholds.frameTimeThresholdMs,
      p50_threshold_ms: thresholds.p50ThresholdMs,
      p90_threshold_ms: thresholds.p90ThresholdMs,
      p95_threshold_ms: thresholds.p95ThresholdMs,
      p99_threshold_ms: thresholds.p99ThresholdMs,
      jank_count_threshold: thresholds.jankCountThreshold,
      cpu_usage_threshold_percent: thresholds.cpuUsageThresholdPercent,
      touch_latency_threshold_ms: thresholds.touchLatencyThresholdMs,
      weight,
      ttl_hours: ttlHours,
    };

    try {
      await this.db
        .insertInto("performance_thresholds")
        .values(newThresholds)
        .execute();

      logger.info(`[ThresholdManager] Stored new thresholds for device ${deviceId} session ${sessionId}`);
    } catch (error) {
      logger.error(`[ThresholdManager] Failed to store thresholds: ${error}`);
      throw error;
    }
  }

  /**
   * Update threshold weight based on audit results
   * Successful audits increase weight, failures decrease it
   */
  async updateThresholdWeight(
    deviceId: string,
    sessionId: string,
    passed: boolean
  ): Promise<void> {
    try {
      // Get current thresholds for this session
      const threshold = await this.db
        .selectFrom("performance_thresholds")
        .selectAll()
        .where("device_id", "=", deviceId)
        .where("session_id", "=", sessionId)
        .orderBy("created_at", "desc")
        .limit(1)
        .executeTakeFirst();

      if (!threshold) {
        logger.warn(`[ThresholdManager] No threshold found for device ${deviceId} session ${sessionId}`);
        return;
      }

      // Adjust weight based on result using shared utility
      const currentWeight = threshold.weight;
      const newWeight = adjustWeight(currentWeight, passed);

      await this.db
        .updateTable("performance_thresholds")
        .set({ weight: newWeight })
        .where("id", "=", threshold.id)
        .execute();

      logger.debug(
        `[ThresholdManager] Updated threshold weight from ${currentWeight.toFixed(2)} to ${newWeight.toFixed(2)} (${passed ? "passed" : "failed"})`
      );
    } catch (error) {
      logger.warn(`[ThresholdManager] Failed to update threshold weight: ${error}`);
    }
  }
}
