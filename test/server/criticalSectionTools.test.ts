import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { registerCriticalSectionTools } from "../../src/server/criticalSectionTools";
import { CriticalSectionCoordinator } from "../../src/server/CriticalSectionCoordinator";
import type { BootedDevice } from "../../src/models";
import { z } from "zod";

describe("criticalSection tool", () => {
  beforeAll(() => {
    // Register the tool if not already registered
    if (!ToolRegistry.getTool("criticalSection")) {
      registerCriticalSectionTools();
    }
  });

  beforeEach(() => {
    // Reset coordinator before each test
    CriticalSectionCoordinator.getInstance().reset();
  });

  test("tool is registered with correct schema", () => {
    const tool = ToolRegistry.getTool("criticalSection");

    expect(tool).toBeDefined();
    expect(tool?.name).toBe("criticalSection");
    expect(tool?.description).toContain("Coordinate multiple devices");
    expect(tool?.deviceAwareHandler).toBeDefined();
  });

  test("validates schema with valid parameters", () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const validParams = {
      lock: "test-lock",
      deviceCount: 2,
      steps: [
        {
          tool: "observe",
          params: { device: "A" },
        },
      ],
    };

    // Should not throw
    const parsed = tool!.schema.parse(validParams);
    expect(parsed.lock).toBe("test-lock");
    expect(parsed.deviceCount).toBe(2);
    expect(parsed.steps.length).toBe(1);
  });

  test("rejects invalid schema - missing required fields", () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const invalidParams = {
      lock: "test-lock",
      // missing deviceCount and steps
    };

    expect(() => tool!.schema.parse(invalidParams)).toThrow();
  });

  test("rejects invalid schema - empty steps array", () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const invalidParams = {
      lock: "test-lock",
      deviceCount: 2,
      steps: [], // Empty array not allowed
    };

    expect(() => tool!.schema.parse(invalidParams)).toThrow();
  });

  test("rejects invalid schema - non-positive device count", () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const invalidParams = {
      lock: "test-lock",
      deviceCount: 0,
      steps: [{ tool: "observe", params: {} }],
    };

    expect(() => tool!.schema.parse(invalidParams)).toThrow();
  });

  test("detects nested critical sections", async () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const fakeDevice: BootedDevice = {
      platform: "android",
      deviceId: "test-device",
      name: "Test Device",
    };

    const coordinator = CriticalSectionCoordinator.getInstance();
    coordinator.registerExpectedDevices("outer-lock", 1);

    const params = {
      lock: "outer-lock",
      deviceCount: 1,
      steps: [
        {
          tool: "criticalSection", // Nested critical section
          params: {
            lock: "inner-lock",
            deviceCount: 1,
            steps: [{ tool: "observe", params: {} }],
          },
        },
      ],
    };

    await expect(
			tool!.deviceAwareHandler!(fakeDevice, params, undefined, undefined)
    ).rejects.toThrow(/Nested critical sections are not supported/);
  });

  test("executes steps in order for single device", async () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const fakeDevice: BootedDevice = {
      platform: "android",
      deviceId: "test-device-1",
      name: "Test Device 1",
    };

    // Register a mock tool to track execution
    const executionLog: string[] = [];
    ToolRegistry.register(
      "mockStep",
      "Mock step for testing",
      z.object({ message: z.string() }),
      async (params: { message: string }) => {
        executionLog.push(params.message);
        return { success: true };
      }
    );

    const coordinator = CriticalSectionCoordinator.getInstance();
    coordinator.registerExpectedDevices("test-lock", 1);

    const params = {
      lock: "test-lock",
      deviceCount: 1,
      steps: [
        { tool: "mockStep", params: { message: "step1" } },
        { tool: "mockStep", params: { message: "step2" } },
        { tool: "mockStep", params: { message: "step3" } },
      ],
    };

    const response = await tool!.deviceAwareHandler!(
      fakeDevice,
      params,
      undefined,
      undefined
    );

    // Parse the JSON tool response
    expect(response.content).toBeDefined();
    expect(response.content[0].type).toBe("text");
    const result = JSON.parse(response.content[0].text);

    expect(result.success).toBe(true);
    expect(result.executedSteps).toBe(3);
    expect(executionLog).toEqual(["step1", "step2", "step3"]);
  });


  test("fails fast when a step fails", async () => {
    const tool = ToolRegistry.getTool("criticalSection");
    expect(tool).toBeDefined();

    const fakeDevice: BootedDevice = {
      platform: "android",
      deviceId: "test-device-2",
      name: "Test Device 2",
    };

    // Register mock tools
    const executionLog: string[] = [];
    ToolRegistry.register(
      "mockSuccess",
      "Mock success step",
      z.object({ message: z.string() }),
      async (params: { message: string }) => {
        executionLog.push(params.message);
        return { success: true };
      }
    );

    ToolRegistry.register(
      "mockFailure",
      "Mock failure step",
      z.object({}),
      async () => {
        executionLog.push("failure");
        throw new Error("Simulated failure");
      }
    );

    const coordinator = CriticalSectionCoordinator.getInstance();
    coordinator.registerExpectedDevices("fail-lock", 1);

    const params = {
      lock: "fail-lock",
      deviceCount: 1,
      steps: [
        { tool: "mockSuccess", params: { message: "step1" } },
        { tool: "mockFailure", params: {} },
        { tool: "mockSuccess", params: { message: "step3" } }, // Should not execute
      ],
    };

    await expect(
			tool!.deviceAwareHandler!(fakeDevice, params, undefined, undefined)
    ).rejects.toThrow(/Simulated failure/);

    // Verify only first two steps executed
    expect(executionLog).toEqual(["step1", "failure"]);
  });
});
