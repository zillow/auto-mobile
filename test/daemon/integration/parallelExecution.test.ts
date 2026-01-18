import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { SessionManager } from "../../../src/daemon/sessionManager";
import { DevicePool } from "../../../src/daemon/devicePool";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeInstalledAppsRepository } from "../../fakes/FakeInstalledAppsRepository";
import { BootedDevice } from "../../../src/models";

describe("Parallel Execution Across Multiple Devices", function() {
  let sessionManager: SessionManager;
  let devicePool: DevicePool;
  let fakeTimer: FakeTimer;
  let fakeAppsRepo: FakeInstalledAppsRepository;
  const createBootedDevice = (deviceId: string): BootedDevice => ({
    name: deviceId,
    platform: "android",
    deviceId
  });

  beforeEach(async function() {
    sessionManager = new SessionManager();
    fakeTimer = new FakeTimer();
    fakeAppsRepo = new FakeInstalledAppsRepository();
    devicePool = new DevicePool(sessionManager, "test-daemon-session-id", fakeTimer, fakeAppsRepo);
    await devicePool.initializeWithDevices([
      createBootedDevice("device-1"),
      createBootedDevice("device-2"),
      createBootedDevice("device-3")
    ]);
  });

  afterEach(function() {
    sessionManager.stopCleanupTimer();
  });

  describe("Multiple Concurrent Sessions", function() {
    test("should assign different devices to different sessions", async function() {
      // Create three concurrent sessions
      const session1Id = "session-uuid-1";
      const session2Id = "session-uuid-2";
      const session3Id = "session-uuid-3";

      // Assign devices to sessions
      const device1 = await devicePool.assignDeviceToSession(session1Id);
      const device2 = await devicePool.assignDeviceToSession(session2Id);
      const device3 = await devicePool.assignDeviceToSession(session3Id);

      // Verify each session got a unique device
      expect(device1).not.toBe(device2);
      expect(device2).not.toBe(device3);
      expect(device1).not.toBe(device3);

      // Verify the devices are from our pool
      expect(["device-1", "device-2", "device-3"]).toContain(device1);
      expect(["device-1", "device-2", "device-3"]).toContain(device2);
      expect(["device-1", "device-2", "device-3"]).toContain(device3);
    });

    test("should respect max concurrent sessions equal to device count", async function() {
      // Create three sessions (matching the three devices)
      const session1Id = "session-uuid-1";
      const session2Id = "session-uuid-2";
      const session3Id = "session-uuid-3";

      await devicePool.assignDeviceToSession(session1Id);
      await devicePool.assignDeviceToSession(session2Id);
      await devicePool.assignDeviceToSession(session3Id);

      // Verify all devices are now busy
      expect(devicePool.getAvailableDeviceCount()).toBe(0);
      expect(devicePool.getAssignedDevices().length).toBe(3);
    });

    test("should throw error when exceeding device capacity after timeout", async function() {
      // Use manual mode so we can control time advancement
      fakeTimer.setManualMode();

      // Assign devices to all three sessions
      const session1Id = "session-uuid-1";
      const session2Id = "session-uuid-2";
      const session3Id = "session-uuid-3";
      const session4Id = "session-uuid-4";

      await devicePool.assignDeviceToSession(session1Id);
      await devicePool.assignDeviceToSession(session2Id);
      await devicePool.assignDeviceToSession(session3Id);

      // Attempting a fourth session should wait, then fail after timeout
      let error: Error | null = null;
      const assignPromise = devicePool.assignDeviceToSession(session4Id).catch(e => {
        error = e as Error;
      });

      // Advance time past the 60 second timeout with multiple iterations
      for (let i = 0; i < 70; i++) {
        fakeTimer.advanceTime(1000);
        await new Promise(resolve => setImmediate(resolve));
        if (error) {break;}
      }

      await assignPromise;

      expect(error).not.toBeNull();
      expect(error!.message).toContain("Timed out waiting for device");
    });
  });

  describe("Session Lifecycle with Device Reuse", function() {
    test("should reuse just-released device when others are idle", async function() {
      const session1Id = "session-uuid-1";
      const session2Id = "session-uuid-2";

      // Assign device to first session
      const device1 = await devicePool.assignDeviceToSession(session1Id);

      // Release first session
      await devicePool.releaseDevice(device1);

      const deviceIds = ["device-1", "device-2", "device-3"];
      const releasedDevice = devicePool.getDevice(device1);
      const otherDevices = deviceIds.filter(id => id !== device1);
      const firstOtherDevice = devicePool.getDevice(otherDevices[0]);
      const secondOtherDevice = otherDevices[1] ? devicePool.getDevice(otherDevices[1]) : null;

      if (releasedDevice) {
        releasedDevice.lastUsedAt = 3000;
      }
      if (firstOtherDevice) {
        firstOtherDevice.lastUsedAt = 1000;
      }
      if (secondOtherDevice) {
        secondOtherDevice.lastUsedAt = 2000;
      }

      // Assign device to second session - should reuse just released device
      const device2 = await devicePool.assignDeviceToSession(session2Id);

      expect(device2).toBe(device1);
    });

    test("should handle rapid session creation and release cycles", async function() {
      const numberOfCycles = 5;

      for (let i = 0; i < numberOfCycles; i++) {
        // Create three sessions
        const session1Id = `session-uuid-1-cycle-${i}`;
        const session2Id = `session-uuid-2-cycle-${i}`;
        const session3Id = `session-uuid-3-cycle-${i}`;

        const device1 = await devicePool.assignDeviceToSession(session1Id);
        const device2 = await devicePool.assignDeviceToSession(session2Id);
        const device3 = await devicePool.assignDeviceToSession(session3Id);

        // Verify all devices are assigned
        expect(devicePool.getAvailableDeviceCount()).toBe(0);

        // Release all devices
        await devicePool.releaseDevice(device1);
        await devicePool.releaseDevice(device2);
        await devicePool.releaseDevice(device3);

        // Verify all devices are back to idle
        expect(devicePool.getAvailableDeviceCount()).toBe(3);
      }

      // Verify statistics after cycles
      const stats = devicePool.getStats();
      expect(stats.idle).toBe(3);
      expect(stats.assigned).toBe(0);
      // Each device should have been used multiple times
      expect(stats.avgAssignments).toBeGreaterThan(0);
    });
  });

  describe("Session Isolation", function() {
    test("should maintain separate cache per session", async function() {
      const session1Id = "session-uuid-1";
      const session2Id = "session-uuid-2";

      // Create two sessions
      await devicePool.assignDeviceToSession(session1Id);
      await devicePool.assignDeviceToSession(session2Id);

      // Set different cache data for each session
      sessionManager.updateSessionCache(session1Id, {
        lastHierarchy: "hierarchy-session-1",
        lastScreenshot: "screenshot-session-1",
      });

      sessionManager.updateSessionCache(session2Id, {
        lastHierarchy: "hierarchy-session-2",
        lastScreenshot: "screenshot-session-2",
      });

      // Verify each session has its own cache
      const cache1 = sessionManager.getSessionCache(session1Id);
      const cache2 = sessionManager.getSessionCache(session2Id);

      expect(cache1?.lastHierarchy).toBe("hierarchy-session-1");
      expect(cache1?.lastScreenshot).toBe("screenshot-session-1");
      expect(cache2?.lastHierarchy).toBe("hierarchy-session-2");
      expect(cache2?.lastScreenshot).toBe("screenshot-session-2");

      // Verify caches are different
      expect(cache1?.lastHierarchy).not.toBe(cache2?.lastHierarchy);
      expect(cache1?.lastScreenshot).not.toBe(cache2?.lastScreenshot);
    });

    test("should ensure device assignment persistence across session operations", async function() {
      const sessionId = "session-uuid-persistence-test";

      // Assign device to session
      const assignedDevice = await devicePool.assignDeviceToSession(sessionId);

      // Get device multiple times - should always return same device
      const device1 = sessionManager.getDeviceForSession(sessionId);
      const device2 = devicePool.getDeviceForSession(sessionId);

      expect(device1).toBe(assignedDevice);
      expect(device2?.id).toBe(assignedDevice);

      // Update cache and verify device assignment persists
      sessionManager.updateSessionCache(sessionId, {
        lastHierarchy: "test-hierarchy",
      });

      const device3 = sessionManager.getDeviceForSession(sessionId);
      expect(device3).toBe(assignedDevice);

      // Release and verify device is removed
      await devicePool.releaseDevice(assignedDevice);
      const device4 = devicePool.getDeviceForSession(sessionId);
      expect(device4).toBeNull();
    });
  });

  describe("Parallel Execution Simulation", function() {
    test("should handle parallel session creation with Promise.all", async function() {
      const sessionIds = [
        "session-parallel-1",
        "session-parallel-2",
        "session-parallel-3",
      ];

      // Create all sessions in parallel
      const assignmentPromises = sessionIds.map(sessionId =>
        devicePool.assignDeviceToSession(sessionId)
      );

      const assignedDevices = await Promise.all(assignmentPromises);

      // Verify all sessions got unique devices
      expect(assignedDevices.length).toBe(3);
      expect(new Set(assignedDevices).size).toBe(3); // All unique

      // Verify all devices are assigned
      expect(devicePool.getAvailableDeviceCount()).toBe(0);
      expect(devicePool.getAssignedDevices().length).toBe(3);

      // Verify each session has correct device
      for (let i = 0; i < sessionIds.length; i++) {
        const sessionDevice = sessionManager.getDeviceForSession(sessionIds[i]);
        expect(sessionDevice).toBe(assignedDevices[i]);
      }

      // Release all in parallel
      const releasePromises = assignedDevices.map(deviceId =>
        devicePool.releaseDevice(deviceId)
      );

      await Promise.all(releasePromises);

      // Verify all devices are available again
      expect(devicePool.getAvailableDeviceCount()).toBe(3);
      expect(devicePool.getAssignedDevices().length).toBe(0);
    });
  });
});
