import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
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

describe("PerformanceTracker", function() {
  describe("PerformanceTracker (enabled)", function() {
    let tracker: PerformanceTracker;

    beforeEach(function() {
      tracker = new DefaultPerformanceTracker();
    });

    it("should be enabled", function() {
      expect(tracker.isEnabled()).to.be.true;
    });

    it("should track a simple operation", async function() {
      await tracker.track("simpleOp", async () => {
        await sleep(10);
        return "result";
      });

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).to.be.an("array");
      expect(timings).to.have.length(1);
      expect(timings[0].name).to.equal("simpleOp");
      expect(timings[0].durationMs).to.be.at.least(9);
    });

    it("should return function result from track", async function() {
      const result = await tracker.track("returnTest", async () => {
        return "hello world";
      });

      expect(result).to.equal("hello world");
    });

    it("should track serial operations as array", async function() {
      tracker.serial("serialBlock");

      await tracker.track("step1", async () => sleep(5));
      await tracker.track("step2", async () => sleep(5));
      await tracker.track("step3", async () => sleep(5));

      tracker.end();

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).to.be.an("array");
      expect(timings).to.have.length(1);

      const serialBlock = timings[0];
      expect(serialBlock.name).to.equal("serialBlock");
      expect(serialBlock.children).to.be.an("array");

      const children = serialBlock.children as TimingEntry[];
      expect(children).to.have.length(3);
      expect(children[0].name).to.equal("step1");
      expect(children[1].name).to.equal("step2");
      expect(children[2].name).to.equal("step3");
    });

    it("should track parallel operations as object", async function() {
      tracker.parallel("parallelBlock");

      await Promise.all([
        tracker.track("opA", async () => sleep(5)),
        tracker.track("opB", async () => sleep(5)),
        tracker.track("opC", async () => sleep(5)),
      ]);

      tracker.end();

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).to.be.an("array");
      expect(timings).to.have.length(1);

      const parallelBlock = timings[0];
      expect(parallelBlock.name).to.equal("parallelBlock");
      expect(parallelBlock.children).to.be.an("object");
      expect(parallelBlock.children).to.not.be.an("array");

      const children = parallelBlock.children as Record<string, TimingEntry>;
      expect(children).to.have.property("opA");
      expect(children).to.have.property("opB");
      expect(children).to.have.property("opC");
    });

    it("should handle nested serial and parallel blocks", async function() {
      tracker.serial("outer");

      await tracker.track("first", async () => sleep(2));

      tracker.parallel("parallel");
      await Promise.all([
        tracker.track("pA", async () => sleep(5)),
        tracker.track("pB", async () => sleep(5)),
      ]);
      tracker.end();

      await tracker.track("last", async () => sleep(2));

      tracker.end();

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).to.have.length(1);

      const outer = timings[0];
      expect(outer.name).to.equal("outer");
      const outerChildren = outer.children as TimingEntry[];
      expect(outerChildren).to.be.an("array");
      expect(outerChildren).to.have.length(3);

      // First is serial entry
      expect(outerChildren[0].name).to.equal("first");

      // Second is parallel block
      expect(outerChildren[1].name).to.equal("parallel");
      expect(outerChildren[1].children).to.not.be.an("array");

      // Third is serial entry
      expect(outerChildren[2].name).to.equal("last");
    });

    it("should auto-close unclosed blocks on getTimings", async function() {
      tracker.serial("unclosed");
      await tracker.track("op", async () => sleep(1));
      // Don't call end()

      const timings = tracker.getTimings() as TimingEntry[];
      expect(timings).to.have.length(1);
      expect(timings[0].name).to.equal("unclosed");
    });
  });

  describe("NoOpPerformanceTracker", function() {
    let tracker: PerformanceTracker;

    beforeEach(function() {
      tracker = new NoOpPerformanceTracker();
    });

    it("should be disabled", function() {
      expect(tracker.isEnabled()).to.be.false;
    });

    it("should return null from getTimings", function() {
      expect(tracker.getTimings()).to.be.null;
    });

    it("should execute function without tracking", async function() {
      const result = await tracker.track("ignored", async () => "value");
      expect(result).to.equal("value");
    });

    it("should return self from all methods for chaining", function() {
      expect(tracker.serial("x")).to.equal(tracker);
      expect(tracker.parallel("x")).to.equal(tracker);
      expect(tracker.end()).to.equal(tracker);
    });
  });

  describe("createPerformanceTracker factory", function() {
    it("should create PerformanceTracker when enabled is true", function() {
      const tracker = createPerformanceTracker(true);
      expect(tracker).to.be.instanceOf(DefaultPerformanceTracker);
      expect(tracker.isEnabled()).to.be.true;
    });

    it("should create NoOpPerformanceTracker when enabled is false", function() {
      const tracker = createPerformanceTracker(false);
      expect(tracker).to.be.instanceOf(NoOpPerformanceTracker);
      expect(tracker.isEnabled()).to.be.false;
    });
  });

  describe("Global debug-perf state", function() {
    beforeEach(function() {
      // Reset state before each test
      setDebugPerfEnabled(false);
    });

    it("should default to false", function() {
      expect(isDebugPerfEnabled()).to.be.false;
    });

    it("should be settable", function() {
      setDebugPerfEnabled(true);
      expect(isDebugPerfEnabled()).to.be.true;

      setDebugPerfEnabled(false);
      expect(isDebugPerfEnabled()).to.be.false;
    });

    it("should create appropriate tracker based on global state", function() {
      setDebugPerfEnabled(false);
      let tracker = createGlobalPerformanceTracker();
      expect(tracker.isEnabled()).to.be.false;

      setDebugPerfEnabled(true);
      tracker = createGlobalPerformanceTracker();
      expect(tracker.isEnabled()).to.be.true;
    });
  });

  describe("PerformanceTracker interface", function() {
    it("should be implementable as a fake for testing", async function() {
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

      expect(fake.calls).to.deep.equal([
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

    it("should return null for null input", function() {
      const result = processTimingData(null);
      expect(result).to.be.null;
    });

    it("should filter out 0ms timings from array", function() {
      const timings: TimingEntry[] = [
        { name: "op1", durationMs: 10 },
        { name: "op2", durationMs: 0 },
        { name: "op3", durationMs: 5 }
      ];

      const result = processTimingData(timings);
      expect(result).to.not.be.null;
      expect(result!.data).to.be.an("array");
      expect((result!.data as TimingEntry[]).length).to.equal(2);
      expect((result!.data as TimingEntry[])[0].name).to.equal("op1");
      expect((result!.data as TimingEntry[])[1].name).to.equal("op3");
      expect(result!.truncated).to.be.undefined;
    });

    it("should filter out 0ms timings from object", function() {
      const timings: Record<string, TimingEntry> = {
        op1: { name: "op1", durationMs: 10 },
        op2: { name: "op2", durationMs: 0 },
        op3: { name: "op3", durationMs: 5 }
      };

      const result = processTimingData(timings);
      expect(result).to.not.be.null;
      expect(result!.data).to.be.an("object");
      expect(result!.data).to.not.be.an("array");
      expect(Object.keys(result!.data)).to.deep.equal(["op1", "op3"]);
      expect(result!.truncated).to.be.undefined;
    });

    it("should filter out 0ms timings recursively", function() {
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
      expect(result).to.not.be.null;
      const data = result!.data as TimingEntry[];
      expect(data[0].children).to.be.an("array");
      const children = data[0].children as TimingEntry[];
      expect(children.length).to.equal(2);
      expect(children[0].name).to.equal("child1");
      expect(children[1].name).to.equal("child3");
    });

    it("should return null when all timings are 0ms", function() {
      const timings: TimingEntry[] = [
        { name: "op1", durationMs: 0 },
        { name: "op2", durationMs: 0 }
      ];

      const result = processTimingData(timings);
      expect(result).to.be.null;
    });

    it("should not truncate when under size limit", function() {
      const timings: TimingEntry[] = [
        { name: "small", durationMs: 10 }
      ];

      const result = processTimingData(timings);
      expect(result).to.not.be.null;
      expect(result!.truncated).to.be.undefined;
    });

    it("should truncate by removing smallest timings when over size limit", function() {
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
      expect(result).to.not.be.null;
      expect(result!.truncated).to.equal(true);

      // Should have removed some entries
      const data = result!.data as TimingEntry[];
      expect(data.length).to.be.lessThan(timings.length);

      // Check that remaining entries are the largest ones
      const remainingDurations = data.map(e => e.durationMs);
      expect(Math.max(...remainingDurations)).to.be.greaterThan(50);
    });

    it("should set truncated flag when truncation occurs", function() {
      setMaxPerfTimingSizeBytes(100);

      const timings: TimingEntry[] = Array.from({ length: 20 }, (_, i) => ({
        name: `operation-${i}`,
        durationMs: i + 1
      }));

      const result = processTimingData(timings);
      expect(result).to.not.be.null;
      expect(result!.truncated).to.equal(true);
    });

    it("should respect configured size limit", function() {
      const customLimit = 500;
      setMaxPerfTimingSizeBytes(customLimit);

      expect(getMaxPerfTimingSizeBytes()).to.equal(customLimit);

      // Create large timing data
      const timings: TimingEntry[] = Array.from({ length: 50 }, (_, i) => ({
        name: `operation-with-a-long-name-${i}`,
        durationMs: i + 1
      }));

      const result = processTimingData(timings);
      expect(result).to.not.be.null;

      // Verify the result is under the limit
      const resultSize = JSON.stringify(result!.data).length;
      expect(resultSize).to.be.at.most(customLimit);
    });

    it("should remove parent entries that have no children after filtering", function() {
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
      expect(result).to.be.null;
    });

    it("should keep parent entries that still have children after filtering", function() {
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
      expect(result).to.not.be.null;
      const data = result!.data as TimingEntry[];
      expect(data.length).to.equal(1);
      expect(data[0].name).to.equal("parent");
      expect(data[0].children).to.be.an("array");
      expect((data[0].children as TimingEntry[]).length).to.equal(1);
    });
  });
});

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
