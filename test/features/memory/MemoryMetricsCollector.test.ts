import { beforeEach, describe, expect, test } from "bun:test";
import { MemoryMetricsCollector } from "../../../src/features/memory/MemoryMetricsCollector";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";

describe("MemoryMetricsCollector - Unit Tests", function() {
  let collector: MemoryMetricsCollector;

  beforeEach(function() {
    // Use FakeAdbExecutor to avoid starting real adb daemon
    const fakeAdb = new FakeAdbExecutor();
    collector = new MemoryMetricsCollector({ deviceId: "test-device", name: "test", platform: "android" }, fakeAdb as any);
  });

  describe("parseMeminfo", function() {
    test("should parse Java heap from meminfo output", function() {
      const output = `
        Applications Memory Usage (in Kilobytes):
        Uptime: 12345678 Realtime: 23456789

        ** MEMINFO in pid 1234 [com.example.app] **
                   Pss  Private  Private  SwapPss     Heap     Heap     Heap
                 Total    Dirty    Clean    Dirty     Size    Alloc     Free
                ------   ------   ------   ------   ------   ------   ------
          Java Heap:    10240        0        0        0    20480    15360     5120
          Native Heap:   5120        0        0        0
          TOTAL:        50000
      `;

      const result = (collector as any).parseMeminfo(output);

      expect(result.javaHeapMb).toBe(10); // 10240 KB = 10 MB
      expect(result.nativeHeapMb).toBe(5); // 5120 KB = 5 MB
      expect(result.totalPssMb).toBe(48.828125); // 50000 KB ≈ 48.83 MB
    });

    test("should handle missing Java heap gracefully", function() {
      const output = `
        Native Heap:   5120
        TOTAL:        50000
      `;

      const result = (collector as any).parseMeminfo(output);

      expect(result.javaHeapMb).toBe(0);
      expect(result.nativeHeapMb).toBe(5);
      expect(result.totalPssMb).toBe(48.828125);
    });

    test("should handle missing Native heap gracefully", function() {
      const output = `
        Java Heap:    10240
        TOTAL:        50000
      `;

      const result = (collector as any).parseMeminfo(output);

      expect(result.javaHeapMb).toBe(10);
      expect(result.nativeHeapMb).toBe(0);
      expect(result.totalPssMb).toBe(48.828125);
    });

    test("should handle missing TOTAL gracefully", function() {
      const output = `
        Java Heap:    10240
        Native Heap:   5120
      `;

      const result = (collector as any).parseMeminfo(output);

      expect(result.javaHeapMb).toBe(10);
      expect(result.nativeHeapMb).toBe(5);
      expect(result.totalPssMb).toBe(0);
    });

    test("should handle alternative TOTAL PSS format", function() {
      const output = `
        Java Heap:    10240
        Native Heap:   5120
        TOTAL PSS:    50000
      `;

      const result = (collector as any).parseMeminfo(output);

      expect(result.totalPssMb).toBe(48.828125);
    });
  });

  describe("parseGCEvents", function() {
    test("should parse GC events from logcat output", function() {
      const output = `
        I/dalvikvm: GC_FOR_ALLOC freed 1234K, 50% free 5678K/11356K, paused 123ms
        I/dalvikvm: GC_EXPLICIT freed 3456K, 40% free 7890K/13579K, paused 345ms
      `;

      const result = (collector as any).parseGCEvents(output, 0, Date.now());

      expect(result.length).toBe(2);
      expect(result[0].type).toBe("FOR_ALLOC");
      expect(result[0].freedKb).toBe(1234);
      expect(result[0].durationMs).toBe(123);
      expect(result[1].type).toBe("EXPLICIT");
      expect(result[1].freedKb).toBe(3456);
      expect(result[1].durationMs).toBe(345);
    });

    test("should handle empty logcat output", function() {
      const output = "";

      const result = (collector as any).parseGCEvents(output, 0, Date.now());

      expect(result.length).toBe(0);
    });

    test("should handle logcat output with no GC events", function() {
      const output = `
        I/some-tag: Some other log message
        D/another-tag: Another log message
      `;

      const result = (collector as any).parseGCEvents(output, 0, Date.now());

      expect(result.length).toBe(0);
    });
  });

  describe("parseUnreachableObjects", function() {
    test("should parse unreachable objects from dumpsys output", function() {
      const output = `
        Unreachable memory: 12345 bytes in 45 unreachable objects
      `;

      const result = (collector as any).parseUnreachableObjects(output);

      expect(result.count).toBe(45);
      expect(result.sizeKb).toBeCloseTo(12.06, 2); // 12345 bytes ≈ 12.06 KB
      expect(result.raw).toBe(output);
    });

    test("should handle missing unreachable pattern", function() {
      const output = `
        Some other text without the specific pattern
      `;

      const result = (collector as any).parseUnreachableObjects(output);

      expect(result.count).toBe(0); // Fallback counting
      expect(result.sizeKb).toBe(0);
    });

    test("should count unreachable occurrences as fallback", function() {
      const output = `
        Found unreachable object A
        Found unreachable object B
        Found unreachable object C
      `;

      const result = (collector as any).parseUnreachableObjects(output);

      expect(result.count).toBe(3); // Counts occurrences of "unreachable"
    });
  });
});
