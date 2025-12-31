import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryAudit } from "../../../src/features/memory/MemoryAudit";
import type { MemoryMetrics } from "../../../src/features/memory/MemoryMetricsCollector";

describe("MemoryAudit - Unit Tests", function() {
  let audit: MemoryAudit;

  beforeEach(function() {
    // Create instance with test device
    audit = new MemoryAudit({ id: "test-device", platform: "android" } as any);
  });

  describe("validateMetrics", function() {
    test("should pass when all metrics are within thresholds", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 60, // +10 MB growth
          nativeHeapMb: 35, // +5 MB growth
          totalPssMb: 110,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 10,
        nativeHeapGrowthMb: 5,
        totalPssGrowthMb: 10,
        gcEvents: [],
        gcCount: 3,
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 50,
          sizeKb: 5,
          raw: "",
        },
      };

      const thresholds = {
        heapGrowthThresholdMb: 50, // Well above 10 MB
        nativeHeapGrowthThresholdMb: 30, // Well above 5 MB
        gcCountThreshold: 10, // Above 3
        gcDurationThresholdMs: 500, // Above 150 ms
        unreachableObjectsThreshold: 1000, // Above 50
      };

      const violations = (audit as any).validateMetrics(metrics, thresholds, null);

      expect(violations.length).toBe(0);
    });

    test("should detect Java heap growth violation", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 150, // +100 MB growth (exceeds threshold)
          nativeHeapMb: 35,
          totalPssMb: 200,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 100,
        nativeHeapGrowthMb: 5,
        totalPssGrowthMb: 100,
        gcEvents: [],
        gcCount: 3,
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 50,
          sizeKb: 5,
          raw: "",
        },
      };

      const thresholds = {
        heapGrowthThresholdMb: 50, // Exceeded by 100 MB
        nativeHeapGrowthThresholdMb: 30,
        gcCountThreshold: 10,
        gcDurationThresholdMs: 500,
        unreachableObjectsThreshold: 1000,
      };

      const violations = (audit as any).validateMetrics(metrics, thresholds, null);

      expect(violations.length).toBeGreaterThan(0);
      const heapViolation = violations.find((v: any) => v.metric === "javaHeapGrowth");
      expect(heapViolation).toBeDefined();
      expect(heapViolation.actual).toBe(100);
      expect(heapViolation.threshold).toBe(50);
      expect(heapViolation.severity).toBe("critical"); // 100 > 50 * 1.5
    });

    test("should detect native heap growth violation", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 60,
          nativeHeapMb: 100, // +70 MB growth (exceeds threshold)
          totalPssMb: 200,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 10,
        nativeHeapGrowthMb: 70,
        totalPssGrowthMb: 100,
        gcEvents: [],
        gcCount: 3,
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 50,
          sizeKb: 5,
          raw: "",
        },
      };

      const thresholds = {
        heapGrowthThresholdMb: 50,
        nativeHeapGrowthThresholdMb: 30, // Exceeded by 70 MB
        gcCountThreshold: 10,
        gcDurationThresholdMs: 500,
        unreachableObjectsThreshold: 1000,
      };

      const violations = (audit as any).validateMetrics(metrics, thresholds, null);

      expect(violations.length).toBeGreaterThan(0);
      const nativeViolation = violations.find((v: any) => v.metric === "nativeHeapGrowth");
      expect(nativeViolation).toBeDefined();
      expect(nativeViolation.actual).toBe(70);
      expect(nativeViolation.threshold).toBe(30);
      expect(nativeViolation.severity).toBe("critical"); // 70 > 30 * 1.5
    });

    test("should detect GC count violation", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 60,
          nativeHeapMb: 35,
          totalPssMb: 110,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 10,
        nativeHeapGrowthMb: 5,
        totalPssGrowthMb: 10,
        gcEvents: [],
        gcCount: 25, // Exceeds threshold
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 50,
          sizeKb: 5,
          raw: "",
        },
      };

      const thresholds = {
        heapGrowthThresholdMb: 50,
        nativeHeapGrowthThresholdMb: 30,
        gcCountThreshold: 10, // Exceeded by 25
        gcDurationThresholdMs: 500,
        unreachableObjectsThreshold: 1000,
      };

      const violations = (audit as any).validateMetrics(metrics, thresholds, null);

      expect(violations.length).toBeGreaterThan(0);
      const gcViolation = violations.find((v: any) => v.metric === "gcCount");
      expect(gcViolation).toBeDefined();
      expect(gcViolation.actual).toBe(25);
      expect(gcViolation.threshold).toBe(10);
      expect(gcViolation.severity).toBe("critical"); // 25 > 10 * 2
    });

    test("should detect unreachable objects violation", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 60,
          nativeHeapMb: 35,
          totalPssMb: 110,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 10,
        nativeHeapGrowthMb: 5,
        totalPssGrowthMb: 10,
        gcEvents: [],
        gcCount: 3,
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 2000, // Exceeds threshold
          sizeKb: 200,
          raw: "",
        },
      };

      const thresholds = {
        heapGrowthThresholdMb: 50,
        nativeHeapGrowthThresholdMb: 30,
        gcCountThreshold: 10,
        gcDurationThresholdMs: 500,
        unreachableObjectsThreshold: 1000, // Exceeded by 2000
      };

      const violations = (audit as any).validateMetrics(metrics, thresholds, null);

      expect(violations.length).toBeGreaterThan(0);
      const unreachableViolation = violations.find((v: any) => v.metric === "unreachableObjects");
      expect(unreachableViolation).toBeDefined();
      expect(unreachableViolation.actual).toBe(2000);
      expect(unreachableViolation.threshold).toBe(1000);
      expect(unreachableViolation.severity).toBe("critical");
      expect(unreachableViolation.contributionWeight).toBe(0.95); // High weight for leak indicator
    });

    test("should detect baseline anomaly when current exceeds 2x baseline", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 110, // 2.2x baseline (50 * 2.2 = 110)
          nativeHeapMb: 35,
          totalPssMb: 200,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 60,
        nativeHeapGrowthMb: 5,
        totalPssGrowthMb: 100,
        gcEvents: [],
        gcCount: 11, // 2.2x baseline (5 * 2.2 = 11)
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 50,
          sizeKb: 5,
          raw: "",
        },
      };

      const thresholds = {
        heapGrowthThresholdMb: 100, // Not exceeded
        nativeHeapGrowthThresholdMb: 30,
        gcCountThreshold: 20, // Not exceeded
        gcDurationThresholdMs: 500,
        unreachableObjectsThreshold: 1000,
      };

      const baseline = {
        java_heap_baseline_mb: 50,
        native_heap_baseline_mb: 30,
        gc_count_baseline: 5,
        gc_duration_baseline_ms: 100,
        unreachable_objects_baseline: 100,
      };

      const violations = (audit as any).validateMetrics(metrics, thresholds, baseline);

      // Should detect anomalies even though absolute thresholds not exceeded
      const javaAnomalyViolation = violations.find((v: any) => v.metric === "javaHeapAnomaly");
      expect(javaAnomalyViolation).toBeDefined();
      expect(javaAnomalyViolation.threshold).toBe(100); // baseline * 2

      const gcAnomalyViolation = violations.find((v: any) => v.metric === "gcCountAnomaly");
      expect(gcAnomalyViolation).toBeDefined();
      expect(gcAnomalyViolation.threshold).toBe(10); // baseline * 2
    });
  });

  describe("generateDiagnostics", function() {
    test("should generate diagnostics with top contributors", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "pre raw meminfo",
        },
        postSnapshot: {
          javaHeapMb: 150,
          nativeHeapMb: 100,
          totalPssMb: 300,
          timestamp: Date.now(),
          raw: "post raw meminfo",
        },
        javaHeapGrowthMb: 100,
        nativeHeapGrowthMb: 70,
        totalPssGrowthMb: 200,
        gcEvents: [
          { type: "FOR_ALLOC", freedKb: 1000, durationMs: 50, timestamp: Date.now() },
          { type: "EXPLICIT", freedKb: 2000, durationMs: 100, timestamp: Date.now() },
        ],
        gcCount: 2,
        gcTotalDurationMs: 150,
        unreachableObjects: {
          count: 500,
          sizeKb: 50,
          raw: "unreachable raw",
        },
      };

      const violations = [
        { metric: "javaHeapGrowth", threshold: 50, actual: 100, severity: "critical" as const, contributionWeight: 0.9 },
        { metric: "nativeHeapGrowth", threshold: 30, actual: 70, severity: "critical" as const, contributionWeight: 0.85 },
        { metric: "gcCount", threshold: 10, actual: 2, severity: "warning" as const, contributionWeight: 0.3 },
      ];

      const diagnostics = (audit as any).generateDiagnostics(metrics, violations);

      // Should include top contributors (weight > 0.5)
      expect(diagnostics).toContain("javaHeapGrowth");
      expect(diagnostics).toContain("nativeHeapGrowth");
      expect(diagnostics).not.toContain("gcCount"); // weight 0.3 < 0.5

      // Should include memory snapshots
      expect(diagnostics).toContain("Pre-action:");
      expect(diagnostics).toContain("Post-action:");
      expect(diagnostics).toContain("Growth:");
      expect(diagnostics).toContain("+100.00MB"); // Java heap growth
      expect(diagnostics).toContain("+70.00MB"); // Native heap growth

      // Should include GC details
      expect(diagnostics).toContain("Total GC events: 2");
      expect(diagnostics).toContain("FOR_ALLOC");
      expect(diagnostics).toContain("EXPLICIT");

      // Should include unreachable objects
      expect(diagnostics).toContain("Unreachable objects");
      expect(diagnostics).toContain("Count: 500");
    });

    test("should return no issues message when no violations", function() {
      const metrics: MemoryMetrics = {
        preSnapshot: {
          javaHeapMb: 50,
          nativeHeapMb: 30,
          totalPssMb: 100,
          timestamp: Date.now(),
          raw: "",
        },
        postSnapshot: {
          javaHeapMb: 55,
          nativeHeapMb: 32,
          totalPssMb: 105,
          timestamp: Date.now(),
          raw: "",
        },
        javaHeapGrowthMb: 5,
        nativeHeapGrowthMb: 2,
        totalPssGrowthMb: 5,
        gcEvents: [],
        gcCount: 1,
        gcTotalDurationMs: 50,
        unreachableObjects: {
          count: 10,
          sizeKb: 1,
          raw: "",
        },
      };

      const violations: any[] = [];

      const diagnostics = (audit as any).generateDiagnostics(metrics, violations);

      expect(diagnostics).toBe("No memory issues detected");
    });
  });
});
