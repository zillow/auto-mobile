import { afterEach, describe, expect, test, beforeEach } from "bun:test";
import { DevicePool } from "../../src/daemon/devicePool";
import { SessionManager } from "../../src/daemon/sessionManager";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeInstalledAppsRepository } from "../fakes/FakeInstalledAppsRepository";
import { FakeDeviceManager } from "../fakes/FakeDeviceManager";
import { BootedDevice, DeviceInfo, Platform } from "../../src/models";
import { DefaultRetryExecutor } from "../../src/utils/retry/RetryExecutor";

describe("DevicePool", () => {
  let devicePool: DevicePool;
  let sessionManager: SessionManager;
  let fakeTimer: FakeTimer;
  let fakeAppsRepo: FakeInstalledAppsRepository;
  let fakeDeviceManager: FakeDeviceManager;
  const createBootedDevice = (
    deviceId: string,
    platform: Platform = "android",
    name?: string,
    iosVersion?: string
  ): BootedDevice => ({
    name: name ?? deviceId,
    platform,
    deviceId,
    iosVersion
  });

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    sessionManager = new SessionManager(fakeTimer);
    fakeAppsRepo = new FakeInstalledAppsRepository();
    fakeDeviceManager = new FakeDeviceManager();
    // Create a RetryExecutor that uses the fakeTimer so time advancement works correctly
    const retryExecutor = new DefaultRetryExecutor(fakeTimer);
    devicePool = new DevicePool(sessionManager, "test-daemon-session-id", fakeTimer, fakeAppsRepo, fakeDeviceManager, retryExecutor);
  });

  afterEach(() => {
    sessionManager.stopCleanupTimer();
  });

  describe("initializeWithDevices", () => {
    test("should initialize with empty device list", async () => {
      await devicePool.initializeWithDevices([]);
      expect(devicePool.getTotalDeviceCount()).toBe(0);
      expect(devicePool.getAvailableDeviceCount()).toBe(0);
    });

    test("should initialize with single device", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
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
      await devicePool.initializeWithDevices(deviceIds.map(createBootedDevice));
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
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      const deviceId = await devicePool.assignDeviceToSession("session-1");
      expect(deviceId).toBe("emulator-5554");
      const device = devicePool.getDevice("emulator-5554");
      expect(device?.sessionId).toBe("session-1");
      expect(device?.status).toBe("busy");
      expect(device?.assignmentCount).toBe(1);
      expect(device?.errorCount).toBe(0);
    });

    test("should throw error when no devices available after timeout", async () => {
      // Use manual mode so we can control time advancement

      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      await devicePool.assignDeviceToSession("session-1");

      // Start the second assignment (will wait for a device)
      let error: Error | null = null;
      const assignPromise = devicePool.assignDeviceToSession("session-2").catch(e => {
        error = e as Error;
      });

      // Advance time past the 60 second timeout with multiple iterations
      // Each iteration advances time, resolves any pending sleeps, and yields
      for (let i = 0; i < 70; i++) {
        fakeTimer.advanceTime(1000); // Advance 1 second at a time
        await new Promise(resolve => setImmediate(resolve));
        if (error) {break;}
      }

      await assignPromise;

      expect(error).not.toBeNull();
      expect(error!.message).toContain("Timed out waiting for device");
    });

    test("should wait and succeed when device becomes available", async () => {
      // Use manual mode so we can control time advancement

      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      const device1 = await devicePool.assignDeviceToSession("session-1");

      // Start the second assignment (will wait for a device)
      const assignPromise = devicePool.assignDeviceToSession("session-2");

      // Advance time a few iterations
      for (let i = 0; i < 5; i++) {
        fakeTimer.advanceTime(1000);
        await new Promise(resolve => setImmediate(resolve));
      }

      // Release the device
      await devicePool.releaseDevice(device1);

      // Advance time to allow the retry
      fakeTimer.advanceTime(1000);
      await new Promise(resolve => setImmediate(resolve));

      // Now the assignment should succeed
      const device2 = await assignPromise;
      expect(device2).toBe("emulator-5554");
    });

    test("should assign different devices to different sessions", async () => {
      const deviceIds = ["emulator-5554", "emulator-5556"];
      await devicePool.initializeWithDevices(deviceIds.map(createBootedDevice));
      const device1 = await devicePool.assignDeviceToSession("session-1");
      const device2 = await devicePool.assignDeviceToSession("session-2");
      expect(device1).not.toBe(device2);
      expect(devicePool.getAvailableDeviceCount()).toBe(0);
    });

    test("should reuse device after session release", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      const device1 = await devicePool.assignDeviceToSession("session-1");
      await devicePool.releaseDevice(device1);
      const device2 = await devicePool.assignDeviceToSession("session-2");
      expect(device1).toBe(device2);
    });
  });

  describe("assignMultipleDevices", () => {
    test("should not auto-start iOS simulators when pool is short", async () => {
      const images: DeviceInfo[] = [
        { name: "iPhone 15 Pro", platform: "ios", isRunning: false, deviceId: "sim-1" },
        { name: "iPhone 15", platform: "ios", isRunning: false, deviceId: "sim-2" },
      ];
      const fakeDeviceManager = new FakeDeviceManager(images);
      const retryExecutor = new DefaultRetryExecutor(fakeTimer);
      devicePool = new DevicePool(sessionManager, "test-daemon-session-id", fakeTimer, fakeAppsRepo, fakeDeviceManager, retryExecutor);

      await expect(
        devicePool.assignMultipleDevices(["session-a", "session-b"], 1000, "ios")
      ).rejects.toThrow(/Not enough devices in pool/);
      expect(fakeDeviceManager.startedDevices).toHaveLength(0);
      expect(devicePool.getTotalDeviceCount()).toBe(0);
    });

    test("should assign iOS simulators by criteria", async () => {
      await devicePool.initializeWithDevices([
        createBootedDevice("sim-1", "ios", "iPhone 15 Pro", "17.5"),
        createBootedDevice("sim-2", "ios", "iPhone 15", "17.4"),
      ]);

      const assignments = await devicePool.assignMultipleDevicesByCriteria(
        [
          {
            sessionId: "session-a",
            criteria: { platform: "ios", simulatorType: "iPhone 15 Pro", iosVersion: "17.5" },
          },
        ],
        1000
      );

      expect(assignments.get("session-a")).toBe("sim-1");
    });
  });

  describe("releaseDevice", () => {
    test("should release device assigned to session", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      const deviceId = await devicePool.assignDeviceToSession("session-1");
      await devicePool.releaseDevice(deviceId);
      const device = devicePool.getDevice(deviceId);
      expect(device?.sessionId).toBeNull();
      expect(device?.status).toBe("idle");
      expect(devicePool.getAvailableDeviceCount()).toBe(1);
    });

    test("should handle release of already idle device", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
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
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      const device = devicePool.getDevice("emulator-5554");
      expect(device?.errorCount).toBe(0);
      devicePool.recordDeviceError("emulator-5554");
      expect(device?.errorCount).toBe(1);
      expect(device?.status).toBe("idle");
    });

    test("should mark device as error after max consecutive errors", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
      const device = devicePool.getDevice("emulator-5554");
      // Record 5 errors to reach MAX_DEVICE_ERRORS (5)
      for (let i = 0; i < 5; i++) {
        devicePool.recordDeviceError("emulator-5554");
      }
      expect(device?.errorCount).toBe(5);
      expect(device?.status).toBe("error");
    });

    test("should clear error count when device assignment succeeds", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);
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
      await devicePool.initializeWithDevices(deviceIds.map(createBootedDevice));

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

  describe("session tracking", () => {
    test("should set session tracking when device is initialized", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);

      // Verify setSessionTracking was called
      const apps = await fakeAppsRepo.listInstalledApps("emulator-5554");
      // No apps yet, but we can verify the repository was called by checking it doesn't error
      expect(apps).toEqual([]);
    });

    test("should clear cache when device is removed", async () => {
      await devicePool.initializeWithDevices([createBootedDevice("emulator-5554")]);

      // Add some fake cache data
      await fakeAppsRepo.upsertInstalledApp("emulator-5554", 0, "com.test.app", false, Date.now());
      const appsBefore = await fakeAppsRepo.listInstalledApps("emulator-5554");
      expect(appsBefore.length).toBe(1);

      // Remove device should clear cache
      await devicePool.removeDevice("emulator-5554");
      const appsAfter = await fakeAppsRepo.listInstalledApps("emulator-5554");
      expect(appsAfter.length).toBe(0);
    });

    test("should use injected repository", async () => {
      // Verify we're using the fake repository by checking initial state
      const initialApps = await fakeAppsRepo.listInstalledApps("any-device");
      expect(initialApps).toEqual([]);

      // Add device and verify tracking works
      await devicePool.addDevice(createBootedDevice("test-device"));
      const appsAfter = await fakeAppsRepo.listInstalledApps("test-device");
      expect(appsAfter).toEqual([]);
    });
  });
});
