import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  PerformanceMonitor,
  _resetPerformanceMonitor,
  PerformanceDataPusher,
  ServerGetter,
} from "../../../src/features/performance/PerformanceMonitor";
import { LivePerformanceData } from "../../../src/daemon/performancePushSocketServer";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeAdbClientFactory } from "../../fakes/FakeAdbClientFactory";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";

/**
 * Helper to advance time and wait for async callbacks to complete.
 */
async function advanceTimeAndWait(timer: FakeTimer, ms: number): Promise<void> {
  timer.advanceTime(ms);
  // Give async callbacks time to complete
  await new Promise(resolve => setImmediate(resolve));
  await Promise.resolve();
}

/**
 * Fake implementation of PerformanceDataPusher for testing.
 */
class FakePerformancePusher implements PerformanceDataPusher {
  private pushedData: LivePerformanceData[] = [];

  pushPerformanceData(data: LivePerformanceData): void {
    this.pushedData.push(data);
  }

  getPushedData(): LivePerformanceData[] {
    return [...this.pushedData];
  }

  getLastPushedData(): LivePerformanceData | undefined {
    return this.pushedData[this.pushedData.length - 1];
  }

  getPushCount(): number {
    return this.pushedData.length;
  }

  reset(): void {
    this.pushedData = [];
  }
}

describe("PerformanceMonitor", () => {
  let fakeTimer: FakeTimer;
  let fakeAdbFactory: FakeAdbClientFactory;
  let fakeAdbClient: FakeAdbClient;
  let fakePusher: FakePerformancePusher;
  let serverGetter: ServerGetter;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    fakeAdbClient = new FakeAdbClient();
    fakeAdbFactory = new FakeAdbClientFactory(fakeAdbClient);
    fakePusher = new FakePerformancePusher();
    serverGetter = () => fakePusher;

    // Set up default ADB responses
    setupDefaultAdbResponses(fakeAdbClient);
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    _resetPerformanceMonitor();
    fakeTimer.reset();
  });

  function setupDefaultAdbResponses(adb: FakeAdbClient): void {
    // gfxinfo response (with reset flag for per-interval metrics)
    adb.setCommandResult(
      "shell dumpsys gfxinfo com.example.app reset",
      `
        50th percentile: 8.5ms
        90th percentile: 12.3ms
        95th percentile: 15.7ms
        99th percentile: 22.1ms
        Missed Vsync: 2
        Slow UI thread: 1
        Frame deadline missed: 3
      `
    );

    // pidof response
    adb.setCommandResult("shell pidof com.example.app", "12345\n");

    // /proc/stat response
    adb.setCommandResult(
      "shell cat /proc/12345/stat",
      "12345 (app) S 1 12345 12345 0 -1 4194560 1234 0 0 0 500 200 0 0 20 0 1 0 12345 123456789 12345 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0"
    );

    // uptime response
    adb.setCommandResult("shell cat /proc/uptime", "1000.00 800.00\n");

    // meminfo response
    adb.setCommandResult(
      "shell dumpsys meminfo com.example.app | grep \"TOTAL PSS\"",
      "        TOTAL PSS:   102400\n"
    );
  }

  describe("start() and stop()", () => {
    it("should start the monitoring interval", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();

      expect(fakeTimer.getPendingIntervalCount()).toBe(1);
    });

    it("should not start multiple intervals if called twice", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.start();

      expect(fakeTimer.getPendingIntervalCount()).toBe(1);
    });

    it("should stop the monitoring interval", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.stop();

      expect(fakeTimer.getPendingIntervalCount()).toBe(0);
    });

    it("should clear monitored devices on stop", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.startMonitoring("device-1", "com.example.app");
      expect(monitor.getMonitoredDeviceCount()).toBe(1);

      monitor.stop();
      expect(monitor.getMonitoredDeviceCount()).toBe(0);
    });
  });

  describe("startMonitoring() and stopMonitoring()", () => {
    it("should add device to monitored set", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.startMonitoring("device-1", "com.example.app");

      expect(monitor.isMonitoring("device-1")).toBe(true);
      expect(monitor.getMonitoredDeviceCount()).toBe(1);
    });

    it("should update package name for existing device", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.startMonitoring("device-1", "com.example.app1");
      monitor.startMonitoring("device-1", "com.example.app2");

      expect(monitor.isMonitoring("device-1")).toBe(true);
      expect(monitor.getMonitoredDeviceCount()).toBe(1);
    });

    it("should remove device from monitored set", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.startMonitoring("device-1", "com.example.app");
      monitor.stopMonitoring("device-1");

      expect(monitor.isMonitoring("device-1")).toBe(false);
      expect(monitor.getMonitoredDeviceCount()).toBe(0);
    });

    it("should handle stopping non-monitored device", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.stopMonitoring("non-existent");

      expect(monitor.getMonitoredDeviceCount()).toBe(0);
    });

    it("should support multiple devices", () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.startMonitoring("device-1", "com.example.app1");
      monitor.startMonitoring("device-2", "com.example.app2");

      expect(monitor.getMonitoredDeviceCount()).toBe(2);
      expect(monitor.isMonitoring("device-1")).toBe(true);
      expect(monitor.isMonitoring("device-2")).toBe(true);
    });
  });

  describe("tick behavior", () => {
    it("should not push data when no server is available", async () => {
      const nullServerGetter = () => null;
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, nullServerGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      expect(fakePusher.getPushCount()).toBe(0);
    });

    it("should not push data when no devices are monitored", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      expect(fakePusher.getPushCount()).toBe(0);
    });

    it("should push data every tick interval", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // First tick
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      expect(fakePusher.getPushCount()).toBe(1);

      // Second tick
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      expect(fakePusher.getPushCount()).toBe(2);

      // Third tick
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      expect(fakePusher.getPushCount()).toBe(3);
    });

    it("should include correct device and package info in pushed data", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("test-device", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data).toBeDefined();
      expect(data!.deviceId).toBe("test-device");
      expect(data!.packageName).toBe("com.example.app");
    });

    it("should prevent concurrent tick execution", async () => {
      // Use a slow ADB response to test concurrent prevention
      fakeAdbClient.setCommandResult("shell dumpsys gfxinfo com.example.app reset", "");

      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // Trigger multiple ticks quickly
      fakeTimer.advanceTime(PerformanceMonitor.TICK_INTERVAL_MS);
      fakeTimer.advanceTime(PerformanceMonitor.TICK_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();

      // Should only process one tick at a time
      expect(fakePusher.getPushCount()).toBeLessThanOrEqual(2);
    });
  });

  describe("tiered metric collection", () => {
    it("should collect fast metrics (gfxinfo) every tick", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // First tick
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const gfxCalls1 = fakeAdbClient.getCommandCount("dumpsys gfxinfo");
      expect(gfxCalls1).toBe(1);

      // Second tick
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const gfxCalls2 = fakeAdbClient.getCommandCount("dumpsys gfxinfo");
      expect(gfxCalls2).toBe(2);
    });

    it("should collect CPU metrics only at medium intervals", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // First tick (t=500ms) - should collect CPU since lastMediumTick=0
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const cpuCalls1 = fakeAdbClient.getCommandCount("pidof");
      expect(cpuCalls1).toBe(1);

      // Second tick (t=1000ms) - should NOT collect CPU yet
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const cpuCalls2 = fakeAdbClient.getCommandCount("pidof");
      expect(cpuCalls2).toBe(1);

      // Third tick (t=1500ms) - should NOT collect CPU yet
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const cpuCalls3 = fakeAdbClient.getCommandCount("pidof");
      expect(cpuCalls3).toBe(1);

      // Fourth tick (t=2000ms) - should NOT collect CPU yet (need >= 2000ms since last)
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const cpuCalls4 = fakeAdbClient.getCommandCount("pidof");
      expect(cpuCalls4).toBe(1);

      // Fifth tick (t=2500ms) - should collect CPU now (2000ms since t=500ms)
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const cpuCalls5 = fakeAdbClient.getCommandCount("pidof");
      expect(cpuCalls5).toBe(2);
    });

    it("should collect memory metrics only at slow intervals", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // First tick - should collect memory since lastSlowTick=0
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const memCalls1 = fakeAdbClient.getCommandCount("dumpsys meminfo");
      expect(memCalls1).toBe(1);

      // Advance to just before 10 seconds
      await advanceTimeAndWait(fakeTimer, 9000);
      const memCalls2 = fakeAdbClient.getCommandCount("dumpsys meminfo");
      // Should still be 1 (fast ticks happened but not slow)
      expect(memCalls2).toBe(1);

      // Advance past 10 seconds from first collection
      await advanceTimeAndWait(fakeTimer, 1000);
      const memCalls3 = fakeAdbClient.getCommandCount("dumpsys meminfo");
      // Should now be 2
      expect(memCalls3).toBe(2);
    });

    it("should use cached values for medium/slow metrics between intervals", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // First tick - collect all
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const data1 = fakePusher.getLastPushedData();
      expect(data1!.metrics.memoryUsageMb).toBe(100); // 102400 KB / 1024

      // Second tick - should use cached memory
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const data2 = fakePusher.getLastPushedData();
      expect(data2!.metrics.memoryUsageMb).toBe(100);
    });
  });

  describe("metric parsing", () => {
    it("should parse FPS from frame time", async () => {
      // 8.5ms frame time = ~117 fps, capped at 60
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data!.metrics.fps).toBe(60); // Capped at 60
      expect(data!.metrics.frameTimeMs).toBe(8.5);
    });

    it("should calculate jank frames as sum of per-interval counters", async () => {
      // With reset flag, each sample returns only jank since last reset
      // Jank is the sum of all three indicators per interval
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      // First tick - jank should be sum of: 2 + 1 + 3 = 6 (from default setup)
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const data1 = fakePusher.getLastPushedData();
      expect(data1!.metrics.jankFrames).toBe(6); // missedVsync(2) + slowUi(1) + deadlineMissed(3)

      // Update counters to simulate new jank for second interval
      fakeAdbClient.setCommandResult(
        "shell dumpsys gfxinfo com.example.app reset",
        `
          50th percentile: 8.5ms
          Missed Vsync: 3
          Slow UI thread: 1
          Frame deadline missed: 1
        `
      );

      // Second tick - should report sum for this interval: 3 + 1 + 1 = 5
      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);
      const data2 = fakePusher.getLastPushedData();
      expect(data2!.metrics.jankFrames).toBe(5);
    });

    it("should parse memory in MB", async () => {
      // TOTAL PSS: 102400 KB = 100 MB
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data!.metrics.memoryUsageMb).toBe(100);
    });

    it("should handle missing gfxinfo data gracefully", async () => {
      fakeAdbClient.setCommandResult("shell dumpsys gfxinfo com.example.app reset", "No data available");

      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data!.metrics.fps).toBeNull();
      expect(data!.metrics.frameTimeMs).toBeNull();
      expect(data!.metrics.jankFrames).toBe(0); // Jank counters default to 0 when not found
    });

    it("should handle missing PID gracefully", async () => {
      fakeAdbClient.setCommandResult("shell pidof com.example.app", "");

      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data!.metrics.cpuUsagePercent).toBeNull();
    });

    it("should handle ADB errors gracefully", async () => {
      fakeAdbClient.setCommandError(
        "shell dumpsys gfxinfo com.example.app reset",
        new Error("ADB connection failed")
      );

      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data).toBeDefined();
      expect(data!.metrics.fps).toBeNull();
    });
  });

  describe("health calculation", () => {
    it("should include health status in pushed data", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data!.health).toBeDefined();
      expect(["healthy", "warning", "critical"]).toContain(data!.health);
    });

    it("should include thresholds in pushed data", async () => {
      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.example.app");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      const data = fakePusher.getLastPushedData();
      expect(data!.thresholds).toBeDefined();
      expect(data!.thresholds.fpsWarning).toBeDefined();
      expect(data!.thresholds.fpsCritical).toBeDefined();
    });
  });

  describe("multiple devices", () => {
    it("should push data for each monitored device", async () => {
      fakeAdbClient.setCommandResult(
        "shell dumpsys gfxinfo com.app1 reset",
        "50th percentile: 10ms"
      );
      fakeAdbClient.setCommandResult(
        "shell dumpsys gfxinfo com.app2 reset",
        "50th percentile: 12ms"
      );
      fakeAdbClient.setCommandResult("shell pidof com.app1", "111");
      fakeAdbClient.setCommandResult("shell pidof com.app2", "222");
      fakeAdbClient.setCommandResult("shell cat /proc/111/stat", "111 (app) S 0 0 0 0 0 0 0 0 0 0 100 50 0 0 20 0 1 0 0 0 0 0");
      fakeAdbClient.setCommandResult("shell cat /proc/222/stat", "222 (app) S 0 0 0 0 0 0 0 0 0 0 200 100 0 0 20 0 1 0 0 0 0 0");
      fakeAdbClient.setCommandResult("shell dumpsys meminfo com.app1 | grep \"TOTAL PSS\"", "TOTAL PSS: 50000");
      fakeAdbClient.setCommandResult("shell dumpsys meminfo com.app2 | grep \"TOTAL PSS\"", "TOTAL PSS: 60000");

      monitor = new PerformanceMonitor(fakeTimer, fakeAdbFactory, serverGetter);
      monitor.start();
      monitor.startMonitoring("device-1", "com.app1");
      monitor.startMonitoring("device-2", "com.app2");

      await advanceTimeAndWait(fakeTimer, PerformanceMonitor.TICK_INTERVAL_MS);

      expect(fakePusher.getPushCount()).toBe(2);

      const allData = fakePusher.getPushedData();
      const device1Data = allData.find(d => d.deviceId === "device-1");
      const device2Data = allData.find(d => d.deviceId === "device-2");

      expect(device1Data).toBeDefined();
      expect(device2Data).toBeDefined();
      expect(device1Data!.packageName).toBe("com.app1");
      expect(device2Data!.packageName).toBe("com.app2");
    });
  });
});
