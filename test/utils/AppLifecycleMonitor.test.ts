import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { AppLifecycleMonitor, AppLifecycleEvent } from "../../src/utils/AppLifecycleMonitor";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { AppLifecycleMonitorFactory } from "../../src/utils/factories/AppLifecycleMonitorFactory";

describe("AppLifecycleMonitor", () => {
  let monitor: AppLifecycleMonitor;
  let fakeAdb: FakeAdbExecutor;

  beforeEach(() => {
    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();

    AppLifecycleMonitorFactory.setAdbClient(fakeAdb);
    monitor = AppLifecycleMonitorFactory.getInstance();
  });

  afterEach(async () => {
    // Clean up singleton state
    const trackedPackages = monitor.getTrackedPackages();
    for (const pkg of trackedPackages) {
      await monitor.untrackPackage("test-device", pkg);
    }

    // Clear all event listeners
    monitor.removeAllListeners();

    // Reset factory
    AppLifecycleMonitorFactory.reset();
  });

  describe("singleton pattern", () => {
    test("should return the same instance", () => {
      // Use factory to get instance (respects injected fake from beforeEach)
      const instance1 = AppLifecycleMonitorFactory.getInstance();
      const instance2 = AppLifecycleMonitorFactory.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("package tracking", () => {
    test("should track packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");
      expect(monitor.getTrackedPackages()).toContain("com.example.app");
    });

    test("should untrack packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");
      await monitor.untrackPackage("test-device", "com.example.app");
      expect(monitor.getTrackedPackages()).not.toContain("com.example.app");
    });

    test("should track multiple packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("shell pidof com.example.app2", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app1");
      await monitor.trackPackage("test-device", "com.example.app2");
      expect(monitor.getTrackedPackages()).toHaveLength(2);
      expect(monitor.getTrackedPackages()).toContain("com.example.app1");
      expect(monitor.getTrackedPackages()).toContain("com.example.app2");
    });
  });

  describe("isPackageRunning", () => {
    test("should return true when package is running", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).toBe(true);
    });

    test("should return false when package is not running", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).toBe(false);
    });

    test("should return false when pidof command fails", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "pidof failed" });

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).toBe(false);
    });
  });

  describe("getRunningPackages", () => {
    test("should return empty array initially", () => {
      expect(monitor.getRunningPackages()).toHaveLength(0);
    });

    test("should return running packages after checkForChanges", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");
      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).toContain("com.example.app");
    });
  });

  describe("event emission", () => {
    let launchEvents: AppLifecycleEvent[] = [];
    let terminateEvents: AppLifecycleEvent[] = [];

    beforeEach(() => {
      launchEvents = [];
      terminateEvents = [];

      monitor.addEventListener("launch", async event => {
        launchEvents.push(event);
      });

      monitor.addEventListener("terminate", async event => {
        terminateEvents.push(event);
      });
    });

    test("should emit launch event for new package", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");

      // Explicitly check for changes
      await monitor.checkForChanges("test-device");

      expect(launchEvents).toHaveLength(1);
      expect(launchEvents[0].type).toBe("launch");
      expect(launchEvents[0].appId).toBe("com.example.app");
      expect(launchEvents[0].metadata?.detectionMethod).toBe("pidof");
    });

    test("should emit terminate event when package stops", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");

      // Check for changes to establish running state
      await monitor.checkForChanges("test-device");

      // Clear events from the launch
      launchEvents.length = 0;

      // Simulate package termination
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      // Check for changes to detect termination
      await monitor.checkForChanges("test-device");

      expect(terminateEvents).toHaveLength(1);
      expect(terminateEvents[0].type).toBe("terminate");
      expect(terminateEvents[0].appId).toBe("com.example.app");
      expect(terminateEvents[0].metadata?.detectionMethod).toBe("pidof");
    });

    test("should handle multiple packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app1", { stdout: "12345", stderr: "" });
      fakeAdb.setCommandResponse("shell pidof com.example.app2", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app1");
      await monitor.trackPackage("test-device", "com.example.app2");

      // Check for changes to detect launches
      await monitor.checkForChanges("test-device");

      expect(launchEvents).toHaveLength(2);
      expect(launchEvents.map(e => e.appId)).toContain("com.example.app1");
      expect(launchEvents.map(e => e.appId)).toContain("com.example.app2");
    });
  });

  describe("event listener management", () => {
    test("should add and remove event listeners", () => {
      const listener = async () => {};

      monitor.addEventListener("launch", listener);
      monitor.removeEventListener("launch", listener);

      // Listeners are managed by EventEmitter, so we just verify no errors
      expect(monitor.listenerCount("launch")).toBe(0);
    });
  });

  describe("checkForChanges", () => {
    test("should detect package state changes", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");

      // Initially package is not running
      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).not.toContain("com.example.app");

      // Package starts running
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).toContain("com.example.app");
    });
  });

  describe("error handling", () => {
    test("should handle event emission errors gracefully", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");

      // Add listener that throws
      monitor.addEventListener("launch", async () => {
        throw new Error("Event handler error");
      });

      // Should not throw
      await monitor.checkForChanges("test-device");
    });
  });
});
