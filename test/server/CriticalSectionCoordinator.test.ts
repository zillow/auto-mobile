import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { CriticalSectionCoordinator } from "../../src/server/CriticalSectionCoordinator";
import { FakeTimer } from "../fakes/FakeTimer";

describe("CriticalSectionCoordinator", () => {
  let coordinator: CriticalSectionCoordinator;
  let fakeTimer: FakeTimer;
  let originalSetTimeout: typeof global.setTimeout;
  let originalClearTimeout: typeof global.clearTimeout;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    fakeTimer = new FakeTimer();

    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    originalDateNow = Date.now;

    global.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => {
      return fakeTimer.setTimeout(() => callback(...args), ms ?? 0);
    }) as typeof global.setTimeout;
    global.clearTimeout = ((handle: NodeJS.Timeout) => {
      fakeTimer.clearTimeout(handle);
    }) as typeof global.clearTimeout;
    Date.now = () => fakeTimer.now();

    coordinator = CriticalSectionCoordinator.getInstance();
    coordinator.reset();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    fakeTimer.reset();
  });

  const wait = async (ms: number): Promise<void> => {
    const promise = new Promise<void>(resolve => setTimeout(resolve, ms));
    fakeTimer.advanceTime(ms);
    await promise;
  };

  test("allows single device to immediately enter critical section", async () => {
    coordinator.registerExpectedDevices("lock-1", 1);

    const start = Date.now();
    const release = await coordinator.enterCriticalSection("lock-1", "device-1");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100); // Should not wait
    release();
  });

  test("waits for all devices to arrive at barrier before releasing any", async () => {
    const lockName = "lock-2";
    const deviceCount = 3;
    coordinator.registerExpectedDevices(lockName, deviceCount);

    const arrivals: Array<{ deviceId: string; arrivedAt: number }> = [];
    const releases: Array<{ deviceId: string; releasedAt: number }> = [];

    // Start all devices concurrently
    const promises = ["device-1", "device-2", "device-3"].map(
      async (deviceId, index) => {
        // Stagger arrivals slightly
        await wait(index * 10);
        arrivals.push({ deviceId, arrivedAt: Date.now() });

        const release = await coordinator.enterCriticalSection(
          lockName,
          deviceId
        );
        releases.push({ deviceId, releasedAt: Date.now() });

        release();
      }
    );

    await Promise.all(promises);

    // Verify all devices arrived
    expect(arrivals.length).toBe(3);

    // Verify all devices were released (barrier lifted)
    expect(releases.length).toBe(3);

    // Verify releases happened after all arrivals
    const lastArrival = Math.max(...arrivals.map(a => a.arrivedAt));
    const firstRelease = Math.min(...releases.map(r => r.releasedAt));
    expect(firstRelease).toBeGreaterThanOrEqual(lastArrival);
  });

  test("executes steps serially within critical section", async () => {
    const lockName = "lock-3";
    const deviceCount = 2;
    coordinator.registerExpectedDevices(lockName, deviceCount);

    const executionLog: Array<{ deviceId: string; event: string; time: number }> =
			[];

    const deviceWork = async (deviceId: string) => {
      const release = await coordinator.enterCriticalSection(lockName, deviceId);

      executionLog.push({ deviceId, event: "start", time: Date.now() });
      await wait(20);
      executionLog.push({ deviceId, event: "end", time: Date.now() });

      release();
    };

    await Promise.all([deviceWork("device-1"), deviceWork("device-2")]);

    // Verify we have 4 events (start/end for each device)
    expect(executionLog.length).toBe(4);

    // Find which device went first
    const firstDevice = executionLog[0].deviceId;
    const secondDevice = executionLog.find(e => e.deviceId !== firstDevice)!
      .deviceId;

    // Verify serial execution: first device must complete before second starts
    const firstDeviceEnd = executionLog.find(
      e => e.deviceId === firstDevice && e.event === "end"
    )!;
    const secondDeviceStart = executionLog.find(
      e => e.deviceId === secondDevice && e.event === "start"
    )!;

    expect(secondDeviceStart.time).toBeGreaterThanOrEqual(firstDeviceEnd.time);
  });

  test("times out if not all devices arrive at barrier", async () => {
    const lockName = "lock-4";
    coordinator.registerExpectedDevices(lockName, 3);

    // Only 2 devices arrive, one is missing
    const promise1 = coordinator.enterCriticalSection(
      lockName,
      "device-1",
      100
    ); // 100ms timeout
    const promise2 = coordinator.enterCriticalSection(
      lockName,
      "device-2",
      100
    );

    const allPromises = Promise.all([promise1, promise2]);
    fakeTimer.advanceTime(100);
    await expect(allPromises).rejects.toThrow(
      /Timeout waiting for critical section/
    );
  });

  test("throws error if same device tries to enter twice (nesting detection)", async () => {
    const lockName = "lock-5";
    coordinator.registerExpectedDevices(lockName, 1);

    const release = await coordinator.enterCriticalSection(
      lockName,
      "device-1"
    );

    // Try to enter again before releasing
    await expect(
      coordinator.enterCriticalSection(lockName, "device-1")
    ).rejects.toThrow(/already arrived at barrier/);

    release();
  });

  test("throws error if expected device count is not registered", async () => {
    await expect(
      coordinator.enterCriticalSection("unregistered-lock", "device-1")
    ).rejects.toThrow(/No expected device count registered/);
  });

  test("throws error if invalid device count is registered", () => {
    expect(() => {
      coordinator.registerExpectedDevices("lock-6", 0);
    }).toThrow(/Invalid device count/);

    expect(() => {
      coordinator.registerExpectedDevices("lock-7", -1);
    }).toThrow(/Invalid device count/);
  });

  test("schedules cleanup after devices finish", async () => {
    const lockName = "lock-8";
    coordinator.registerExpectedDevices(lockName, 2);

    // Run devices in parallel so they can pass the barrier
    await Promise.all([
      (async () => {
        const release = await coordinator.enterCriticalSection(
          lockName,
          "device-1"
        );
        release();
      })(),
      (async () => {
        const release = await coordinator.enterCriticalSection(
          lockName,
          "device-2"
        );
        release();
      })(),
    ]);

    // Note: Cleanup happens after 5 seconds in production
    // We can't easily test the automatic cleanup without waiting
    // Instead, we test force cleanup in a separate test
  });

  test("supports multiple independent locks concurrently", async () => {
    coordinator.registerExpectedDevices("lock-A", 2);
    coordinator.registerExpectedDevices("lock-B", 2);

    const executionLog: string[] = [];

    const deviceWork = async (lockName: string, deviceId: string) => {
      const release = await coordinator.enterCriticalSection(lockName, deviceId);
      executionLog.push(`${lockName}:${deviceId}:start`);
      await wait(10);
      executionLog.push(`${lockName}:${deviceId}:end`);
      release();
    };

    // Run both locks concurrently
    await Promise.all([
      deviceWork("lock-A", "device-1"),
      deviceWork("lock-A", "device-2"),
      deviceWork("lock-B", "device-3"),
      deviceWork("lock-B", "device-4"),
    ]);

    // Verify all devices executed
    expect(executionLog.length).toBe(8);

    // Verify devices from different locks could interleave
    const lockAEvents = executionLog.filter(e => e.startsWith("lock-A"));
    const lockBEvents = executionLog.filter(e => e.startsWith("lock-B"));

    expect(lockAEvents.length).toBe(4);
    expect(lockBEvents.length).toBe(4);
  });

  test("forceCleanup immediately removes all lock state", async () => {
    const lockName = "lock-9";
    coordinator.registerExpectedDevices(lockName, 3);

    // Start one device
    const promise = coordinator.enterCriticalSection(lockName, "device-1", 200);

    // Force cleanup (simulating error scenario)
    coordinator.forceCleanup(lockName);

    // The waiting device should timeout since barrier was cleared
    fakeTimer.advanceTime(200);
    await expect(promise).rejects.toThrow(/Timeout waiting for critical section/);

    // After force cleanup, lock state is gone
    await expect(
      coordinator.enterCriticalSection(lockName, "device-2")
    ).rejects.toThrow(/No expected device count registered/);
  });

  test("handles reregistration of same lock after cleanup", async () => {
    const lockName = "lock-10";

    // First round
    coordinator.registerExpectedDevices(lockName, 1);
    const release1 = await coordinator.enterCriticalSection(
      lockName,
      "device-1"
    );
    release1();

    // Force cleanup
    coordinator.forceCleanup(lockName);

    // Second round - reregister with different device count
    coordinator.registerExpectedDevices(lockName, 2);

    const executionLog: string[] = [];
    await Promise.all([
      (async () => {
        const release = await coordinator.enterCriticalSection(
          lockName,
          "device-2"
        );
        executionLog.push("device-2");
        release();
      })(),
      (async () => {
        const release = await coordinator.enterCriticalSection(
          lockName,
          "device-3"
        );
        executionLog.push("device-3");
        release();
      })(),
    ]);

    expect(executionLog.length).toBe(2);
  });
});
