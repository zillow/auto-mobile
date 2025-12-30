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
  createGlobalPerformanceTracker
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
});

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
