import { expect } from "chai";
import sinon from "sinon";
import { EventEmitter } from "events";
import { AppLifecycleMonitor, AppLifecycleEvent } from "../../src/utils/appLifecycleMonitor";
import { AdbUtils } from "../../src/utils/adb";
import { ExecResult } from "../../src/models/ExecResult";

describe("AppLifecycleMonitor", () => {
  let monitor: AppLifecycleMonitor;
  let adbUtilsStub: sinon.SinonStubbedInstance<AdbUtils>;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    // Create a fake timer to control setInterval behavior
    clock = sinon.useFakeTimers();

    // Stub the AdbUtils constructor and its methods
    adbUtilsStub = sinon.createStubInstance(AdbUtils);
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(adbUtilsStub.executeCommand);

    monitor = new AppLifecycleMonitor("test-device");
  });

  afterEach(async () => {
    // Stop monitoring first to clean up intervals
    if (monitor.isMonitoring()) {
      await monitor.stopMonitoring();
    }
    // Clean up
    clock.restore();
    sinon.restore();
  });

  describe("constructor", () => {
    it("should create instance with device ID", () => {
      const testMonitor = new AppLifecycleMonitor("test-device");
      expect(testMonitor).to.be.instanceOf(AppLifecycleMonitor);
      expect(testMonitor).to.be.instanceOf(EventEmitter);
    });

    it("should create instance without device ID", () => {
      const testMonitor = new AppLifecycleMonitor();
      expect(testMonitor).to.be.instanceOf(AppLifecycleMonitor);
    });
  });

  describe("package tracking", () => {
    it("should track packages", () => {
      monitor.trackPackage("com.example.app");
      expect(monitor.getTrackedPackages()).to.include("com.example.app");
    });

    it("should untrack packages", () => {
      monitor.trackPackage("com.example.app");
      monitor.untrackPackage("com.example.app");
      expect(monitor.getTrackedPackages()).to.not.include("com.example.app");
    });

    it("should track multiple packages", () => {
      monitor.trackPackage("com.example.app1");
      monitor.trackPackage("com.example.app2");
      expect(monitor.getTrackedPackages()).to.have.length(2);
      expect(monitor.getTrackedPackages()).to.include("com.example.app1");
      expect(monitor.getTrackedPackages()).to.include("com.example.app2");
    });
  });

  describe("isPackageRunning", () => {
    it("should return true when package is running", async () => {
      const mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      const isRunning = await monitor.isPackageRunning("com.example.app");
      expect(isRunning).to.be.true;
      expect(adbUtilsStub.executeCommand.calledWith("shell pidof com.example.app")).to.be.true;
    });

    it("should return false when package is not running", async () => {
      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      const isRunning = await monitor.isPackageRunning("com.example.app");
      expect(isRunning).to.be.false;
    });

    it("should return false when pidof command fails", async () => {
      adbUtilsStub.executeCommand.rejects(new Error("pidof failed"));

      const isRunning = await monitor.isPackageRunning("com.example.app");
      expect(isRunning).to.be.false;
    });
  });

  describe("startMonitoring", () => {
    it("should start monitoring successfully", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

      expect(monitor.isMonitoring()).to.be.true;
      expect(adbUtilsStub.executeCommand.calledWith("shell pidof com.example.app")).to.be.true;
    });

    it("should not start monitoring if already active", async () => {
      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();
      const firstCallCount = adbUtilsStub.executeCommand.callCount;

      await monitor.startMonitoring();
      const secondCallCount = adbUtilsStub.executeCommand.callCount;

      expect(secondCallCount).to.equal(firstCallCount);
    });

    it("should handle ADB command failure gracefully", async () => {
      monitor.trackPackage("com.example.app");
      adbUtilsStub.executeCommand.rejects(new Error("ADB command failed"));

      await monitor.startMonitoring();

      expect(monitor.isMonitoring()).to.be.true;
    });
  });

  describe("stopMonitoring", () => {
    it("should stop monitoring when active", async () => {
      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();
      await monitor.stopMonitoring();

      expect(monitor.isMonitoring()).to.be.false;
    });

    it("should handle stopping when not monitoring", async () => {
      await monitor.stopMonitoring();
      expect(monitor.isMonitoring()).to.be.false;
    });
  });

  describe("getRunningPackages", () => {
    it("should return empty array initially", () => {
      expect(monitor.getRunningPackages()).to.have.length(0);
    });

    it("should return running packages after monitoring starts", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

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
      monitor.trackPackage("com.example.app");

      // Start with package not running
      let mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

      // Simulate package launch
      mockOutput = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      // Trigger polling cycle
      await clock.tickAsync(1000);

      expect(launchEvents).to.have.length(1);
      expect(launchEvents[0].type).to.equal("launch");
      expect(launchEvents[0].appId).to.equal("com.example.app");
      expect(launchEvents[0].metadata?.detectionMethod).to.equal("pidof");
    });

    it("should emit terminate event when package stops", async () => {
      monitor.trackPackage("com.example.app");

      // Start with package running
      let mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

      // Simulate package termination
      mockOutput = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      // Trigger polling cycle
      await clock.tickAsync(1000);

      expect(terminateEvents).to.have.length(1);
      expect(terminateEvents[0].type).to.equal("terminate");
      expect(terminateEvents[0].appId).to.equal("com.example.app");
      expect(terminateEvents[0].metadata?.detectionMethod).to.equal("pidof");
    });

    it("should handle multiple packages", async () => {
      monitor.trackPackage("com.example.app1");
      monitor.trackPackage("com.example.app2");

      // Start with no packages running
      adbUtilsStub.executeCommand.resolves({
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      });

      await monitor.startMonitoring();

      // Simulate both packages launching
      adbUtilsStub.executeCommand.callsFake(async (command: string) => {
        if (command.includes("com.example.app1") || command.includes("com.example.app2")) {
          return {
            stdout: "12345",
            stderr: "",
            toString: () => "12345",
            trim: () => "12345",
            includes: (str: string) => "12345".includes(str)
          };
        }
        return {
          stdout: "",
          stderr: "",
          toString: () => "",
          trim: () => "",
          includes: () => false
        };
      });

      // Trigger polling cycle
      await clock.tickAsync(1000);

      expect(launchEvents).to.have.length(2);
      expect(launchEvents.map(e => e.appId)).to.include("com.example.app1");
      expect(launchEvents.map(e => e.appId)).to.include("com.example.app2");
    });
  });

  describe("polling configuration", () => {
    it("should use default polling interval", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

      // Default interval is 1000ms
      const initialCalls = adbUtilsStub.executeCommand.callCount;
      await clock.tickAsync(999);
      expect(adbUtilsStub.executeCommand.callCount).to.equal(initialCalls);

      await clock.tickAsync(1);
      expect(adbUtilsStub.executeCommand.callCount).to.be.greaterThan(initialCalls);
    });

    it("should use custom polling interval", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      monitor.setPollingInterval(2000);
      await monitor.startMonitoring();

      const initialCalls = adbUtilsStub.executeCommand.callCount;
      await clock.tickAsync(1999);
      expect(adbUtilsStub.executeCommand.callCount).to.equal(initialCalls);

      await clock.tickAsync(1);
      expect(adbUtilsStub.executeCommand.callCount).to.be.greaterThan(initialCalls);
    });

    it("should update polling interval while monitoring", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

      // Change interval while running
      monitor.setPollingInterval(500);

      const initialCalls = adbUtilsStub.executeCommand.callCount;
      await clock.tickAsync(500);
      expect(adbUtilsStub.executeCommand.callCount).to.be.greaterThan(initialCalls);
    });
  });

  describe("device management", () => {
    it("should set device ID", () => {
      monitor.setDeviceId("new-device");
      // Device ID change should be reflected in subsequent ADB calls
      // This is tested indirectly through the AdbUtils constructor call
    });

    it("should work without device ID", () => {
      const noDeviceMonitor = new AppLifecycleMonitor();
      expect(noDeviceMonitor).to.be.instanceOf(AppLifecycleMonitor);
    });
  });

  describe("event listener management", () => {
    it("should add and remove event listeners", () => {
      const listener = sinon.stub();

      monitor.addEventListener("launch", listener);
      monitor.removeEventListener("launch", listener);

      // Listeners are managed by EventEmitter, so we just verify no errors
      expect(monitor.listenerCount("launch")).to.equal(0);
    });
  });

  describe("error handling", () => {
    it("should continue monitoring despite polling errors", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.startMonitoring();

      // Make subsequent calls fail
      adbUtilsStub.executeCommand.rejects(new Error("ADB error"));

      // Should not throw and monitoring should continue
      await clock.tickAsync(1000);

      expect(monitor.isMonitoring()).to.be.true;
    });

    it("should handle event emission errors gracefully", async () => {
      monitor.trackPackage("com.example.app");

      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      // Add listener that throws
      monitor.addEventListener("launch", async () => {
        throw new Error("Event handler error");
      });

      await monitor.startMonitoring();

      // Simulate package launch
      const launchOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => launchOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(launchOutput);

      // Should not throw
      await clock.tickAsync(1000);

      expect(monitor.isMonitoring()).to.be.true;
    });
  });
});
