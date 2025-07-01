import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { Idle } from "../../../src/features/observe/Idle";

describe("Idle - Unit Tests", function() {
  let idle: Idle;

  beforeEach(function() {
    // Create instance with mock adb to avoid real ADB calls
    idle = new Idle();
  });

  describe("getTouchStatus", function() {
    const startTime = 1000;
    const hardLimitMs = 10000;

    it("should return idle when touch events have been idle long enough", function() {
      const lastEventTime = 2000;
      const timeoutMs = 500;
      const currentTime = 3000; // 1000ms since last event

      // Mock Date.now to return predictable time
      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).to.be.true;
      expect(result.shouldContinue).to.be.false;
      expect(result.currentElapsed).to.equal(2000); // currentTime - startTime
      expect(result.idleTime).to.equal(1000); // currentTime - lastEventTime

      // Restore original Date.now
      Date.now = originalDateNow;
    });

    it("should return not idle when touch events are recent", function() {
      const lastEventTime = 2800;
      const timeoutMs = 500;
      const currentTime = 3000; // 200ms since last event (< timeoutMs)

      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).to.be.false;
      expect(result.shouldContinue).to.be.true;
      expect(result.currentElapsed).to.equal(2000);
      expect(result.idleTime).to.equal(200);

      Date.now = originalDateNow;
    });

    it("should return shouldContinue false when hard limit is reached", function() {
      const lastEventTime = 2800;
      const timeoutMs = 500;
      const currentTime = 12000; // Exceeds hard limit

      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).to.be.true; // idleTime (9200ms) > timeoutMs (500ms)
      expect(result.shouldContinue).to.be.false; // currentElapsed (11000ms) > hardLimitMs (10000ms)
      expect(result.currentElapsed).to.equal(11000);
      expect(result.idleTime).to.equal(9200);

      Date.now = originalDateNow;
    });

    it("should return shouldContinue false when hard limit is reached and not idle", function() {
      const lastEventTime = 11500; // Very recent event
      const timeoutMs = 5000; // Long timeout so it won't be idle
      const currentTime = 12000; // Exceeds hard limit

      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).to.be.false; // idleTime (500ms) < timeoutMs (5000ms)
      expect(result.shouldContinue).to.be.false; // !false && false = false (hard limit exceeded)
      expect(result.currentElapsed).to.equal(11000);
      expect(result.idleTime).to.equal(500);

      Date.now = originalDateNow;
    });
  });

  describe("parseMetrics", function() {
    it("should parse all metrics from valid gfxinfo output", function() {
      const stdout = `
        50th percentile: 8.5ms
        90th percentile: 12.3ms
        95th percentile: 15.7ms
        99th percentile: 22.1ms
        Number Missed Vsync: 5
        Number Slow UI thread: 3
        Number Frame deadline missed: 2
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).to.equal(8.5);
      expect(result.percentile90th).to.equal(12.3);
      expect(result.percentile95th).to.equal(15.7);
      expect(result.percentile99th).to.equal(22.1);
      expect(result.missedVsync).to.equal(5);
      expect(result.slowUiThread).to.equal(3);
      expect(result.frameDeadlineMissed).to.equal(2);
    });

    it("should handle missing metrics gracefully", function() {
      const stdout = `
        50th percentile: 8.5ms
        Number Missed Vsync: 5
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).to.equal(8.5);
      expect(result.percentile90th).to.be.null;
      expect(result.percentile95th).to.be.null;
      expect(result.percentile99th).to.be.null;
      expect(result.missedVsync).to.equal(5);
      expect(result.slowUiThread).to.be.null;
      expect(result.frameDeadlineMissed).to.be.null;
    });

    it("should handle integer percentiles", function() {
      const stdout = `
        50th percentile: 8ms
        90th percentile: 12ms
        95th percentile: 15ms
        99th percentile: 22ms
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).to.equal(8);
      expect(result.percentile90th).to.equal(12);
      expect(result.percentile95th).to.equal(15);
      expect(result.percentile99th).to.equal(22);
    });

    it("should return null for invalid numeric values", function() {
      const stdout = `
        50th percentile: invalidms
        Number Missed Vsync: notanumber
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).to.be.null;
      expect(result.missedVsync).to.be.null;
    });
  });

  describe("calculateDeltas", function() {
    it("should calculate correct deltas when both current and previous values exist", function() {
      const current = {
        missedVsync: 10,
        slowUiThread: 5,
        frameDeadlineMissed: 3
      };
      const previous = {
        missedVsync: 7,
        slowUiThread: 2,
        frameDeadlineMissed: 1
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).to.equal(3);
      expect(result.slowUiThreadDelta).to.equal(3);
      expect(result.frameDeadlineMissedDelta).to.equal(2);
    });

    it("should return zero deltas when previous values are null", function() {
      const current = {
        missedVsync: 10,
        slowUiThread: 5,
        frameDeadlineMissed: 3
      };
      const previous = {
        missedVsync: null,
        slowUiThread: null,
        frameDeadlineMissed: null
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).to.equal(0);
      expect(result.slowUiThreadDelta).to.equal(0);
      expect(result.frameDeadlineMissedDelta).to.equal(0);
    });

    it("should return zero deltas when current values are null", function() {
      const current = {
        missedVsync: null,
        slowUiThread: null,
        frameDeadlineMissed: null
      };
      const previous = {
        missedVsync: 7,
        slowUiThread: 2,
        frameDeadlineMissed: 1
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).to.equal(0);
      expect(result.slowUiThreadDelta).to.equal(0);
      expect(result.frameDeadlineMissedDelta).to.equal(0);
    });

    it("should handle mixed null and valid values", function() {
      const current = {
        missedVsync: 10,
        slowUiThread: null,
        frameDeadlineMissed: 3
      };
      const previous = {
        missedVsync: 7,
        slowUiThread: 2,
        frameDeadlineMissed: null
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).to.equal(3);
      expect(result.slowUiThreadDelta).to.equal(0);
      expect(result.frameDeadlineMissedDelta).to.equal(0);
    });
  });

  describe("checkStabilityCriteria", function() {
    it("should return true when all criteria are met", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 80,
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.true;
    });

    it("should return false when deltas are non-zero", function() {
      const deltas = {
        missedVsyncDelta: 1,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 80,
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.false;
    });

    it("should return false when 50th percentile exceeds threshold", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: 250, // > 200
        percentile90th: 80,
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.false;
    });

    it("should return false when 90th percentile exceeds threshold", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 250, // > 200
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.false;
    });

    it("should return false when 95th percentile exceeds threshold", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 80,
        percentile95th: 450 // > 400
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.false;
    });

    it("should handle null percentiles as zero", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: null,
        percentile90th: null,
        percentile95th: null
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.true; // null values become 0, which passes thresholds
    });

    it("should handle fractional percentiles by flooring them", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0
      };
      const percentiles = {
        percentile50th: 99.9, // floors to 99 (< 100)
        percentile90th: 99.9, // floors to 99 (< 100)
        percentile95th: 199.9 // floors to 199 (< 200)
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles);

      expect(result).to.be.true;
    });
  });

  describe("extractMetric", function() {
    it("should extract valid numeric value", function() {
      const output = "50th percentile: 8.5ms";
      const regex = /50th percentile:\s+(\d+(?:\.\d+)?)ms/;

      const result = idle.extractMetric(output, regex);

      expect(result).to.equal(8.5);
    });

    it("should extract integer value", function() {
      const output = "Number Missed Vsync: 5";
      const regex = /Number Missed Vsync:\s+(\d+)/;

      const result = idle.extractMetric(output, regex);

      expect(result).to.equal(5);
    });

    it("should return null when regex doesn't match", function() {
      const output = "Some other text";
      const regex = /50th percentile:\s+(\d+(?:\.\d+)?)ms/;

      const result = idle.extractMetric(output, regex);

      expect(result).to.be.null;
    });

    it("should return null when captured value is not a number", function() {
      const output = "50th percentile: invalidms";
      const regex = /50th percentile:\s+(\w+)ms/;

      const result = idle.extractMetric(output, regex);

      expect(result).to.be.null;
    });

    it("should return null when regex match exists but no capture group", function() {
      const output = "50th percentile: 8.5ms";
      const regex = /50th percentile:/; // No capture group

      const result = idle.extractMetric(output, regex);

      expect(result).to.be.null;
    });

    it("should handle zero values correctly", function() {
      const output = "Number Missed Vsync: 0";
      const regex = /Number Missed Vsync:\s+(\d+)/;

      const result = idle.extractMetric(output, regex);

      expect(result).to.equal(0);
    });
  });

  describe("isSystemLauncher", function() {
    it("should identify Android system UI packages", function() {
      const systemPackages = [
        "com.android.systemui",
        "com.android.launcher3",
        "com.google.android.apps.nexuslauncher",
        "com.samsung.android.app.launcher",
        "com.miui.home",
        "com.oneplus.launcher",
        "android",
        "com.android.settings"
      ];

      systemPackages.forEach(packageName => {
        // Access the private method via any type casting for testing
        const result = (idle as any).isSystemLauncher(packageName);
        expect(result, `Expected ${packageName} to be identified as system package`).to.be.true;
      });
    });

    it("should not identify regular app packages as system packages", function() {
      const regularPackages = [
        "com.example.myapp",
        "com.google.android.apps.photos",
        "com.spotify.music",
        "com.facebook.katana",
        "com.whatsapp",
        "org.mozilla.firefox"
      ];

      regularPackages.forEach(packageName => {
        const result = (idle as any).isSystemLauncher(packageName);
        expect(result, `Expected ${packageName} to NOT be identified as system package`).to.be.false;
      });
    });

    it("should handle partial package name matches for launchers", function() {
      const partialMatches = [
        "com.sec.android.app.launcher.homescreen", // Contains launcher
        "com.miui.home.settings", // Contains miui.home
        "com.android.launcher3.dev" // Contains launcher3
      ];

      partialMatches.forEach(packageName => {
        const result = (idle as any).isSystemLauncher(packageName);
        expect(result, `Expected ${packageName} to be identified as system package (partial match)`).to.be.true;
      });
    });

    it("should handle empty or invalid package names", function() {
      const invalidPackages = ["", null, undefined];

      invalidPackages.forEach(packageName => {
        const result = (idle as any).isSystemLauncher(packageName);
        expect(result, `Expected ${packageName} to NOT be identified as system package`).to.be.false;
      });
    });
  });
});
