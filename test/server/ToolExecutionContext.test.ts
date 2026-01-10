import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SessionManager } from "../../src/daemon/sessionManager";
import { DevicePool } from "../../src/daemon/devicePool";
import { createToolExecutionContext } from "../../src/server/ToolExecutionContext";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";

describe("ToolExecutionContext", () => {
  let sessionManager: SessionManager;
  let devicePool: DevicePool;
  let originalGetInstance: typeof AndroidAccessibilityServiceManager.getInstance;
  const sessionOptions = { keepScreenAwake: false };

  beforeEach(async () => {
    sessionManager = new SessionManager();
    devicePool = new DevicePool(sessionManager);
    await devicePool.initializeWithDevices(["device-1"]);
    originalGetInstance = AndroidAccessibilityServiceManager.getInstance;
  });

  afterEach(() => {
    AndroidAccessibilityServiceManager.getInstance = originalGetInstance;
  });

  test("should run accessibility setup when creating a new session", async () => {
    let setupCalls = 0;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalls += 1;
          return { success: true, message: "ok" };
        }
      } as any);

    const context = await createToolExecutionContext("session-1", sessionManager, devicePool, sessionOptions);

    expect(context.deviceId).toBe("device-1");
    expect(setupCalls).toBe(1);
  });

  test("should not run accessibility setup for existing sessions", async () => {
    let setupCalls = 0;
    AndroidAccessibilityServiceManager.getInstance = () =>
      ({
        setup: async () => {
          setupCalls += 1;
          return { success: true, message: "ok" };
        }
      } as any);

    await sessionManager.createSession("session-1", "device-1");
    const context = await createToolExecutionContext("session-1", sessionManager, devicePool, sessionOptions);

    expect(context.deviceId).toBe("device-1");
    expect(setupCalls).toBe(0);
  });
});
