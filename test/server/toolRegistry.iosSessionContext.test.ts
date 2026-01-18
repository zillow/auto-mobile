import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { FakeDeviceSessionManager } from "../fakes/FakeDeviceSessionManager";
import { BootedDevice } from "../../src/models";
import { z } from "zod";

describe("ToolRegistry iOS session context", () => {
  const iosDeviceA: BootedDevice = {
    name: "iPhone A",
    deviceId: "ios-device-a",
    platform: "ios",
  };
  const iosDeviceB: BootedDevice = {
    name: "iPhone B",
    deviceId: "ios-device-b",
    platform: "ios",
  };

  let fakeDeviceSessionManager: FakeDeviceSessionManager;
  let originalDeviceSessionManager: unknown;

  beforeEach(() => {
    ToolRegistry.clearTools();
    fakeDeviceSessionManager = new FakeDeviceSessionManager();
    originalDeviceSessionManager = (ToolRegistry as any).deviceSessionManager;
    (ToolRegistry as any).deviceSessionManager = fakeDeviceSessionManager;
  });

  afterEach(() => {
    (ToolRegistry as any).deviceSessionManager = originalDeviceSessionManager;
    ToolRegistry.clearTools();
  });

  test("requires sessionUuid when multiple iOS simulators are booted", async () => {
    fakeDeviceSessionManager.setConnectedDevices([iosDeviceA, iosDeviceB]);

    ToolRegistry.registerDeviceAware(
      "iosSessionRequiredTool",
      "Tool requiring sessionUuid when multiple iOS simulators are booted",
      z.object({
        platform: z.enum(["ios", "android"]).optional(),
        sessionUuid: z.string().optional(),
      }),
      async () => ({ success: true })
    );

    const tool = ToolRegistry.getTool("iosSessionRequiredTool");
    expect(tool).toBeDefined();

    await expect(tool!.handler({ platform: "ios" })).rejects.toThrow(
      "Multiple iOS simulators detected. Provide sessionUuid to target a specific simulator."
    );
    expect(fakeDeviceSessionManager.getEnsureDeviceReadyCallCount()).toBe(0);
  });

  test("allows sessionUuid when multiple iOS simulators are booted", async () => {
    fakeDeviceSessionManager.setConnectedDevices([iosDeviceA, iosDeviceB]);

    ToolRegistry.registerDeviceAware(
      "iosSessionAllowedTool",
      "Tool allows sessionUuid when multiple iOS simulators are booted",
      z.object({
        platform: z.enum(["ios", "android"]).optional(),
        sessionUuid: z.string().optional(),
      }),
      async () => ({ success: true })
    );

    const tool = ToolRegistry.getTool("iosSessionAllowedTool");
    expect(tool).toBeDefined();

    const response = await tool!.handler({ platform: "ios", sessionUuid: "session-123" });
    expect(response).toEqual({ success: true });
    expect(fakeDeviceSessionManager.getEnsureDeviceReadyCallCount()).toBe(1);
  });

  test("allows explicit deviceId when multiple iOS simulators are booted", async () => {
    fakeDeviceSessionManager.setConnectedDevices([iosDeviceA, iosDeviceB]);

    ToolRegistry.registerDeviceAware(
      "iosDeviceIdAllowedTool",
      "Tool allows deviceId without sessionUuid when multiple iOS simulators are booted",
      z.object({
        platform: z.enum(["ios", "android"]).optional(),
        deviceId: z.string().optional(),
        sessionUuid: z.string().optional(),
      }),
      async () => ({ success: true })
    );

    const tool = ToolRegistry.getTool("iosDeviceIdAllowedTool");
    expect(tool).toBeDefined();

    const response = await tool!.handler({ platform: "ios", deviceId: "ios-device-b" });
    expect(response).toEqual({ success: true });
    expect(fakeDeviceSessionManager.getEnsureDeviceReadyCallCount()).toBe(1);
  });
});
