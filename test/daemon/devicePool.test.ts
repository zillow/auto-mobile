import { describe, expect, test, beforeEach } from "bun:test";
import { DevicePool } from "../../src/daemon/devicePool";
import { SessionManager } from "../../src/daemon/sessionManager";

describe("DevicePool", () => {
  let devicePool: DevicePool;
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
    devicePool = new DevicePool(sessionManager);
  });

  describe("initializeWithDevices", () => {
    test("should initialize with empty device list", async () => {
      await devicePool.initializeWithDevices([]);
      expect(devicePool.getTotalDeviceCount()).toBe(0);
      expect(devicePool.getAvailableDeviceCount()).toBe(0);
    });

    test("should initialize with single device", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      expect(devicePool.getTotalDeviceCount()).toBe(1);
      expect(devicePool.getAvailableDeviceCount()).toBe(1);
      const device = devicePool.getDevice("emulator-5554");
      expect(device).not.toBeNull();
      expect(device?.status).toBe("idle");
      expect(device?.sessionId).toBeNull();
      expect(device?.assignmentCount).toBe(0);
      expect(device?.errorCount).toBe(0);
    });

    test("should initialize with multiple devices", async () => {
      const deviceIds = ["emulator-5554", "emulator-5556", "emulator-5558"];
      await devicePool.initializeWithDevices(deviceIds);
      expect(devicePool.getTotalDeviceCount()).toBe(3);
      expect(devicePool.getAvailableDeviceCount()).toBe(3);
      for (const deviceId of deviceIds) {
        const device = devicePool.getDevice(deviceId);
        expect(device).not.toBeNull();
        expect(device?.status).toBe("idle");
        expect(device?.sessionId).toBeNull();
      }
    });
  });

  describe("assignDeviceToSession", () => {
    test("should assign device to session when devices available", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      const deviceId = await devicePool.assignDeviceToSession("session-1");
      expect(deviceId).toBe("emulator-5554");
      const device = devicePool.getDevice("emulator-5554");
      expect(device?.sessionId).toBe("session-1");
      expect(device?.status).toBe("busy");
      expect(device?.assignmentCount).toBe(1);
      expect(device?.errorCount).toBe(0);
    });

    test("should throw error when no devices available", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      await devicePool.assignDeviceToSession("session-1");
      try {
        await devicePool.assignDeviceToSession("session-2");
        expect.unreachable("Should have thrown error");
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain("No available devices");
      }
    });

    test("should assign different devices to different sessions", async () => {
      const deviceIds = ["emulator-5554", "emulator-5556"];
      await devicePool.initializeWithDevices(deviceIds);
      const device1 = await devicePool.assignDeviceToSession("session-1");
      const device2 = await devicePool.assignDeviceToSession("session-2");
      expect(device1).not.toBe(device2);
      expect(devicePool.getAvailableDeviceCount()).toBe(0);
    });

    test("should reuse device after session release", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      const device1 = await devicePool.assignDeviceToSession("session-1");
      await devicePool.releaseDevice(device1);
      const device2 = await devicePool.assignDeviceToSession("session-2");
      expect(device1).toBe(device2);
    });
  });

  describe("releaseDevice", () => {
    test("should release device assigned to session", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      const deviceId = await devicePool.assignDeviceToSession("session-1");
      await devicePool.releaseDevice(deviceId);
      const device = devicePool.getDevice(deviceId);
      expect(device?.sessionId).toBeNull();
      expect(device?.status).toBe("idle");
      expect(devicePool.getAvailableDeviceCount()).toBe(1);
    });

    test("should handle release of already idle device", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      const device = devicePool.getDevice("emulator-5554");
      expect(device?.status).toBe("idle");
      await devicePool.releaseDevice("emulator-5554");
      expect(device?.status).toBe("idle");
    });

    test("should handle release of non-existent device", async () => {
      await devicePool.releaseDevice("non-existent");
      expect(devicePool.getTotalDeviceCount()).toBe(0);
    });
  });

  describe("error tracking", () => {
    test("should record device error and increment error count", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      const device = devicePool.getDevice("emulator-5554");
      expect(device?.errorCount).toBe(0);
      devicePool.recordDeviceError("emulator-5554");
      expect(device?.errorCount).toBe(1);
      expect(device?.status).toBe("idle");
    });

    test("should mark device as error after max consecutive errors", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      const device = devicePool.getDevice("emulator-5554");
      // Record 5 errors to reach MAX_DEVICE_ERRORS (5)
      for (let i = 0; i < 5; i++) {
        devicePool.recordDeviceError("emulator-5554");
      }
      expect(device?.errorCount).toBe(5);
      expect(device?.status).toBe("error");
    });

    test("should clear error count when device assignment succeeds", async () => {
      await devicePool.initializeWithDevices(["emulator-5554"]);
      devicePool.recordDeviceError("emulator-5554");
      expect(devicePool.getDevice("emulator-5554")?.errorCount).toBe(1);
      await devicePool.releaseDevice("emulator-5554");
      await devicePool.assignDeviceToSession("session-1");
      expect(devicePool.getDevice("emulator-5554")?.errorCount).toBe(0);
    });

    test("should handle error recording for non-existent device", async () => {
      devicePool.recordDeviceError("non-existent");
      expect(devicePool.getTotalDeviceCount()).toBe(0);
    });
  });

  describe("statistics", () => {
    test("should return correct pool statistics", async () => {
      const deviceIds = ["emulator-5554", "emulator-5556", "emulator-5558"];
      await devicePool.initializeWithDevices(deviceIds);

      // Assign all 3 devices
      await devicePool.assignDeviceToSession("session-1");
      await devicePool.assignDeviceToSession("session-2");
      await devicePool.assignDeviceToSession("session-3");

      const stats = devicePool.getStats();
      expect(stats.total).toBe(3);
      expect(stats.idle).toBe(0);
      expect(stats.assigned).toBe(3);
      expect(stats.error).toBe(0);
    });
  });
});
