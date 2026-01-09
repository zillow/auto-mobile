import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { DefaultPlanExecutor } from "../../src/utils/plan/PlanExecutor";
import { Plan } from "../../src/models/Plan";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { DaemonState } from "../../src/daemon/daemonState";
import { z } from "zod";

describe("PlanExecutor - Session-based Device Routing", () => {
  let planExecutor: DefaultPlanExecutor;

  beforeEach(() => {
    planExecutor = new DefaultPlanExecutor();
  });

  afterEach(() => {
    // Clean up daemon state if initialized
    const daemonState = DaemonState.getInstance();
    if (daemonState.isInitialized()) {
      daemonState.reset();
    }
  });

  test("should inject deviceId when sessionUuid is provided BUT daemon not initialized", async () => {
    // This test verifies the edge case from PR review: when sessionUuid is provided but
    // daemon is not initialized, we should still inject deviceId to preserve device targeting
    // and prevent fallback to auto-selection.

    // Ensure daemon is NOT initialized
    expect(DaemonState.getInstance().isInitialized()).toBe(false);

    // Register a mock tool to capture the params it receives
    const capturedParams: any[] = [];
    const mockHandler = mock(async (params: any) => {
      capturedParams.push({ ...params });
      return { success: true };
    });

    const testToolSchema = z.object({
      platform: z.string().optional(),
      deviceId: z.string().optional(),
      sessionUuid: z.string().optional(),
      testParam: z.string().optional(),
    });

    ToolRegistry.register(
      "testDaemonNotInitializedTool",
      "Test tool for daemon not initialized case",
      testToolSchema,
      mockHandler
    );

    // Mark it as requiring a device so params get injected
    const tool = ToolRegistry.getTool("testDaemonNotInitializedTool")!;
    (tool as any).requiresDevice = true;

    const plan: Plan = {
      name: "Test Daemon Not Initialized",
      mcpVersion: "1.0",
      steps: [
        {
          tool: "testDaemonNotInitializedTool",
          params: {
            testParam: "value1",
          },
        },
      ],
    };

    const deviceId = "emulator-5554";
    const sessionUuid = "test-session-uuid-123";

    await planExecutor.executePlan(
      plan,
      0,
      "android",
      deviceId, // Should be injected because daemon is not initialized
      sessionUuid
    );

    // Verify BOTH deviceId and sessionUuid were injected
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(capturedParams.length).toBe(1);
    expect(capturedParams[0]).toHaveProperty("deviceId", deviceId);
    expect(capturedParams[0]).toHaveProperty("sessionUuid", sessionUuid);
    expect(capturedParams[0]).toHaveProperty("platform", "android");
  });

  test("should NOT inject deviceId when sessionUuid is provided AND daemon is initialized", async () => {
    // Initialize daemon with minimal setup
    const daemonState = DaemonState.getInstance();
    daemonState.initialize(
      {} as any, // sessionManager - not used in this test
      {} as any  // devicePool - not used in this test
    );

    expect(daemonState.isInitialized()).toBe(true);

    // Register a mock tool
    const capturedParams: any[] = [];
    const mockHandler = mock(async (params: any) => {
      capturedParams.push({ ...params });
      return { success: true };
    });

    const testToolSchema = z.object({
      platform: z.string().optional(),
      deviceId: z.string().optional(),
      sessionUuid: z.string().optional(),
      testParam: z.string().optional(),
    });

    ToolRegistry.register(
      "testDaemonInitializedTool",
      "Test tool for daemon initialized case",
      testToolSchema,
      mockHandler
    );

    const tool = ToolRegistry.getTool("testDaemonInitializedTool")!;
    (tool as any).requiresDevice = true;

    const plan: Plan = {
      name: "Test Daemon Initialized",
      mcpVersion: "1.0",
      steps: [
        {
          tool: "testDaemonInitializedTool",
          params: {
            testParam: "value1",
          },
        },
        {
          tool: "testDaemonInitializedTool",
          params: {
            testParam: "value2",
          },
        },
      ],
    };

    const deviceId = "emulator-5554";
    const sessionUuid = "test-session-uuid-456";

    await planExecutor.executePlan(
      plan,
      0,
      "android",
      deviceId, // Should NOT be injected because daemon is initialized and sessionUuid present
      sessionUuid
    );

    // Verify sessionUuid was injected but deviceId was NOT
    expect(mockHandler).toHaveBeenCalledTimes(2);
    expect(capturedParams.length).toBe(2);

    // First step
    expect(capturedParams[0]).toHaveProperty("sessionUuid", sessionUuid);
    expect(capturedParams[0]).not.toHaveProperty("deviceId");
    expect(capturedParams[0]).toHaveProperty("platform", "android");
    expect(capturedParams[0]).toHaveProperty("testParam", "value1");

    // Second step
    expect(capturedParams[1]).toHaveProperty("sessionUuid", sessionUuid);
    expect(capturedParams[1]).not.toHaveProperty("deviceId");
    expect(capturedParams[1]).toHaveProperty("platform", "android");
    expect(capturedParams[1]).toHaveProperty("testParam", "value2");
  });

  test("should inject deviceId when sessionUuid is NOT provided", async () => {
    // Register a mock tool to capture the params it receives
    const capturedParams: any[] = [];
    const mockHandler = mock(async (params: any) => {
      capturedParams.push({ ...params });
      return { success: true };
    });

    const testToolSchema = z.object({
      platform: z.string().optional(),
      deviceId: z.string().optional(),
      testParam: z.string().optional(),
    });

    ToolRegistry.register(
      "testDeviceIdInjectionTool",
      "Test tool for deviceId injection",
      testToolSchema,
      mockHandler
    );

    // Mark it as requiring a device so params get injected
    const tool = ToolRegistry.getTool("testDeviceIdInjectionTool")!;
    (tool as any).requiresDevice = true;

    const plan: Plan = {
      name: "Test DeviceId Injection",
      mcpVersion: "1.0",
      steps: [
        {
          tool: "testDeviceIdInjectionTool",
          params: {
            testParam: "value1",
          },
        },
      ],
    };

    // Execute plan with ONLY deviceId (no sessionUuid)
    // In this scenario, deviceId SHOULD be injected into steps
    const deviceId = "emulator-5554";

    await planExecutor.executePlan(
      plan,
      0, // startStep
      "android", // platform
      deviceId, // deviceId - should be injected
      undefined // no sessionUuid
    );

    // Verify the tool was called
    expect(mockHandler).toHaveBeenCalledTimes(1);

    // Verify that deviceId was injected
    expect(capturedParams.length).toBe(1);
    expect(capturedParams[0]).toHaveProperty("deviceId", deviceId);
    expect(capturedParams[0]).toHaveProperty("platform", "android");
    expect(capturedParams[0]).toHaveProperty("testParam", "value1");
  });

  test("should NOT override deviceId if already present in step params", async () => {
    // Register a mock tool
    const capturedParams: any[] = [];
    const mockHandler = mock(async (params: any) => {
      capturedParams.push({ ...params });
      return { success: true };
    });

    const testToolSchema = z.object({
      platform: z.string().optional(),
      deviceId: z.string().optional(),
      testParam: z.string().optional(),
    });

    ToolRegistry.register(
      "testNoOverrideTool",
      "Test tool for no override",
      testToolSchema,
      mockHandler
    );

    // Mark it as requiring a device
    const tool = ToolRegistry.getTool("testNoOverrideTool")!;
    (tool as any).requiresDevice = true;

    const plan: Plan = {
      name: "Test No Override",
      mcpVersion: "1.0",
      steps: [
        {
          tool: "testNoOverrideTool",
          params: {
            deviceId: "explicitly-set-device", // Step already has deviceId
            testParam: "value1",
          },
        },
      ],
    };

    // Execute plan with different deviceId
    await planExecutor.executePlan(
      plan,
      0,
      "android",
      "emulator-5554", // Different deviceId - should NOT override the step's explicit deviceId
      undefined
    );

    // Verify the step's explicit deviceId was preserved
    expect(capturedParams.length).toBe(1);
    expect(capturedParams[0]).toHaveProperty("deviceId", "explicitly-set-device");
    expect(capturedParams[0]).not.toHaveProperty("deviceId", "emulator-5554");
  });
});
