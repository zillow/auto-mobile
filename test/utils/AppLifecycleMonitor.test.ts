import { expect } from "chai";
import { AppLifecycleMonitor, AppLifecycleEvent } from "../../src/utils/appLifecycleMonitor";
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
    it("should return the same instance", () => {
      const instance1 = AppLifecycleMonitor.getInstance();
      const instance2 = AppLifecycleMonitor.getInstance();
      expect(instance1).to.equal(instance2);
    });
  });

  describe("package tracking", () => {
    it("should track packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");
      expect(monitor.getTrackedPackages()).to.include("com.example.app");
    });

    it("should untrack packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");
      await monitor.untrackPackage("test-device", "com.example.app");
      expect(monitor.getTrackedPackages()).to.not.include("com.example.app");
    });

    it("should track multiple packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app1", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("shell pidof com.example.app2", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app1");
      await monitor.trackPackage("test-device", "com.example.app2");
      expect(monitor.getTrackedPackages()).to.have.length(2);
      expect(monitor.getTrackedPackages()).to.include("com.example.app1");
      expect(monitor.getTrackedPackages()).to.include("com.example.app2");
    });
  });

  describe("isPackageRunning", () => {
    it("should return true when package is running", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).to.be.true;
    });

    it("should return false when package is not running", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).to.be.false;
    });

    it("should return false when pidof command fails", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "pidof failed" });

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).to.be.false;
    });
  });

  describe("getRunningPackages", () => {
    it("should return empty array initially", () => {
      expect(monitor.getRunningPackages()).to.have.length(0);
    });

    it("should return running packages after checkForChanges", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");
      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).to.include("com.example.app");
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

    it("should emit launch event for new package", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");

      // Explicitly check for changes
      await monitor.checkForChanges("test-device");

      expect(launchEvents).to.have.length(1);
      expect(launchEvents[0].type).to.equal("launch");
      expect(launchEvents[0].appId).to.equal("com.example.app");
      expect(launchEvents[0].metadata?.detectionMethod).to.equal("pidof");
    });

    it("should emit terminate event when package stops", async () => {
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

      expect(terminateEvents).to.have.length(1);
      expect(terminateEvents[0].type).to.equal("terminate");
      expect(terminateEvents[0].appId).to.equal("com.example.app");
      expect(terminateEvents[0].metadata?.detectionMethod).to.equal("pidof");
    });

    it("should handle multiple packages", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app1", { stdout: "12345", stderr: "" });
      fakeAdb.setCommandResponse("shell pidof com.example.app2", { stdout: "12345", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app1");
      await monitor.trackPackage("test-device", "com.example.app2");

      // Check for changes to detect launches
      await monitor.checkForChanges("test-device");

      expect(launchEvents).to.have.length(2);
      expect(launchEvents.map(e => e.appId)).to.include("com.example.app1");
      expect(launchEvents.map(e => e.appId)).to.include("com.example.app2");
    });
  });

  describe("event listener management", () => {
    it("should add and remove event listeners", () => {
      const listener = async () => {};

      monitor.addEventListener("launch", listener);
      monitor.removeEventListener("launch", listener);

      // Listeners are managed by EventEmitter, so we just verify no errors
      expect(monitor.listenerCount("launch")).to.equal(0);
    });
  });

  describe("checkForChanges", () => {
    it("should detect package state changes", async () => {
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "", stderr: "" });

      await monitor.trackPackage("test-device", "com.example.app");

      // Initially package is not running
      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).to.not.include("com.example.app");

      // Package starts running
      fakeAdb.setCommandResponse("shell pidof com.example.app", { stdout: "12345", stderr: "" });

      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).to.include("com.example.app");
    });
  });

  describe("error handling", () => {
    it("should handle event emission errors gracefully", async () => {
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
