import { expect, describe, test, beforeEach } from "bun:test";
import { FakeSimulator } from "./FakeSimulator";
import type { SimulatorInfo } from "../../src/utils/interfaces/Simulator";

describe("FakeSimulator", () => {
  let fakeSimulator: FakeSimulator;

  beforeEach(() => {
    fakeSimulator = new FakeSimulator();
  });

  describe("configuration methods", () => {
    test("should set and return simulator names", async () => {
      const names = ["iPhone 14", "iPhone 15"];
      fakeSimulator.setSimulatorNames(names);
      const result = await fakeSimulator.listSimulators();
      expect(result).toEqual(names);
    });

    test("should set and return simulator info", async () => {
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
      expect(result).toEqual(info);
    });

    test("should set and return running simulators", async () => {
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
      expect(result).toEqual(simulators);
    });

    test("should set and return start simulator result", async () => {
      const result = {
        success: true,
        simulatorName: "iPhone 14",
        udid: "udid-123"
      };
      fakeSimulator.setStartSimulatorResult(result);
      const response = await fakeSimulator.startSimulator("iPhone 14");
      expect(response).toEqual(result);
    });

    test("should set and return shutdown simulator result", async () => {
      const result = {
        success: true,
        simulatorName: "iPhone 14"
      };
      fakeSimulator.setShutdownSimulatorResult(result);
      const response = await fakeSimulator.shutdownSimulator("iPhone 14");
      expect(response).toEqual(result);
    });

    test("should set and return is simulator running result", async () => {
      fakeSimulator.setIsSimulatorRunning(true);
      const result = await fakeSimulator.isSimulatorRunning("iPhone 14");
      expect(result).toBe(true);

      fakeSimulator.setIsSimulatorRunning(false);
      const result2 = await fakeSimulator.isSimulatorRunning("iPhone 14");
      expect(result2).toBe(false);
    });

    test("should set and return installed apps", async () => {
      const apps = ["com.apple.Preferences", "com.example.app"];
      fakeSimulator.setInstalledApps(apps);
      const result = await fakeSimulator.listInstalledApps("udid-123");
      expect(result).toEqual(apps);
    });

    test("should throw error on launchApp when error is configured", async () => {
      const error = new Error("Launch failed");
      fakeSimulator.setLaunchAppError(error);
      try {
        await fakeSimulator.launchApp("udid-123", "com.example.app");
        expect.fail("Should have thrown error");
      } catch (e) {
        expect((e as Error).message).toBe("Launch failed");
      }
    });

    test("should not throw error on launchApp when error is null", async () => {
      fakeSimulator.setLaunchAppError(null);
      await fakeSimulator.launchApp("udid-123", "com.example.app");
      // Should not throw
    });
  });

  describe("call tracking", () => {
    test("should track method calls", async () => {
      fakeSimulator.setSimulatorNames(["iPhone 14"]);
      await fakeSimulator.listSimulators();
      expect(fakeSimulator.wasMethodCalled("listSimulators")).toBe(true);
    });

    test("should track method call parameters", async () => {
      await fakeSimulator.startSimulator("iPhone 14", 60000);
      const calls = fakeSimulator.getMethodCalls("startSimulator");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        simulatorName: "iPhone 14",
        timeoutMs: 60000
      });
    });

    test("should count method calls", async () => {
      await fakeSimulator.listSimulators();
      await fakeSimulator.listSimulators();
      await fakeSimulator.listSimulators();
      expect(fakeSimulator.getMethodCallCount("listSimulators")).toBe(3);
    });

    test("should clear call history", async () => {
      await fakeSimulator.listSimulators();
      expect(fakeSimulator.wasMethodCalled("listSimulators")).toBe(true);
      fakeSimulator.clearCallHistory();
      expect(fakeSimulator.wasMethodCalled("listSimulators")).toBe(false);
    });

    test("should return empty array for uncalled methods", () => {
      const calls = fakeSimulator.getMethodCalls("nonExistentMethod");
      expect(Array.isArray(calls)).toBe(true);
      expect(calls).toHaveLength(0);
    });
  });

  describe("default behaviors", () => {
    test("should return empty arrays by default", async () => {
      const names = await fakeSimulator.listSimulators();
      expect(Array.isArray(names)).toBe(true);
      expect(names).toHaveLength(0);

      const info = await fakeSimulator.getSimulatorInfo();
      expect(Array.isArray(info)).toBe(true);
      expect(info).toHaveLength(0);

      const running = await fakeSimulator.getRunningSimulators();
      expect(Array.isArray(running)).toBe(true);
      expect(running).toHaveLength(0);

      const apps = await fakeSimulator.listInstalledApps("udid");
      expect(Array.isArray(apps)).toBe(true);
      expect(apps).toHaveLength(0);
    });

    test("should return false for isSimulatorRunning by default", async () => {
      const result = await fakeSimulator.isSimulatorRunning("iPhone 14");
      expect(result).toBe(false);
    });

    test("should return success:true for startSimulator by default", async () => {
      const result = await fakeSimulator.startSimulator("iPhone 14");
      expect(result.success).toBe(true);
    });

    test("should return success:true for shutdownSimulator by default", async () => {
      const result = await fakeSimulator.shutdownSimulator("iPhone 14");
      expect(result.success).toBe(true);
    });
  });
});
