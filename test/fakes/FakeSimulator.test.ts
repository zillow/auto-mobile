import { expect } from "chai";
import { FakeSimulator } from "./FakeSimulator";
import type { SimulatorInfo } from "../../src/utils/interfaces/Simulator";

describe("FakeSimulator", () => {
  let fakeSimulator: FakeSimulator;

  beforeEach(() => {
    fakeSimulator = new FakeSimulator();
  });

  describe("configuration methods", () => {
    it("should set and return simulator names", async () => {
      const names = ["iPhone 14", "iPhone 15"];
      fakeSimulator.setSimulatorNames(names);
      const result = await fakeSimulator.listSimulators();
      expect(result).to.deep.equal(names);
    });

    it("should set and return simulator info", async () => {
      const info: SimulatorInfo[] = [
        {
          name: "iPhone 14",
          udid: "udid-123",
          state: "Booted",
          isAvailable: true,
          deviceType: "iPhone 14",
          runtime: "iOS 17.0"
        }
      ];
      fakeSimulator.setSimulatorInfo(info);
      const result = await fakeSimulator.getSimulatorInfo();
      expect(result).to.deep.equal(info);
    });

    it("should set and return running simulators", async () => {
      const simulators: SimulatorInfo[] = [
        {
          name: "iPhone 14",
          udid: "udid-123",
          state: "Booted",
          isAvailable: true,
          deviceType: "iPhone 14",
          runtime: "iOS 17.0"
        }
      ];
      fakeSimulator.setRunningSimulators(simulators);
      const result = await fakeSimulator.getRunningSimulators();
      expect(result).to.deep.equal(simulators);
    });

    it("should set and return start simulator result", async () => {
      const result = {
        success: true,
        simulatorName: "iPhone 14",
        udid: "udid-123"
      };
      fakeSimulator.setStartSimulatorResult(result);
      const response = await fakeSimulator.startSimulator("iPhone 14");
      expect(response).to.deep.equal(result);
    });

    it("should set and return shutdown simulator result", async () => {
      const result = {
        success: true,
        simulatorName: "iPhone 14"
      };
      fakeSimulator.setShutdownSimulatorResult(result);
      const response = await fakeSimulator.shutdownSimulator("iPhone 14");
      expect(response).to.deep.equal(result);
    });

    it("should set and return is simulator running result", async () => {
      fakeSimulator.setIsSimulatorRunning(true);
      const result = await fakeSimulator.isSimulatorRunning("iPhone 14");
      expect(result).to.be.true;

      fakeSimulator.setIsSimulatorRunning(false);
      const result2 = await fakeSimulator.isSimulatorRunning("iPhone 14");
      expect(result2).to.be.false;
    });

    it("should set and return installed apps", async () => {
      const apps = ["com.apple.Preferences", "com.example.app"];
      fakeSimulator.setInstalledApps(apps);
      const result = await fakeSimulator.listInstalledApps("udid-123");
      expect(result).to.deep.equal(apps);
    });

    it("should throw error on launchApp when error is configured", async () => {
      const error = new Error("Launch failed");
      fakeSimulator.setLaunchAppError(error);
      try {
        await fakeSimulator.launchApp("udid-123", "com.example.app");
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).to.equal("Launch failed");
      }
    });

    it("should not throw error on launchApp when error is null", async () => {
      fakeSimulator.setLaunchAppError(null);
      await fakeSimulator.launchApp("udid-123", "com.example.app");
      // Should not throw
    });
  });

  describe("call tracking", () => {
    it("should track method calls", async () => {
      fakeSimulator.setSimulatorNames(["iPhone 14"]);
      await fakeSimulator.listSimulators();
      expect(fakeSimulator.wasMethodCalled("listSimulators")).to.be.true;
    });

    it("should track method call parameters", async () => {
      await fakeSimulator.startSimulator("iPhone 14", 60000);
      const calls = fakeSimulator.getMethodCalls("startSimulator");
      expect(calls).to.have.length(1);
      expect(calls[0]).to.deep.equal({
        simulatorName: "iPhone 14",
        timeoutMs: 60000
      });
    });

    it("should count method calls", async () => {
      await fakeSimulator.listSimulators();
      await fakeSimulator.listSimulators();
      await fakeSimulator.listSimulators();
      expect(fakeSimulator.getMethodCallCount("listSimulators")).to.equal(3);
    });

    it("should clear call history", async () => {
      await fakeSimulator.listSimulators();
      expect(fakeSimulator.wasMethodCalled("listSimulators")).to.be.true;
      fakeSimulator.clearCallHistory();
      expect(fakeSimulator.wasMethodCalled("listSimulators")).to.be.false;
    });

    it("should return empty array for uncalled methods", () => {
      const calls = fakeSimulator.getMethodCalls("nonExistentMethod");
      expect(calls).to.be.an("array").that.is.empty;
    });
  });

  describe("default behaviors", () => {
    it("should return empty arrays by default", async () => {
      const names = await fakeSimulator.listSimulators();
      expect(names).to.be.an("array").that.is.empty;

      const info = await fakeSimulator.getSimulatorInfo();
      expect(info).to.be.an("array").that.is.empty;

      const running = await fakeSimulator.getRunningSimulators();
      expect(running).to.be.an("array").that.is.empty;

      const apps = await fakeSimulator.listInstalledApps("udid");
      expect(apps).to.be.an("array").that.is.empty;
    });

    it("should return false for isSimulatorRunning by default", async () => {
      const result = await fakeSimulator.isSimulatorRunning("iPhone 14");
      expect(result).to.be.false;
    });

    it("should return success:true for startSimulator by default", async () => {
      const result = await fakeSimulator.startSimulator("iPhone 14");
      expect(result.success).to.be.true;
    });

    it("should return success:true for shutdownSimulator by default", async () => {
      const result = await fakeSimulator.shutdownSimulator("iPhone 14");
      expect(result.success).to.be.true;
    });
  });
});
