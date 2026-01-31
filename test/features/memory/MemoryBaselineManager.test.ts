import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryBaselineManager } from "../../../src/features/memory/MemoryBaselineManager";
import type { MemoryBaseline } from "../../../src/db/types";
import type { MemoryMetrics } from "../../../src/features/memory/MemoryMetricsCollector";

describe("MemoryBaselineManager - Unit Tests", function() {
  let manager: MemoryBaselineManager;

  beforeEach(function() {
    manager = new MemoryBaselineManager();
  });

  // Note: exponentialMovingAverage tests moved to MetricsUtils.test.ts

  describe("calculateAnomalyMultiplier", function() {
    test("should calculate multipliers correctly for normal growth", function() {
      const baseline: MemoryBaseline = {
        id: 1,
        device_id: "test-device",
        package_name: "com.example.app",
        tool_name: "tapOn",
        java_heap_baseline_mb: 50,
        native_heap_baseline_mb: 30,
        gc_count_baseline: 5,
        gc_duration_baseline_ms: 100,
        unreachable_objects_baseline: 100,
        sample_count: 10,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 45,
          nativeHeapMb: 28,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 100, // 2x baseline
          nativeHeapMb: 60, // 2x baseline
          totalPssMb: 200,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 55,
        nativeHeapGrowthMb: 32,
        totalPssGrowthMb: 100,
        gcEvents: [],
        gcCount: 10, // 2x baseline
        gcTotalDurationMs: 200, // 2x baseline
        unreachableObjects: {
          count: 200, // 2x baseline
          sizeKb: 10,
          raw: "",
        },
      };

      const result = manager.calculateAnomalyMultiplier(baseline, metrics);

      expect(result.javaHeapMultiplier).toBe(2.0);
      expect(result.nativeHeapMultiplier).toBe(2.0);
      expect(result.gcCountMultiplier).toBe(2.0);
      expect(result.gcDurationMultiplier).toBe(2.0);
      expect(result.unreachableObjectsMultiplier).toBe(2.0);
    });

    test("should handle zero baseline values safely", function() {
      const baseline: MemoryBaseline = {
        id: 1,
        device_id: "test-device",
        package_name: "com.example.app",
        tool_name: "tapOn",
        java_heap_baseline_mb: 0,
        native_heap_baseline_mb: 0,
        gc_count_baseline: 0,
        gc_duration_baseline_ms: 0,
        unreachable_objects_baseline: 0,
        sample_count: 1,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 0,
          nativeHeapMb: 0,
          totalPssMb: 0,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 50,
        nativeHeapGrowthMb: 30,
        totalPssGrowthMb: 100,
        gcEvents: [],
        gcCount: 5,
        gcTotalDurationMs: 100,
        unreachableObjects: {
          count: 50,
          sizeKb: 5,
          raw: "",
        },
      };

      const result = manager.calculateAnomalyMultiplier(baseline, metrics);

      // When baseline is 0 and current > 0, should return Infinity
      expect(result.javaHeapMultiplier).toBe(Infinity);
      expect(result.nativeHeapMultiplier).toBe(Infinity);
      expect(result.gcCountMultiplier).toBe(Infinity);
      expect(result.gcDurationMultiplier).toBe(Infinity);
      expect(result.unreachableObjectsMultiplier).toBe(Infinity);
    });

    test("should handle zero current values", function() {
      const baseline: MemoryBaseline = {
        id: 1,
        device_id: "test-device",
        package_name: "com.example.app",
        tool_name: "tapOn",
        java_heap_baseline_mb: 50,
        native_heap_baseline_mb: 30,
        gc_count_baseline: 5,
        gc_duration_baseline_ms: 100,
        unreachable_objects_baseline: 100,
        sample_count: 10,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 0,
          nativeHeapMb: 0,
          totalPssMb: 0,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: -50,
        nativeHeapGrowthMb: -30,
        totalPssGrowthMb: -100,
        gcEvents: [],
        gcCount: 0,
        gcTotalDurationMs: 0,
        unreachableObjects: {
          count: 0,
          sizeKb: 0,
          raw: "",
        },
      };

      const result = manager.calculateAnomalyMultiplier(baseline, metrics);

      // All multipliers should be 0
      expect(result.javaHeapMultiplier).toBe(0);
      expect(result.nativeHeapMultiplier).toBe(0);
      expect(result.gcCountMultiplier).toBe(0);
      expect(result.gcDurationMultiplier).toBe(0);
      expect(result.unreachableObjectsMultiplier).toBe(0);
    });

    test("should handle null unreachable objects", function() {
      const baseline: MemoryBaseline = {
        id: 1,
        device_id: "test-device",
        package_name: "com.example.app",
        tool_name: "tapOn",
        java_heap_baseline_mb: 50,
        native_heap_baseline_mb: 30,
        gc_count_baseline: 5,
        gc_duration_baseline_ms: 100,
        unreachable_objects_baseline: 100,
        sample_count: 10,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 45,
          nativeHeapMb: 28,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 5,
        nativeHeapGrowthMb: 2,
        totalPssGrowthMb: 0,
        gcEvents: [],
        gcCount: 5,
        gcTotalDurationMs: 100,
        unreachableObjects: null,
      };

      const result = manager.calculateAnomalyMultiplier(baseline, metrics);

      // Unreachable objects multiplier should be 0 when null
      expect(result.unreachableObjectsMultiplier).toBe(0);
    });
  });
});
