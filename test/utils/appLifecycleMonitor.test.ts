import { expect } from "chai";
import sinon from "sinon";
import { AppLifecycleMonitor, AppLifecycleEvent } from "../../src/utils/appLifecycleMonitor";
import { AdbUtils } from "../../src/utils/android-cmdline-tools/adb";
import { ExecResult } from "../../src/models";

describe("AppLifecycleMonitor", () => {
  let monitor: AppLifecycleMonitor;
  let adbUtilsStub: sinon.SinonStubbedInstance<AdbUtils>;

  beforeEach(() => {
    // Stub the AdbUtils constructor and its methods
    adbUtilsStub = sinon.createStubInstance(AdbUtils);
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(adbUtilsStub.executeCommand);

    monitor = AppLifecycleMonitor.getInstance();
  });

  afterEach(async () => {
    // Clean up singleton state
    const trackedPackages = monitor.getTrackedPackages();
    for (const pkg of trackedPackages) {
      await monitor.untrackPackage("test-device", pkg);
    }

    // Clear all event listeners
    monitor.removeAllListeners();

    // Clean up sinon stubs
    sinon.restore();
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
      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.trackPackage("test-device", "com.example.app");
      expect(monitor.getTrackedPackages()).to.include("com.example.app");
    });

    it("should untrack packages", async () => {
      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.trackPackage("test-device", "com.example.app");
      await monitor.untrackPackage("test-device", "com.example.app");
      expect(monitor.getTrackedPackages()).to.not.include("com.example.app");
    });

    it("should track multiple packages", async () => {
      const mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.trackPackage("test-device", "com.example.app1");
      await monitor.trackPackage("test-device", "com.example.app2");
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

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
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

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).to.be.false;
    });

    it("should return false when pidof command fails", async () => {
      adbUtilsStub.executeCommand.rejects(new Error("pidof failed"));

      const isRunning = await monitor.isPackageRunning("test-device", "com.example.app");
      expect(isRunning).to.be.false;
    });
  });

  describe("getRunningPackages", () => {
    it("should return empty array initially", () => {
      expect(monitor.getRunningPackages()).to.have.length(0);
    });

    it("should return running packages after checkForChanges", async () => {
      const mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

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
      await monitor.trackPackage("test-device", "com.example.app");

      // Simulate package launch
      const mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      // Explicitly check for changes
      await monitor.checkForChanges("test-device");

      expect(launchEvents).to.have.length(1);
      expect(launchEvents[0].type).to.equal("launch");
      expect(launchEvents[0].appId).to.equal("com.example.app");
      expect(launchEvents[0].metadata?.detectionMethod).to.equal("pidof");
    });

    it("should emit terminate event when package stops", async () => {
      await monitor.trackPackage("test-device", "com.example.app");

      // First, simulate package running
      let mockOutput: ExecResult = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      // Check for changes to establish running state
      await monitor.checkForChanges("test-device");

      // Clear events from the launch
      launchEvents.length = 0;

      // Simulate package termination
      mockOutput = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      // Check for changes to detect termination
      await monitor.checkForChanges("test-device");

      expect(terminateEvents).to.have.length(1);
      expect(terminateEvents[0].type).to.equal("terminate");
      expect(terminateEvents[0].appId).to.equal("com.example.app");
      expect(terminateEvents[0].metadata?.detectionMethod).to.equal("pidof");
    });

    it("should handle multiple packages", async () => {
      await monitor.trackPackage("test-device", "com.example.app1");
      await monitor.trackPackage("test-device", "com.example.app2");

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

      // Check for changes to detect launches
      await monitor.checkForChanges("test-device");

      expect(launchEvents).to.have.length(2);
      expect(launchEvents.map(e => e.appId)).to.include("com.example.app1");
      expect(launchEvents.map(e => e.appId)).to.include("com.example.app2");
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

  describe("checkForChanges", () => {
    it("should detect package state changes", async () => {
      await monitor.trackPackage("test-device", "com.example.app");

      // Initially package is not running
      let mockOutput: ExecResult = {
        stdout: "",
        stderr: "",
        toString: () => "",
        trim: () => "",
        includes: () => false
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).to.not.include("com.example.app");

      // Package starts running
      mockOutput = {
        stdout: "12345",
        stderr: "",
        toString: () => "12345",
        trim: () => "12345",
        includes: (str: string) => mockOutput.stdout.includes(str)
      };
      adbUtilsStub.executeCommand.resolves(mockOutput);

      await monitor.checkForChanges("test-device");
      expect(monitor.getRunningPackages()).to.include("com.example.app");
    });
  });

  describe("error handling", () => {
    it("should handle event emission errors gracefully", async () => {
      await monitor.trackPackage("test-device", "com.example.app");

      // Add listener that throws
      monitor.addEventListener("launch", async () => {
        throw new Error("Event handler error");
      });

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
      await monitor.checkForChanges("test-device");
    });
  });
});
