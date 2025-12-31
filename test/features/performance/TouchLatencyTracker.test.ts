import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { TouchLatencyTracker } from "../../../src/features/performance/TouchLatencyTracker";
import { BootedDevice, ScreenSize } from "../../../src/models";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { NoOpPerformanceTracker } from "../../../src/utils/PerformanceTracker";

describe("TouchLatencyTracker - Unit Tests", function() {
  let tracker: TouchLatencyTracker;
  let adb: AdbClient;
  let device: BootedDevice;
  let screenSize: ScreenSize;
  let perf: NoOpPerformanceTracker;

  beforeEach(function() {
    device = {
      deviceId: "test-device",
      platform: "android",
      state: "device"
    };

    screenSize = {
      width: 1080,
      height: 1920
    };

    perf = new NoOpPerformanceTracker();
  });

  describe("selectSafeTouchLocation", function() {
    it("should select a location in the top-right corner", function() {
      adb = new AdbClient(device, async () => ({ stdout: "", stderr: "" }));
      tracker = new TouchLatencyTracker(device, adb);

      // Access private method via type assertion for testing
      const location = (tracker as any).selectSafeTouchLocation(screenSize);

      // Should be at 95% width and 2% height (status bar area)
      expect(location.x).to.equal(Math.floor(1080 * 0.95)); // 1026
      expect(location.y).to.equal(Math.floor(1920 * 0.02)); // 38
    });

    it("should handle different screen sizes", function() {
      adb = new AdbClient(device, async () => ({ stdout: "", stderr: "" }));
      tracker = new TouchLatencyTracker(device, adb);

      const smallScreen: ScreenSize = { width: 720, height: 1280 };
      const location = (tracker as any).selectSafeTouchLocation(smallScreen);

      expect(location.x).to.equal(Math.floor(720 * 0.95)); // 684
      expect(location.y).to.equal(Math.floor(1280 * 0.02)); // 25
    });
  });

  describe("measureLatency", function() {
    it("should return successful result when frame activity is detected", async function() {
      // Set up fake ADB responses
      let callCount = 0;

      adb = new AdbClient(device, async (command: string) => {
        if (command.includes("dumpsys gfxinfo")) {
          if (command.includes("reset")) {
            return { stdout: "", stderr: "" };
          }

          // Return baseline stats first, then show increased jank on subsequent calls
          callCount++;
          if (callCount === 1) {
            // Baseline
            return {
              stdout: `
                50th percentile: 8.5ms
                90th percentile: 12.3ms
                95th percentile: 15.7ms
                99th percentile: 22.1ms
                Number Missed Vsync: 0
                Number Slow UI thread: 0
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          } else {
            // After touch - show frame activity
            return {
              stdout: `
                50th percentile: 10.2ms
                90th percentile: 15.8ms
                95th percentile: 18.3ms
                99th percentile: 25.7ms
                Number Missed Vsync: 1
                Number Slow UI thread: 0
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          }
        } else if (command.includes("input tap")) {
          return { stdout: "", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      });

      tracker = new TouchLatencyTracker(device, adb);

      const result = await tracker.measureLatency(
        "com.example.app",
        screenSize,
        { sampleCount: 1, maxWaitMs: 200 },
        perf
      );

      expect(result.success).to.be.true;
      expect(result.latencyMs).to.be.greaterThan(0);
      expect(result.sampleCount).to.equal(1);
      expect(result.touchCoordinates.x).to.be.greaterThan(0);
      expect(result.touchCoordinates.y).to.be.greaterThan(0);
    });

    it("should calculate median from multiple samples", async function() {
      let callCount = 0;

      adb = new AdbClient(device, async (command: string) => {
        if (command.includes("dumpsys gfxinfo")) {
          if (command.includes("reset")) {
            callCount = 0;
            return { stdout: "", stderr: "" };
          }

          callCount++;
          // Return baseline first, then activity on second call for each sample
          if (callCount % 2 === 1) {
            return {
              stdout: `
                Number Missed Vsync: 0
                Number Slow UI thread: 0
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          } else {
            return {
              stdout: `
                Number Missed Vsync: 1
                Number Slow UI thread: 0
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          }
        } else if (command.includes("input tap")) {
          return { stdout: "", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      });

      tracker = new TouchLatencyTracker(device, adb);

      const result = await tracker.measureLatency(
        "com.example.app",
        screenSize,
        { sampleCount: 3, maxWaitMs: 200 },
        perf
      );

      expect(result.success).to.be.true;
      expect(result.sampleCount).to.equal(3);
      expect(result.latencyMs).to.be.greaterThan(0);
    });

    it("should handle timeout when no frame activity detected", async function() {
      adb = new AdbClient(device, async (command: string) => {
        if (command.includes("dumpsys gfxinfo")) {
          if (command.includes("reset")) {
            return { stdout: "", stderr: "" };
          }

          // Always return same stats - no frame activity
          return {
            stdout: `
              Number Missed Vsync: 0
              Number Slow UI thread: 0
              Number Frame deadline missed: 0
            `,
            stderr: ""
          };
        } else if (command.includes("input tap")) {
          return { stdout: "", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      });

      tracker = new TouchLatencyTracker(device, adb);

      const result = await tracker.measureLatency(
        "com.example.app",
        screenSize,
        { sampleCount: 1, maxWaitMs: 50 }, // Short timeout for fast test
        perf
      );

      expect(result.success).to.be.false;
      expect(result.sampleCount).to.equal(0);
      expect(result.error).to.include("No successful measurements");
    });

    it("should detect frame activity via slowUiThread increase", async function() {
      let callCount = 0;

      adb = new AdbClient(device, async (command: string) => {
        if (command.includes("dumpsys gfxinfo")) {
          if (command.includes("reset")) {
            return { stdout: "", stderr: "" };
          }

          callCount++;
          if (callCount === 1) {
            return {
              stdout: `
                Number Missed Vsync: 0
                Number Slow UI thread: 0
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          } else {
            return {
              stdout: `
                Number Missed Vsync: 0
                Number Slow UI thread: 1
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          }
        } else if (command.includes("input tap")) {
          return { stdout: "", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      });

      tracker = new TouchLatencyTracker(device, adb);

      const result = await tracker.measureLatency(
        "com.example.app",
        screenSize,
        { sampleCount: 1, maxWaitMs: 200 },
        perf
      );

      expect(result.success).to.be.true;
      expect(result.latencyMs).to.be.greaterThan(0);
    });

    it("should detect frame activity via frameDeadlineMissed increase", async function() {
      let callCount = 0;

      adb = new AdbClient(device, async (command: string) => {
        if (command.includes("dumpsys gfxinfo")) {
          if (command.includes("reset")) {
            return { stdout: "", stderr: "" };
          }

          callCount++;
          if (callCount === 1) {
            return {
              stdout: `
                Number Missed Vsync: 0
                Number Slow UI thread: 0
                Number Frame deadline missed: 0
              `,
              stderr: ""
            };
          } else {
            return {
              stdout: `
                Number Missed Vsync: 0
                Number Slow UI thread: 0
                Number Frame deadline missed: 2
              `,
              stderr: ""
            };
          }
        } else if (command.includes("input tap")) {
          return { stdout: "", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      });

      tracker = new TouchLatencyTracker(device, adb);

      const result = await tracker.measureLatency(
        "com.example.app",
        screenSize,
        { sampleCount: 1, maxWaitMs: 200 },
        perf
      );

      expect(result.success).to.be.true;
      expect(result.latencyMs).to.be.greaterThan(0);
    });

    it("should handle errors gracefully and return error result", async function() {
      adb = new AdbClient(device, async (command: string) => {
        throw new Error("ADB connection failed");
      });

      tracker = new TouchLatencyTracker(device, adb);

      const result = await tracker.measureLatency(
        "com.example.app",
        screenSize,
        { sampleCount: 1, maxWaitMs: 200 },
        perf
      );

      expect(result.success).to.be.false;
      expect(result.error).to.include("ADB connection failed");
    });
  });
});
