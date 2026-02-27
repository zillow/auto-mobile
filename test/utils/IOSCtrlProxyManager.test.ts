import { beforeEach, describe, expect, test } from "bun:test";
import { IOSCtrlProxyManager } from "../../src/utils/IOSCtrlProxyManager";
import { BootedDevice } from "../../src/models";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeIOSCtrlProxyManager } from "../fakes/FakeIOSCtrlProxyManager";
import { FakeProcessExecutor } from "../fakes/FakeProcessExecutor";
import { FakeChildProcess } from "../fakes/FakeChildProcess";
import type { ExecResult } from "../../src/models";
import { PortManager } from "../../src/utils/PortManager";

describe("IOSCtrlProxyManager", function() {
  let testDevice: BootedDevice;
  let fakeTimer: FakeTimer;

  beforeEach(function() {
    fakeTimer = new FakeTimer();

    // Create test device (iOS simulator format - UUID)
    testDevice = {
      deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
      platform: "ios",
      name: "iPhone 16 Simulator"
    };

    // Reset singleton instances
    IOSCtrlProxyManager.resetInstances();
    PortManager.reset();
  });

  describe("getInstance", function() {
    test("should return same instance for same device", function() {
      const instance1 = IOSCtrlProxyManager.getInstance(testDevice);
      const instance2 = IOSCtrlProxyManager.getInstance(testDevice);

      expect(instance1).toBe(instance2);
    });

    test("should return different instances for different devices", function() {
      const device2: BootedDevice = {
        deviceId: "B2C3D4E5-F6A7-8901-BCDE-F12345678901",
        platform: "ios",
        name: "iPad Simulator"
      };

      const instance1 = IOSCtrlProxyManager.getInstance(testDevice);
      const instance2 = IOSCtrlProxyManager.getInstance(device2);

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("getServicePort", function() {
    test("should return default port 8765", function() {
      const manager = IOSCtrlProxyManager.getInstance(testDevice);
      expect(manager.getServicePort()).toBe(8765);
    });
  });

  describe("getCapabilities", function() {
    test("should identify simulator device type for UUID format deviceId", async function() {
      const manager = IOSCtrlProxyManager.createForTesting(testDevice, fakeTimer);
      const capabilities = await manager.getCapabilities();

      expect(capabilities.deviceType).toBe("simulator");
      expect(capabilities.supportsXCTest).toBe(true);
    });

    test("should identify physical device type for non-UUID format deviceId", async function() {
      const physicalDevice: BootedDevice = {
        deviceId: "00008030001E28C11E", // Physical device serial number format
        platform: "ios",
        name: "iPhone"
      };

      const manager = IOSCtrlProxyManager.createForTesting(physicalDevice, fakeTimer);
      const capabilities = await manager.getCapabilities();

      expect(capabilities.deviceType).toBe("physical");
      expect(capabilities.supportsXCTest).toBe(true);
    });
  });

  describe("clearCaches", function() {
    test("should clear all cached state", function() {
      const manager = IOSCtrlProxyManager.getInstance(testDevice);

      // This should not throw
      manager.clearCaches();
    });
  });

  describe("resetSetupState", function() {
    test("should reset setup state and clear caches", function() {
      const manager = IOSCtrlProxyManager.getInstance(testDevice);

      // This should not throw
      manager.resetSetupState();
    });
  });

  describe("iproxy tunnel", function() {
    let physicalDevice: BootedDevice;
    let fakeExecutor: FakeProcessExecutor;

    beforeEach(function() {
      physicalDevice = {
        deviceId: "00008030001E28C11E",
        platform: "ios",
        name: "iPhone"
      };
      fakeExecutor = new FakeProcessExecutor();
      fakeExecutor.setCommandResponse("idevice_id -l", createExecResult(`${physicalDevice.deviceId}\n`, ""));
      fakeExecutor.setCommandResponse("curl -s", createExecResult("", ""));
    });

    test("starts iproxy for physical devices with device-specific port", async function() {
      const fakeProcess = new FakeChildProcess();
      fakeExecutor.setNextSpawnProcess(fakeProcess);
      const manager = IOSCtrlProxyManager.createForTestingWithDeps(
        physicalDevice,
        fakeTimer,
        undefined,
        fakeExecutor
      );

      await (manager as unknown as { startIproxyTunnel: () => Promise<void> }).startIproxyTunnel();

      const spawns = fakeExecutor.getSpawnedProcesses();
      expect(spawns.length).toBe(1);
      expect(spawns[0].command).toBe("iproxy");
      expect(spawns[0].args).toEqual([
        String(manager.getServicePort()),
        String(manager.getServicePort()),
        physicalDevice.deviceId
      ]);
    });

    test("restarts iproxy after unexpected exit", async function() {
      const fakeProcess = new FakeChildProcess();
      fakeExecutor.setNextSpawnProcess(fakeProcess);
      const manager = IOSCtrlProxyManager.createForTestingWithDeps(
        physicalDevice,
        fakeTimer,
        undefined,
        fakeExecutor
      );

      await (manager as unknown as { startIproxyTunnel: () => Promise<void> }).startIproxyTunnel();

      fakeProcess.emit("exit", 1, null);
      fakeTimer.advanceTime(1000);
      await Promise.resolve();

      expect(fakeExecutor.getSpawnedProcesses().length).toBe(2);
    });
  });

  describe("restart prevention", function() {
    let physicalDevice: BootedDevice;
    let fakeExecutor: FakeProcessExecutor;

    beforeEach(function() {
      physicalDevice = {
        deviceId: "00008030001E28C11E",
        platform: "ios",
        name: "iPhone"
      };
      fakeExecutor = new FakeProcessExecutor();
    });

    test("start() skips spawning when tracked CtrlProxy PID is alive (simulator)", async function() {
      const manager = IOSCtrlProxyManager.createForTestingWithDeps(
        testDevice, // simulator UUID
        fakeTimer,
        undefined,
        fakeExecutor
      );

      // Simulate an already-tracked process (as if startOnSimulator ran previously)
      (manager as unknown as { xcTestProcessId: number }).xcTestProcessId = 12345;

      // Health check fails (CtrlProxy appears busy/unresponsive) — this used to trigger a restart
      fakeExecutor.setCommandResponse("curl -s", createExecResult("", ""));
      // kill -0 succeeds by default (FakeProcessExecutor never throws) → process alive

      fakeTimer.enableAutoAdvance();
      await manager.start();

      // Process is alive → no simctl spawn or exec for starting the binary
      expect(fakeExecutor.wasCommandExecuted("simctl")).toBe(false);
      expect(fakeExecutor.getSpawnedProcesses().length).toBe(0);
    });

    test("start() re-establishes iproxy tunnel when CtrlProxy is alive but tunnel is gone (physical device)", async function() {
      fakeExecutor.setCommandResponse("idevice_id -l", createExecResult(`${physicalDevice.deviceId}\n`, ""));

      const fakeProcess = new FakeChildProcess();
      fakeExecutor.setNextSpawnProcess(fakeProcess);

      const manager = IOSCtrlProxyManager.createForTestingWithDeps(
        physicalDevice,
        fakeTimer,
        undefined,
        fakeExecutor
      );

      // Simulate: CtrlProxy process is alive but iproxy tunnel was stopped
      (manager as unknown as { xcTestProcessId: number }).xcTestProcessId = 12345;
      // iproxyProcessId is null → tunnel is gone

      fakeTimer.enableAutoAdvance();
      await manager.start();

      // iproxy should have been (re-)spawned even though CtrlProxy was alive
      expect(fakeExecutor.getSpawnedProcesses().length).toBe(1);
      expect(fakeExecutor.getSpawnedProcesses()[0].command).toBe("iproxy");
    });

    test("startProcessMonitoring uses the injected timer so tests can control it", function() {
      const manager = IOSCtrlProxyManager.createForTestingWithDeps(
        testDevice,
        fakeTimer,
        undefined,
        fakeExecutor
      );

      expect(fakeTimer.getPendingIntervals().length).toBe(0);

      (manager as unknown as { startProcessMonitoring: () => void }).startProcessMonitoring();

      expect(fakeTimer.getPendingIntervals().length).toBe(1);
      expect(fakeTimer.getPendingIntervals()[0]).toBe(30000);
    });

    describe("iproxy monitor uses process liveness not health endpoint", function() {
      beforeEach(function() {
        fakeExecutor.setCommandResponse("idevice_id -l", createExecResult(`${physicalDevice.deviceId}\n`, ""));
      });

      test("does not restart iproxy when process is alive even if health check fails", async function() {
        const fakeProcess = new FakeChildProcess();
        fakeExecutor.setNextSpawnProcess(fakeProcess);
        const manager = IOSCtrlProxyManager.createForTestingWithDeps(
          physicalDevice, fakeTimer, undefined, fakeExecutor
        );

        await (manager as unknown as { startIproxyTunnel: () => Promise<void> }).startIproxyTunnel();
        expect(fakeExecutor.getSpawnedProcesses().length).toBe(1);

        // Health endpoint fails (would have triggered restart in old code)
        fakeExecutor.setCommandResponse("curl -s", createExecResult("", ""));
        // kill -0 succeeds by default → iproxy process alive

        (manager as unknown as { startIproxyMonitoring: () => void }).startIproxyMonitoring();

        // Fire one monitor interval
        fakeTimer.advanceTime(5000);
        for (let i = 0; i < 5; i++) {await Promise.resolve();}

        // iproxy is alive → no restart scheduled
        expect(fakeExecutor.getSpawnedProcesses().length).toBe(1);
      });

      test("restarts iproxy when iproxyProcessId is null (process gone)", async function() {
        const fakeProcess1 = new FakeChildProcess();
        const fakeProcess2 = new FakeChildProcess();
        fakeExecutor.setNextSpawnProcess(fakeProcess1);
        const manager = IOSCtrlProxyManager.createForTestingWithDeps(
          physicalDevice, fakeTimer, undefined, fakeExecutor
        );

        await (manager as unknown as { startIproxyTunnel: () => Promise<void> }).startIproxyTunnel();

        // Simulate iproxy process dying between monitor ticks (clears tracking state)
        (manager as unknown as { iproxyProcessId: null }).iproxyProcessId = null;
        (manager as unknown as { iproxyProcess: null }).iproxyProcess = null;

        fakeExecutor.setNextSpawnProcess(fakeProcess2);

        (manager as unknown as { startIproxyMonitoring: () => void }).startIproxyMonitoring();

        // Fire monitor — sees no tracked process → schedules restart
        fakeTimer.advanceTime(5000);
        for (let i = 0; i < 5; i++) {await Promise.resolve();}

        // Fire restart timer (first attempt = 1000 ms base delay)
        fakeTimer.advanceTime(1000);
        for (let i = 0; i < 5; i++) {await Promise.resolve();}

        expect(fakeExecutor.getSpawnedProcesses().length).toBe(2);
      });

      test("resumes iproxy monitoring after scheduled restart completes", async function() {
        const fakeProcess1 = new FakeChildProcess();
        const fakeProcess2 = new FakeChildProcess();
        fakeExecutor.setNextSpawnProcess(fakeProcess1);
        const manager = IOSCtrlProxyManager.createForTestingWithDeps(
          physicalDevice, fakeTimer, undefined, fakeExecutor
        );

        await (manager as unknown as { startIproxyTunnel: () => Promise<void> }).startIproxyTunnel();

        // Process exit triggers scheduleIproxyRestart
        fakeProcess1.emit("exit", 1, null);

        fakeExecutor.setNextSpawnProcess(fakeProcess2);

        // Fire restart timer (1000 ms base delay for first attempt)
        fakeTimer.advanceTime(1000);
        for (let i = 0; i < 5; i++) {await Promise.resolve();}

        // After restart, startIproxyMonitoring() should have been called → new interval pending
        expect(fakeTimer.getPendingIntervals().length).toBe(1);
      });
    });
  });
});

function createExecResult(stdout: string, stderr: string): ExecResult {
  return {
    stdout,
    stderr,
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (searchString: string) => stdout.includes(searchString)
  };
}

describe("FakeIOSCtrlProxyManager", function() {
  let fakeManager: FakeIOSCtrlProxyManager;

  beforeEach(function() {
    fakeManager = new FakeIOSCtrlProxyManager();
  });

  describe("state configuration", function() {
    test("should configure installed state", async function() {
      expect(await fakeManager.isInstalled()).toBe(false);

      fakeManager.setInstalled(true);
      expect(await fakeManager.isInstalled()).toBe(true);
    });

    test("should configure running state", async function() {
      expect(await fakeManager.isRunning()).toBe(false);

      fakeManager.setRunning(true);
      expect(await fakeManager.isRunning()).toBe(true);
    });

    test("should configure available state", async function() {
      expect(await fakeManager.isAvailable()).toBe(false);

      fakeManager.setAvailable(true);
      expect(await fakeManager.isAvailable()).toBe(true);
    });
  });

  describe("operation tracking", function() {
    test("should track isInstalled calls", async function() {
      await fakeManager.isInstalled();
      await fakeManager.isInstalled();

      expect(fakeManager.wasMethodCalled("isInstalled")).toBe(true);
      expect(fakeManager.getCallCount("isInstalled")).toBe(2);
    });

    test("should track isRunning calls", async function() {
      await fakeManager.isRunning();

      expect(fakeManager.wasMethodCalled("isRunning")).toBe(true);
      expect(fakeManager.getCallCount("isRunning")).toBe(1);
    });

    test("should track setup calls with force parameter", async function() {
      await fakeManager.setup(false);
      await fakeManager.setup(true);

      const operations = fakeManager.getExecutedOperations();
      expect(operations).toContain("setup:force=false");
      expect(operations).toContain("setup:force=true");
    });

    test("should clear history", async function() {
      await fakeManager.isInstalled();
      await fakeManager.isRunning();

      expect(fakeManager.getExecutedOperations().length).toBe(2);

      fakeManager.clearHistory();
      expect(fakeManager.getExecutedOperations().length).toBe(0);
    });
  });

  describe("start and stop", function() {
    test("should set running state on start", async function() {
      expect(await fakeManager.isRunning()).toBe(false);

      await fakeManager.start();
      expect(await fakeManager.isRunning()).toBe(true);
      expect(fakeManager.wasMethodCalled("start")).toBe(true);
    });

    test("should clear running state on stop", async function() {
      fakeManager.setRunning(true);
      expect(await fakeManager.isRunning()).toBe(true);

      await fakeManager.stop();
      expect(await fakeManager.isRunning()).toBe(false);
      expect(fakeManager.wasMethodCalled("stop")).toBe(true);
    });

    test("should fail start when configured to fail", async function() {
      fakeManager.setStartShouldFail(true);

      await expect(fakeManager.start()).rejects.toThrow("Failed to start IOSCtrlProxy");
    });

    test("should fail stop when configured to fail", async function() {
      fakeManager.setStopShouldFail(true);

      await expect(fakeManager.stop()).rejects.toThrow("Failed to stop IOSCtrlProxy");
    });
  });

  describe("setup", function() {
    test("should return success when service starts", async function() {
      const result = await fakeManager.setup();

      expect(result.success).toBe(true);
      expect(result.message).toBe("IOSCtrlProxy started successfully");
    });

    test("should return already running message when service is running", async function() {
      fakeManager.setRunning(true);

      const result = await fakeManager.setup(false);

      expect(result.success).toBe(true);
      expect(result.message).toBe("IOSCtrlProxy was already running");
    });

    test("should force restart even when running", async function() {
      fakeManager.setRunning(true);

      const result = await fakeManager.setup(true);

      expect(result.success).toBe(true);
      expect(result.message).toBe("IOSCtrlProxy started successfully");
    });

    test("should return failure when setup fails", async function() {
      fakeManager.setSetupShouldFail(true);

      const result = await fakeManager.setup();

      expect(result.success).toBe(false);
      expect(result.message).toBe("Failed to setup IOSCtrlProxy");
      expect(result.error).toBe("Mock setup failure");
    });
  });

  describe("getServicePort", function() {
    test("should return default port", function() {
      expect(fakeManager.getServicePort()).toBe(8765);
    });

    test("should return configured port", function() {
      fakeManager.setServicePort(9999);
      expect(fakeManager.getServicePort()).toBe(9999);
    });
  });
});
