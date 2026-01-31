import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import {
  PerformanceTracker,
  DefaultPerformanceTracker,
  NoOpPerformanceTracker,
  createPerformanceTracker,
  TimingEntry,
  TimingData,
  setDebugPerfEnabled,
  isDebugPerfEnabled,
  createGlobalPerformanceTracker,
  processTimingData,
  setMaxPerfTimingSizeBytes,
  getMaxPerfTimingSizeBytes
} from "../../src/utils/PerformanceTracker";
import { FakeTimer } from "../fakes/FakeTimer";

describe("PerformanceTracker", function() {
  describe("PerformanceTracker (enabled)", function() {
    let tracker: PerformanceTracker;
    let fakeTimer: FakeTimer;

    beforeEach(function() {
      fakeTimer = new FakeTimer();
      tracker = new DefaultPerformanceTracker(fakeTimer);
    });

    test("should be enabled", function() {
      expect(tracker.isEnabled()).toBe(true);
    });

    test("should track a simple operation", async function() {
      const resultPromise = tracker.track("simpleOp", async () => {
        await fakeTimer.sleep(10);
        return "result";
      });
      fakeTimer.advanceTime(10);
      await resultPromise;

      const timings = tracker.getTimings() as TimingEntry[];
      expect(Array.isArray(timings)).toBe(true);
      expect(timings).toHaveLength(1);
      expect(timings[0].name).toBe("simpleOp");
      expect(timings[0].durationMs).toBe(10);
    });

    test("should return function result from track", async function() {
      const result = await tracker.track("returnTest", async () => {
        return "hello world";
      });

      expect(result).toBe("hello world");
    });

    test("should track serial operations as array", async function() {
      tracker.serial("serialBlock");

      await trackWithDelay(fakeTimer, tracker, "step1", 5);
      await trackWithDelay(fakeTimer, tracker, "step2", 5);
      await trackWithDelay(fakeTimer, tracker, "step3", 5);

      tracker.end();

      const timings = tracker.getTimings() as TimingEntry[];
      expect(Array.isArray(timings)).toBe(true);
      expect(timings).toHaveLength(1);

      const serialBlock = timings[0];
      expect(serialBlock.name).toBe("serialBlock");
      expect(Array.isArray(serialBlock.children)).toBe(true);

      const children = serialBlock.children as TimingEntry[];
      expect(children).toHaveLength(3);
      expect(children[0].name).toBe("step1");
      expect(children[1].name).toBe("step2");
      expect(children[2].name).toBe("step3");
    });

    test("should track parallel operations as object", async function() {
      tracker.parallel("parallelBlock");

      const opA = tracker.track("opA", async () => {
        await fakeTimer.sleep(5);
      });
      const opB = tracker.track("opB", async () => {
        await fakeTimer.sleep(5);
      });
      const opC = tracker.track("opC", async () => {
        await fakeTimer.sleep(5);
      });
      fakeTimer.advanceTime(5);
      await Promise.all([opA, opB, opC]);

      tracker.end();

      const timings = tracker.getTimings() as TimingEntry[];
      expect(Array.isArray(timings)).toBe(true);
      expect(timings).toHaveLength(1);

      const parallelBlock = timings[0];
      expect(parallelBlock.name).toBe("parallelBlock");
      expect(typeof parallelBlock.children).toBe("object");
      expect(Array.isArray(parallelBlock.children)).toBe(false);

      const children = parallelBlock.children as Record<string, TimingEntry>;
      expect(children).toHaveProperty("opA");
      expect(children).toHaveProperty("opB");
      expect(children).toHaveProperty("opC");
    });

    test("should handle nested serial and parallel blocks", async function() {
      tracker.serial("outer");

      await trackWithDelay(fakeTimer, tracker, "first", 2);

      tracker.parallel("parallel");
      const parallelA = tracker.track("pA", async () => {
        await fakeTimer.sleep(5);
      });
      const parallelB = tracker.track("pB", async () => {
        await fakeTimer.sleep(5);
      });
      fakeTimer.advanceTime(5);
      await Promise.all([parallelA, parallelB]);
      tracker.end();

      await trackWithDelay(fakeTimer, tracker, "last", 2);

      tracker.end();

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).toHaveLength(1);

      const outer = timings[0];
      expect(outer.name).toBe("outer");
      const outerChildren = outer.children as TimingEntry[];
      expect(Array.isArray(outerChildren)).toBe(true);
      expect(outerChildren).toHaveLength(3);

      // First is serial entry
      expect(outerChildren[0].name).toBe("first");

      // Second is parallel block
      expect(outerChildren[1].name).toBe("parallel");
      expect(Array.isArray(outerChildren[1].children)).toBe(false);

      // Third is serial entry
      expect(outerChildren[2].name).toBe("last");
    });

    test("should auto-close unclosed blocks on getTimings", async function() {
      tracker.serial("unclosed");
      await trackWithDelay(fakeTimer, tracker, "op", 1);
      // Don't call end()

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).toHaveLength(1);
      expect(timings[0].name).toBe("unclosed");
    });
  });

  describe("NoOpPerformanceTracker", function() {
    let tracker: PerformanceTracker;

    beforeEach(function() {
      tracker = new NoOpPerformanceTracker();
    });

    test("should be disabled", function() {
      expect(tracker.isEnabled()).toBe(false);
    });

    test("should return null from getTimings", function() {
      expect(tracker.getTimings()).toBeNull();
    });

    test("should execute function without tracking", async function() {
      const result = await tracker.track("ignored", async () => "value");
      expect(result).toBe("value");
    });

    test("should return self from all methods for chaining", function() {
      expect(tracker.serial("x")).toBe(tracker);
      expect(tracker.parallel("x")).toBe(tracker);
      expect(tracker.end()).toBe(tracker);
    });
  });

  describe("createPerformanceTracker factory", function() {
    test("should create PerformanceTracker when enabled is true", function() {
      const tracker = createPerformanceTracker(true);
      expect(tracker).toBeInstanceOf(DefaultPerformanceTracker);
      expect(tracker.isEnabled()).toBe(true);
    });

    test("should create NoOpPerformanceTracker when enabled is false", function() {
      const tracker = createPerformanceTracker(false);
      expect(tracker).toBeInstanceOf(NoOpPerformanceTracker);
      expect(tracker.isEnabled()).toBe(false);
    });
  });

  describe("Global debug-perf state", function() {
    beforeEach(function() {
      // Reset state before each test
      setDebugPerfEnabled(false);
    });

    test("should default to false", function() {
      expect(isDebugPerfEnabled()).toBe(false);
    });

    test("should be settable", function() {
      setDebugPerfEnabled(true);
      expect(isDebugPerfEnabled()).toBe(true);

      setDebugPerfEnabled(false);
      expect(isDebugPerfEnabled()).toBe(false);
    });

    test("should create appropriate tracker based on global state", function() {
      setDebugPerfEnabled(false);
      let tracker = createGlobalPerformanceTracker();
      expect(tracker.isEnabled()).toBe(false);

      setDebugPerfEnabled(true);
      tracker = createGlobalPerformanceTracker();
      expect(tracker.isEnabled()).toBe(true);
    });
  });

  describe("PerformanceTracker interface", function() {
    test("should be implementable as a fake for testing", async function() {
      // Example fake implementation for testing
      class FakePerformanceTracker implements PerformanceTracker {
        public calls: { method: string; name: string }[] = [];

        serial(name: string): PerformanceTracker {
          this.calls.push({ method: "serial", name });
          return this;
        }

        parallel(name: string): PerformanceTracker {
          this.calls.push({ method: "parallel", name });
          return this;
        }

        async track<T>(name: string, fn: () => Promise<T>): Promise<T> {
          this.calls.push({ method: "track", name });
          return fn();
        }

        end(): PerformanceTracker {
          this.calls.push({ method: "end", name: "" });
          return this;
        }

        getTimings(): TimingData | null {
          return [];
        }

        isEnabled(): boolean {
          return true;
        }
      }

      const fake = new FakePerformanceTracker();

      fake.serial("test");
      await fake.track("op", async () => "result");
      fake.end();

      expect(fake.calls).toEqual([
        { method: "serial", name: "test" },
        { method: "track", name: "op" },
        { method: "end", name: "" }
      ]);
    });
  });

  describe("processTimingData", function() {
    const originalLimit = getMaxPerfTimingSizeBytes();

    beforeEach(function() {
      // Reset to default for tests
      setMaxPerfTimingSizeBytes(50 * 1024); // 50KB
    });

    afterEach(function() {
      // Restore original limit
      setMaxPerfTimingSizeBytes(originalLimit);
    });

    test("should return null for null input", function() {
      const result = processTimingData(null);
      expect(result).toBeNull();
    });

    test("should filter out 0ms timings from array", function() {
      const timings: TimingEntry[] = [
        { name: "op1", durationMs: 10 },
        { name: "op2", durationMs: 0 },
        { name: "op3", durationMs: 5 }
      ];

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      expect(Array.isArray(result!.data)).toBe(true);
      expect((result!.data as TimingEntry[]).length).toBe(2);
      expect((result!.data as TimingEntry[])[0].name).toBe("op1");
      expect((result!.data as TimingEntry[])[1].name).toBe("op3");
      expect(result!.truncated).toBeUndefined();
    });

    test("should filter out 0ms timings from object", function() {
      const timings: Record<string, TimingEntry> = {
        op1: { name: "op1", durationMs: 10 },
        op2: { name: "op2", durationMs: 0 },
        op3: { name: "op3", durationMs: 5 }
      };

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      expect(typeof result!.data).toBe("object");
      expect(Array.isArray(result!.data)).toBe(false);
      expect(Object.keys(result!.data)).toEqual(["op1", "op3"]);
      expect(result!.truncated).toBeUndefined();
    });

    test("should filter out 0ms timings recursively", function() {
      const timings: TimingEntry[] = [
        {
          name: "parent",
          durationMs: 20,
          children: [
            { name: "child1", durationMs: 10 },
            { name: "child2", durationMs: 0 },
            { name: "child3", durationMs: 5 }
          ]
        }
      ];

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      const data = result!.data as TimingEntry[];
      expect(Array.isArray(data[0].children)).toBe(true);
      const children = data[0].children as TimingEntry[];
      expect(children.length).toBe(2);
      expect(children[0].name).toBe("child1");
      expect(children[1].name).toBe("child3");
    });

    test("should return null when all timings are 0ms", function() {
      const timings: TimingEntry[] = [
        { name: "op1", durationMs: 0 },
        { name: "op2", durationMs: 0 }
      ];

      const result = processTimingData(timings);
      expect(result).toBeNull();
    });

    test("should not truncate when under size limit", function() {
      const timings: TimingEntry[] = [
        { name: "small", durationMs: 10 }
      ];

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      expect(result!.truncated).toBeUndefined();
    });

    test("should truncate by removing smallest timings when over size limit", function() {
      // Set a very small limit to force truncation
      setMaxPerfTimingSizeBytes(200);

      // Create timing data that will exceed 200 bytes
      const timings: TimingEntry[] = [
        { name: "large1", durationMs: 100 },
        { name: "large2", durationMs: 90 },
        { name: "medium", durationMs: 50 },
        { name: "small1", durationMs: 10 },
        { name: "small2", durationMs: 5 },
        { name: "small3", durationMs: 1 }
      ];

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      expect(result!.truncated).toBe(true);

      // Should have removed some entries
      const data = result!.data as TimingEntry[];
      expect(data.length).toBeLessThan(timings.length);

      // Check that remaining entries are the largest ones
      const remainingDurations = data.map(e => e.durationMs);
      expect(Math.max(...remainingDurations)).toBeGreaterThan(50);
    });

    test("should set truncated flag when truncation occurs", function() {
      setMaxPerfTimingSizeBytes(100);

      const timings: TimingEntry[] = Array.from({ length: 20 }, (_, i) => ({
        name: `operation-${i}`,
        durationMs: i + 1
      }));

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      expect(result!.truncated).toBe(true);
    });

    test("should respect configured size limit", function() {
      const customLimit = 500;
      setMaxPerfTimingSizeBytes(customLimit);

      expect(getMaxPerfTimingSizeBytes()).toBe(customLimit);

      // Create large timing data
      const timings: TimingEntry[] = Array.from({ length: 50 }, (_, i) => ({
        name: `operation-with-a-long-name-${i}`,
        durationMs: i + 1
      }));

      const result = processTimingData(timings);
      expect(result).not.toBeNull();

      // Verify the result is under the limit
      const resultSize = JSON.stringify(result!.data).length;
      expect(resultSize).toBeLessThanOrEqual(customLimit);
    });

    test("should remove parent entries that have no children after filtering", function() {
      const timings: TimingEntry[] = [
        {
          name: "parent",
          durationMs: 10,
          children: [
            { name: "child", durationMs: 0 }
          ]
        }
      ];

      const result = processTimingData(timings);
      // Parent should be removed because all children were 0ms
      expect(result).toBeNull();
    });

    test("should keep parent entries that still have children after filtering", function() {
      const timings: TimingEntry[] = [
        {
          name: "parent",
          durationMs: 15,
          children: [
            { name: "child1", durationMs: 0 },
            { name: "child2", durationMs: 5 }
          ]
        }
      ];

      const result = processTimingData(timings);
      expect(result).not.toBeNull();
      const data = result!.data as TimingEntry[];
      expect(data.length).toBe(1);
      expect(data[0].name).toBe("parent");
      expect(Array.isArray(data[0].children)).toBe(true);
      expect((data[0].children as TimingEntry[]).length).toBe(1);
    });
  });
});

async function trackWithDelay(
  timer: FakeTimer,
  tracker: PerformanceTracker,
  name: string,
  ms: number
): Promise<void> {
  const promise = tracker.track(name, async () => {
    await timer.sleep(ms);
  });
  timer.advanceTime(ms);
  await promise;
}
