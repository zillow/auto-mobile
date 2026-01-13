import { beforeEach, describe, expect, test } from "bun:test";
import { Idle } from "../../../src/features/observe/Idle";

describe("Idle - Unit Tests", function() {
  let idle: Idle;

  beforeEach(function() {
    // Create instance with mock adb to avoid real ADB calls
    idle = new Idle("test-device");
  });

  describe("getTouchStatus", function() {
    const startTime = 1000;
    const hardLimitMs = 10000;

    test("should return idle when touch events have been idle long enough", function() {
      const lastEventTime = 2000;
      const timeoutMs = 500;
      const currentTime = 3000; // 1000ms since last event

      // Mock Date.now to return predictable time
      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).toBe(true);
      expect(result.shouldContinue).toBe(false);
      expect(result.currentElapsed).toBe(2000); // currentTime - startTime
      expect(result.idleTime).toBe(1000); // currentTime - lastEventTime

      // Restore original Date.now
      Date.now = originalDateNow;
    });

    test("should return not idle when touch events are recent", function() {
      const lastEventTime = 2800;
      const timeoutMs = 500;
      const currentTime = 3000; // 200ms since last event (< timeoutMs)

      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).toBe(false);
      expect(result.shouldContinue).toBe(true);
      expect(result.currentElapsed).toBe(2000);
      expect(result.idleTime).toBe(200);

      Date.now = originalDateNow;
    });

    test("should return shouldContinue false when hard limit is reached", function() {
      const lastEventTime = 2800;
      const timeoutMs = 500;
      const currentTime = 12000; // Exceeds hard limit

      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).toBe(true); // idleTime (9200ms) > timeoutMs (500ms)
      expect(result.shouldContinue).toBe(false); // currentElapsed (11000ms) > hardLimitMs (10000ms)
      expect(result.currentElapsed).toBe(11000);
      expect(result.idleTime).toBe(9200);

      Date.now = originalDateNow;
    });

    test("should return shouldContinue false when hard limit is reached and not idle", function() {
      const lastEventTime = 11500; // Very recent event
      const timeoutMs = 5000; // Long timeout so it won't be idle
      const currentTime = 12000; // Exceeds hard limit

      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      const result = idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

      expect(result.isIdle).toBe(false); // idleTime (500ms) < timeoutMs (5000ms)
      expect(result.shouldContinue).toBe(false); // !false && false = false (hard limit exceeded)
      expect(result.currentElapsed).toBe(11000);
      expect(result.idleTime).toBe(500);

      Date.now = originalDateNow;
    });
  });

  describe("parseMetrics", function() {
    test("should parse all metrics from valid gfxinfo output", function() {
      const stdout = `
        50th percentile: 8.5ms
        90th percentile: 12.3ms
        95th percentile: 15.7ms
        99th percentile: 22.1ms
        Total frames rendered: 120
        Number Missed Vsync: 5
        Number Slow UI thread: 3
        Number Frame deadline missed: 2
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).toBe(8.5);
      expect(result.percentile90th).toBe(12.3);
      expect(result.percentile95th).toBe(15.7);
      expect(result.percentile99th).toBe(22.1);
      expect(result.totalFrames).toBe(120);
      expect(result.missedVsync).toBe(5);
      expect(result.slowUiThread).toBe(3);
      expect(result.frameDeadlineMissed).toBe(2);
    });

    test("should handle missing metrics gracefully", function() {
      const stdout = `
        50th percentile: 8.5ms
        Number Missed Vsync: 5
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).toBe(8.5);
      expect(result.percentile90th).toBeNull();
      expect(result.percentile95th).toBeNull();
      expect(result.percentile99th).toBeNull();
      expect(result.totalFrames).toBeNull();
      expect(result.missedVsync).toBe(5);
      expect(result.slowUiThread).toBeNull();
      expect(result.frameDeadlineMissed).toBeNull();
    });

    test("should handle integer percentiles", function() {
      const stdout = `
        50th percentile: 8ms
        90th percentile: 12ms
        95th percentile: 15ms
        99th percentile: 22ms
        Total frames rendered: 42
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).toBe(8);
      expect(result.percentile90th).toBe(12);
      expect(result.percentile95th).toBe(15);
      expect(result.percentile99th).toBe(22);
      expect(result.totalFrames).toBe(42);
    });

    test("should return null for invalid numeric values", function() {
      const stdout = `
        50th percentile: invalidms
        Total frames rendered: notanumber
        Number Missed Vsync: notanumber
      `;

      const result = idle.parseMetrics(stdout);

      expect(result.percentile50th).toBeNull();
      expect(result.totalFrames).toBeNull();
      expect(result.missedVsync).toBeNull();
    });
  });

  describe("calculateDeltas", function() {
    test("should calculate correct deltas when both current and previous values exist", function() {
      const current = {
        missedVsync: 10,
        slowUiThread: 5,
        frameDeadlineMissed: 3,
        totalFrames: 100
      };
      const previous = {
        missedVsync: 7,
        slowUiThread: 2,
        frameDeadlineMissed: 1,
        totalFrames: 90
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).toBe(3);
      expect(result.slowUiThreadDelta).toBe(3);
      expect(result.frameDeadlineMissedDelta).toBe(2);
      expect(result.totalFramesDelta).toBe(10);
    });

    test("should return zero deltas when previous values are null", function() {
      const current = {
        missedVsync: 10,
        slowUiThread: 5,
        frameDeadlineMissed: 3,
        totalFrames: 100
      };
      const previous = {
        missedVsync: null,
        slowUiThread: null,
        frameDeadlineMissed: null,
        totalFrames: null
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).toBe(0);
      expect(result.slowUiThreadDelta).toBe(0);
      expect(result.frameDeadlineMissedDelta).toBe(0);
      expect(result.totalFramesDelta).toBeNull();
    });

    test("should return zero deltas when current values are null", function() {
      const current = {
        missedVsync: null,
        slowUiThread: null,
        frameDeadlineMissed: null,
        totalFrames: null
      };
      const previous = {
        missedVsync: 7,
        slowUiThread: 2,
        frameDeadlineMissed: 1,
        totalFrames: 80
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).toBe(0);
      expect(result.slowUiThreadDelta).toBe(0);
      expect(result.frameDeadlineMissedDelta).toBe(0);
      expect(result.totalFramesDelta).toBeNull();
    });

    test("should handle mixed null and valid values", function() {
      const current = {
        missedVsync: 10,
        slowUiThread: null,
        frameDeadlineMissed: 3,
        totalFrames: 50
      };
      const previous = {
        missedVsync: 7,
        slowUiThread: 2,
        frameDeadlineMissed: null,
        totalFrames: null
      };

      const result = idle.calculateDeltas(current, previous);

      expect(result.missedVsyncDelta).toBe(3);
      expect(result.slowUiThreadDelta).toBe(0);
      expect(result.frameDeadlineMissedDelta).toBe(0);
      expect(result.totalFramesDelta).toBeNull();
    });
  });

  describe("checkStabilityCriteria", function() {
    test("should return true when all criteria are met", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 80,
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(true);
    });

    test("should return false when deltas are non-zero", function() {
      const deltas = {
        missedVsyncDelta: 1,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 80,
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(false);
    });

    test("should return false when 50th percentile exceeds threshold", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 250, // > 200
        percentile90th: 80,
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(false);
    });

    test("should return false when 90th percentile exceeds threshold", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 250, // > 200
        percentile95th: 150
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(false);
    });

    test("should return false when 95th percentile exceeds threshold", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 50,
        percentile90th: 80,
        percentile95th: 450 // > 400
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(false);
    });

    test("should handle null percentiles as zero", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: null,
        percentile90th: null,
        percentile95th: null
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(true); // null values become 0, which passes thresholds
    });

    test("should handle fractional percentiles by flooring them", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 99.9, // floors to 99 (< 100)
        percentile90th: 99.9, // floors to 99 (< 100)
        percentile95th: 199.9 // floors to 199 (< 200)
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(true);
    });

    test("should ignore percentiles when no new frames are rendered", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 0
      };
      const percentiles = {
        percentile50th: 550,
        percentile90th: 550,
        percentile95th: 550
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 10);

      expect(result).toBe(true);
    });

    test("should ignore percentiles when there are too few frames", function() {
      const deltas = {
        missedVsyncDelta: 0,
        slowUiThreadDelta: 0,
        frameDeadlineMissedDelta: 0,
        totalFramesDelta: 1
      };
      const percentiles = {
        percentile50th: 550,
        percentile90th: 550,
        percentile95th: 550
      };

      const result = idle.checkStabilityCriteria(deltas, percentiles, 2);

      expect(result).toBe(true);
    });
  });

  describe("extractMetric", function() {
    test("should extract valid numeric value", function() {
      const output = "50th percentile: 8.5ms";
      const regex = /50th percentile:\s+(\d+(?:\.\d+)?)ms/;

      const result = idle.extractMetric(output, regex);

      expect(result).toBe(8.5);
    });

    test("should extract integer value", function() {
      const output = "Number Missed Vsync: 5";
      const regex = /Number Missed Vsync:\s+(\d+)/;

      const result = idle.extractMetric(output, regex);

      expect(result).toBe(5);
    });

    test("should return null when regex doesn't match", function() {
      const output = "Some other text";
      const regex = /50th percentile:\s+(\d+(?:\.\d+)?)ms/;

      const result = idle.extractMetric(output, regex);

      expect(result).toBeNull();
    });

    test("should return null when captured value is not a number", function() {
      const output = "50th percentile: invalidms";
      const regex = /50th percentile:\s+(\w+)ms/;

      const result = idle.extractMetric(output, regex);

      expect(result).toBeNull();
    });

    test("should return null when regex match exists but no capture group", function() {
      const output = "50th percentile: 8.5ms";
      const regex = /50th percentile:/; // No capture group

      const result = idle.extractMetric(output, regex);

      expect(result).toBeNull();
    });

    test("should handle zero values correctly", function() {
      const output = "Number Missed Vsync: 0";
      const regex = /Number Missed Vsync:\s+(\d+)/;

      const result = idle.extractMetric(output, regex);

      expect(result).toBe(0);
    });
  });

  describe("isSystemLauncher", function() {
    test("should identify Android system UI packages", function() {
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
        expect(result, `Expected ${packageName} to be identified as system package`).toBe(true);
      });
    });

    test("should not identify regular app packages as system packages", function() {
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
        expect(result, `Expected ${packageName} to NOT be identified as system package`).toBe(false);
      });
    });

    test("should handle partial package name matches for launchers", function() {
      const partialMatches = [
        "com.sec.android.app.launcher.homescreen", // Contains launcher
        "com.miui.home.settings", // Contains miui.home
        "com.android.launcher3.dev" // Contains launcher3
      ];

      partialMatches.forEach(packageName => {
        const result = (idle as any).isSystemLauncher(packageName);
        expect(result, `Expected ${packageName} to be identified as system package (partial match)`).toBe(true);
      });
    });

    test("should handle empty or invalid package names", function() {
      const invalidPackages = ["", null, undefined];

      invalidPackages.forEach(packageName => {
        const result = (idle as any).isSystemLauncher(packageName);
        expect(result, `Expected ${packageName} to NOT be identified as system package`).toBe(false);
      });
    });
  });
});
