import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { CrashMonitorCoordinator } from "../../../src/utils/crash/CrashMonitorCoordinator";
import { FakeCrashDetector, createSampleCrashEvent, createSampleAnrEvent } from "../../fakes/FakeCrashDetector";
import { FakeTimer } from "../../fakes/FakeTimer";
import type { BootedDevice } from "../../../src/models";
import type { CrashEvent, AnrEvent } from "../../../src/utils/interfaces/CrashMonitor";

describe("CrashMonitorCoordinator", () => {
  let coordinator: CrashMonitorCoordinator;
  let fakeTimer: FakeTimer;
  let fakeLogcatDetector: FakeCrashDetector;
  let fakeProcessDetector: FakeCrashDetector;
  let testDevice: BootedDevice;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    // Use manual mode so setInterval doesn't fire automatically
    fakeTimer.setManualMode();
    fakeLogcatDetector = new FakeCrashDetector("logcat");
    fakeProcessDetector = new FakeCrashDetector("process_monitor");

    coordinator = new CrashMonitorCoordinator({
      timer: fakeTimer,
      logcatDetector: fakeLogcatDetector,
      processDetector: fakeProcessDetector,
      // Disable other detectors for focused testing
      tombstoneDetector: new FakeCrashDetector("tombstone"),
      dropboxDetector: new FakeCrashDetector("dropbox"),
      accessibilityDetector: new FakeCrashDetector("accessibility"),
    });

    testDevice = {
      name: "Test Emulator",
      platform: "android",
      deviceId: "emulator-5554",
    };
  });

  afterEach(async () => {
    if (coordinator.isMonitoring()) {
      await coordinator.stop();
    }
  });

  describe("start/stop", () => {
    test("should start monitoring with all detectors", async () => {
      await coordinator.start(testDevice, "com.example.app");

      expect(coordinator.isMonitoring()).toBe(true);
      expect(coordinator.getMonitoredPackage()).toBe("com.example.app");
      expect(coordinator.getMonitoredDevice()).toBe(testDevice);
      expect(fakeLogcatDetector.wasStartCalled()).toBe(true);
      expect(fakeProcessDetector.wasStartCalled()).toBe(true);
    });

    test("should stop all detectors when stopped", async () => {
      await coordinator.start(testDevice, "com.example.app");
      await coordinator.stop();

      expect(coordinator.isMonitoring()).toBe(false);
      expect(coordinator.getMonitoredPackage()).toBeNull();
      expect(fakeLogcatDetector.wasStopCalled()).toBe(true);
      expect(fakeProcessDetector.wasStopCalled()).toBe(true);
    });

    test("should stop existing monitoring before starting new", async () => {
      await coordinator.start(testDevice, "com.example.app1");
      await coordinator.start(testDevice, "com.example.app2");

      expect(coordinator.getMonitoredPackage()).toBe("com.example.app2");
      expect(fakeLogcatDetector.wasStopCalled()).toBe(true);
    });
  });

  describe("polling", () => {
    test("should poll detectors and collect crashes", async () => {
      // Before start: no calls
      expect(fakeLogcatDetector.getCheckForCrashesCallCount()).toBe(0);

      await coordinator.start(testDevice, "com.example.app");

      // After start: still no calls (manual mode)
      expect(fakeLogcatDetector.getCheckForCrashesCallCount()).toBe(0);

      const crash = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.addPendingCrash(crash);

      const result = await coordinator.poll();

      // After poll: should have 1 call
      expect(fakeLogcatDetector.getCheckForCrashesCallCount()).toBe(1);

      expect(result.crashes).toHaveLength(1);
      expect(result.crashes[0].packageName).toBe("com.example.app");
      expect(coordinator.getCrashes()).toHaveLength(1);
    });

    test("should poll detectors and collect ANRs", async () => {
      await coordinator.start(testDevice, "com.example.app");

      const anr = createSampleAnrEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.addPendingAnr(anr);

      const result = await coordinator.poll();

      expect(result.anrs).toHaveLength(1);
      expect(result.anrs[0].packageName).toBe("com.example.app");
      expect(coordinator.getAnrs()).toHaveLength(1);
    });

    test("should deduplicate crashes from multiple detectors", async () => {
      await coordinator.start(testDevice, "com.example.app");

      const timestamp = Date.now();
      const crash1 = createSampleCrashEvent({
        packageName: "com.example.app",
        timestamp,
        exceptionClass: "NullPointerException",
      });
      const crash2 = createSampleCrashEvent({
        packageName: "com.example.app",
        timestamp: timestamp + 100, // Within 5 second window
        exceptionClass: "NullPointerException",
      });

      fakeLogcatDetector.addPendingCrash(crash1);
      fakeProcessDetector.addPendingCrash(crash2);

      const result = await coordinator.poll();

      // Should deduplicate to 1 crash
      expect(result.crashes).toHaveLength(1);
    });
  });

  describe("event listeners", () => {
    test("should notify crash listeners when crash detected", async () => {
      const receivedCrashes: CrashEvent[] = [];
      coordinator.addCrashListener(crash => {
        receivedCrashes.push(crash);
      });

      await coordinator.start(testDevice, "com.example.app");

      const crash = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.simulateCrash(crash);

      expect(receivedCrashes).toHaveLength(1);
      expect(receivedCrashes[0].packageName).toBe("com.example.app");
    });

    test("should notify ANR listeners when ANR detected", async () => {
      const receivedAnrs: AnrEvent[] = [];
      coordinator.addAnrListener(anr => {
        receivedAnrs.push(anr);
      });

      await coordinator.start(testDevice, "com.example.app");

      const anr = createSampleAnrEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.simulateAnr(anr);

      expect(receivedAnrs).toHaveLength(1);
      expect(receivedAnrs[0].packageName).toBe("com.example.app");
    });

    test("should remove listeners correctly", async () => {
      const receivedCrashes: CrashEvent[] = [];
      const listener = (crash: CrashEvent) => {
        receivedCrashes.push(crash);
      };

      coordinator.addCrashListener(listener);
      await coordinator.start(testDevice, "com.example.app");

      const crash1 = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.simulateCrash(crash1);
      expect(receivedCrashes).toHaveLength(1);

      coordinator.removeCrashListener(listener);

      const crash2 = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.simulateCrash(crash2);
      // Should still be 1 since listener was removed
      expect(receivedCrashes).toHaveLength(1);
    });
  });

  describe("context enrichment", () => {
    test("should enrich crashes with navigation node ID", async () => {
      await coordinator.start(testDevice, "com.example.app");
      coordinator.setCurrentNavigationNodeId(42);

      const crash = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.addPendingCrash(crash);

      const result = await coordinator.poll();

      expect(result.crashes[0].navigationNodeId).toBe(42);
    });

    test("should enrich crashes with test execution ID", async () => {
      await coordinator.start(testDevice, "com.example.app");
      coordinator.setCurrentTestExecutionId(123);

      const crash = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.addPendingCrash(crash);

      const result = await coordinator.poll();

      expect(result.crashes[0].testExecutionId).toBe(123);
    });

    test("should enrich ANRs with context", async () => {
      await coordinator.start(testDevice, "com.example.app");
      coordinator.setCurrentNavigationNodeId(42);
      coordinator.setCurrentTestExecutionId(123);

      const anr = createSampleAnrEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.addPendingAnr(anr);

      const result = await coordinator.poll();

      expect(result.anrs[0].navigationNodeId).toBe(42);
      expect(result.anrs[0].testExecutionId).toBe(123);
    });
  });

  describe("clearEvents", () => {
    test("should clear collected crashes and ANRs", async () => {
      await coordinator.start(testDevice, "com.example.app");

      fakeLogcatDetector.addPendingCrash(createSampleCrashEvent({ packageName: "com.example.app" }));
      fakeLogcatDetector.addPendingAnr(createSampleAnrEvent({ packageName: "com.example.app" }));

      await coordinator.poll();

      expect(coordinator.getCrashes()).toHaveLength(1);
      expect(coordinator.getAnrs()).toHaveLength(1);

      coordinator.clearEvents();

      expect(coordinator.getCrashes()).toHaveLength(0);
      expect(coordinator.getAnrs()).toHaveLength(0);
    });
  });

  describe("configuration", () => {
    test("should pass session UUID to start", async () => {
      await coordinator.start(testDevice, "com.example.app", {
        sessionUuid: "test-session-123",
      });

      const crash = createSampleCrashEvent({ packageName: "com.example.app" });
      fakeLogcatDetector.addPendingCrash(crash);

      const result = await coordinator.poll();

      expect(result.crashes[0].sessionUuid).toBe("test-session-123");
    });
  });
});
