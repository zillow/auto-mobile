import { getDatabase } from "../../db/database";
import { NewMemoryThresholds, MemoryThresholds } from "../../db/types";
import { logger } from "../../utils/logger";
import { sql } from "kysely";
import { MemoryBaseline } from "../../db/types";

/**
 * Default memory thresholds for different app profiles
 */
const DEFAULT_THRESHOLDS = {
  // Conservative defaults for typical apps
  standard: {
    heapGrowthThresholdMb: 50,
    nativeHeapGrowthThresholdMb: 30,
    gcCountThreshold: 10,
    gcDurationThresholdMs: 500,
    unreachableObjectsThreshold: 1000,
  },
  // Stricter thresholds for memory-sensitive apps
  strict: {
    heapGrowthThresholdMb: 20,
    nativeHeapGrowthThresholdMb: 10,
    gcCountThreshold: 5,
    gcDurationThresholdMs: 200,
    unreachableObjectsThreshold: 500,
  },
  // Relaxed thresholds for media/game apps
  relaxed: {
    heapGrowthThresholdMb: 100,
    nativeHeapGrowthThresholdMb: 75,
    gcCountThreshold: 20,
    gcDurationThresholdMs: 1000,
    unreachableObjectsThreshold: 2000,
  },
};

/**
 * Manages memory thresholds with TTL, per-app profiles, and weighted averaging
 */
export class MemoryThresholdManager {
  private db = getDatabase();

  /**
   * Clean up expired thresholds based on TTL
   */
  async cleanupExpiredThresholds(deviceId: string): Promise<void> {
    try {
      const deleted = await this.db
        .deleteFrom("memory_thresholds")
        .where("device_id", "=", deviceId)
        .where(
          sql`datetime(created_at, '+' || ttl_hours || ' hours')`,
          "<",
          sql`datetime('now')`
        )
        .execute();

      if (deleted.length > 0) {
        logger.info(
          `[MemoryThresholdManager] Cleaned up ${deleted.length} expired thresholds for device ${deviceId}`
        );
      }
    } catch (error) {
      logger.warn(`[MemoryThresholdManager] Failed to cleanup expired thresholds: ${error}`);
    }
  }

  /**
   * Get valid (non-expired) thresholds for a device/package combination
   */
  async getValidThresholds(
    deviceId: string,
    packageName: string
  ): Promise<MemoryThresholds[]> {
    await this.cleanupExpiredThresholds(deviceId);

    const thresholds = await this.db
      .selectFrom("memory_thresholds")
      .selectAll()
      .where("device_id", "=", deviceId)
      .where("package_name", "=", packageName)
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
    thresholds: MemoryThresholds[]
  ): Omit<NewMemoryThresholds, "device_id" | "package_name" | "created_at"> | null {
    if (thresholds.length === 0) {
      return null;
    }

    const totalWeight = thresholds.reduce((sum, t) => sum + t.weight, 0);

    if (totalWeight === 0) {
      return null;
    }

    const weightedAvg = (field: keyof MemoryThresholds) => {
      const sum = thresholds.reduce(
        (acc, t) => acc + (t[field] as number) * t.weight,
        0
      );
      return sum / totalWeight;
    };

    return {
      heap_growth_threshold_mb: weightedAvg("heap_growth_threshold_mb"),
      native_heap_growth_threshold_mb: weightedAvg("native_heap_growth_threshold_mb"),
      gc_count_threshold: Math.round(weightedAvg("gc_count_threshold")),
      gc_duration_threshold_ms: weightedAvg("gc_duration_threshold_ms"),
      unreachable_objects_threshold: Math.round(weightedAvg("unreachable_objects_threshold")),
      weight: 1.0,
      ttl_hours: 24,
    };
  }

  /**
   * Create thresholds from baseline using adaptive multiplier
   * Uses 2x baseline as the threshold (configurable)
   */
  createThresholdsFromBaseline(
    baseline: MemoryBaseline,
    multiplier: number = 2.0
  ): {
    heapGrowthThresholdMb: number;
    nativeHeapGrowthThresholdMb: number;
    gcCountThreshold: number;
    gcDurationThresholdMs: number;
    unreachableObjectsThreshold: number;
  } {
    return {
      heapGrowthThresholdMb: baseline.java_heap_baseline_mb * multiplier,
      nativeHeapGrowthThresholdMb: baseline.native_heap_baseline_mb * multiplier,
      gcCountThreshold: Math.max(Math.round(baseline.gc_count_baseline * multiplier), 1),
      gcDurationThresholdMs: baseline.gc_duration_baseline_ms * multiplier,
      unreachableObjectsThreshold: Math.max(
        Math.round(baseline.unreachable_objects_baseline * multiplier),
        100 // Minimum threshold
      ),
    };
  }

  /**
   * Get or create thresholds for a device/package combination
   * Priority: 1) Weighted average of existing thresholds, 2) Adaptive from baseline, 3) Default profile
   */
  async getOrCreateThresholds(
    deviceId: string,
    packageName: string,
    baseline: MemoryBaseline | null = null,
    profile: keyof typeof DEFAULT_THRESHOLDS = "standard"
  ): Promise<{
    heapGrowthThresholdMb: number;
    nativeHeapGrowthThresholdMb: number;
    gcCountThreshold: number;
    gcDurationThresholdMs: number;
    unreachableObjectsThreshold: number;
  }> {
    // Try to get existing weighted thresholds
    const existingThresholds = await this.getValidThresholds(deviceId, packageName);

    if (existingThresholds.length > 0) {
      const weighted = this.calculateWeightedAverageThresholds(existingThresholds);
      if (weighted) {
        logger.info(
          `[MemoryThresholdManager] Using weighted average of ${existingThresholds.length} threshold entries for ${packageName}`
        );
        return {
          heapGrowthThresholdMb: weighted.heap_growth_threshold_mb,
          nativeHeapGrowthThresholdMb: weighted.native_heap_growth_threshold_mb,
          gcCountThreshold: weighted.gc_count_threshold,
          gcDurationThresholdMs: weighted.gc_duration_threshold_ms,
          unreachableObjectsThreshold: weighted.unreachable_objects_threshold,
        };
      }
    }

    // Try to create adaptive thresholds from baseline
    if (baseline && baseline.sample_count >= 3) {
      logger.info(
        `[MemoryThresholdManager] Creating adaptive thresholds from baseline for ${packageName} (${baseline.sample_count} samples)`
      );
      const adaptiveThresholds = this.createThresholdsFromBaseline(baseline);

      // Store these thresholds for future use
      await this.storeThresholds(deviceId, packageName, adaptiveThresholds);

      return adaptiveThresholds;
    }

    // Fall back to default profile
    logger.info(
      `[MemoryThresholdManager] Using default '${profile}' profile for ${packageName}`
    );
    const defaultThresholds = DEFAULT_THRESHOLDS[profile];

    // Store defaults for future weight adjustment
    await this.storeThresholds(deviceId, packageName, defaultThresholds);

    return defaultThresholds;
  }

  /**
   * Store new thresholds for a device/package
   */
  async storeThresholds(
    deviceId: string,
    packageName: string,
    thresholds: {
      heapGrowthThresholdMb: number;
      nativeHeapGrowthThresholdMb: number;
      gcCountThreshold: number;
      gcDurationThresholdMs: number;
      unreachableObjectsThreshold: number;
    },
    weight: number = 1.0,
    ttlHours: number = 24
  ): Promise<void> {
    const newThresholds: NewMemoryThresholds = {
      device_id: deviceId,
      package_name: packageName,
      heap_growth_threshold_mb: thresholds.heapGrowthThresholdMb,
      native_heap_growth_threshold_mb: thresholds.nativeHeapGrowthThresholdMb,
      gc_count_threshold: thresholds.gcCountThreshold,
      gc_duration_threshold_ms: thresholds.gcDurationThresholdMs,
      unreachable_objects_threshold: thresholds.unreachableObjectsThreshold,
      weight,
      ttl_hours: ttlHours,
    };

    try {
      await this.db
        .insertInto("memory_thresholds")
        .values(newThresholds)
        .execute();

      logger.info(
        `[MemoryThresholdManager] Stored new thresholds for ${packageName} on device ${deviceId}`
      );
    } catch (error) {
      logger.error(`[MemoryThresholdManager] Failed to store thresholds: ${error}`);
      throw error;
    }
  }

  /**
   * Update threshold weight based on audit results
   * Successful audits increase weight, failures decrease it
   */
  async updateThresholdWeight(
    deviceId: string,
    packageName: string,
    passed: boolean
  ): Promise<void> {
    try {
      const thresholds = await this.getValidThresholds(deviceId, packageName);

      if (thresholds.length === 0) {
        logger.warn(
          `[MemoryThresholdManager] No thresholds found for ${packageName} on device ${deviceId}`
        );
        return;
      }

      // Update the most recent threshold
      const mostRecent = thresholds[0];
      const currentWeight = mostRecent.weight;
      const newWeight = passed
        ? Math.min(currentWeight * 1.1, 2.0) // Increase up to 2.0
        : Math.max(currentWeight * 0.9, 0.1); // Decrease down to 0.1

      await this.db
        .updateTable("memory_thresholds")
        .set({ weight: newWeight })
        .where("id", "=", mostRecent.id)
        .execute();

      logger.debug(
        `[MemoryThresholdManager] Updated threshold weight from ${currentWeight.toFixed(2)} to ${newWeight.toFixed(2)} for ${packageName} (${passed ? "passed" : "failed"})`
      );
    } catch (error) {
      logger.warn(`[MemoryThresholdManager] Failed to update threshold weight: ${error}`);
    }
  }
}
