import { expect, describe, test, beforeEach, afterEach, beforeAll } from "bun:test";
import { NavigateTo } from "../../../src/features/navigation/NavigateTo";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { ToolRegistry } from "../../../src/server/toolRegistry";
import { BootedDevice } from "../../../src/models";
import { z } from "zod";
import { runMigrations } from "../../helpers/database";

describe("NavigateTo", () => {
  let navigateTo: NavigateTo;
  let device: BootedDevice;
  let toolCallLog: Array<{ toolName: string; args: Record<string, any> }>;

  // Map of text -> screen to simulate navigation when tools are called
  let navigationMap: Map<string, string>;

  beforeAll(async () => {
    // Run database migrations once before all tests
    await runMigrations();
  });

  beforeEach(async () => {
    // Reset singleton
    NavigationGraphManager.resetInstance();
    ToolRegistry.clearTools();

    // Create fake device
    device = {
      deviceId: "test-device-123",
      platform: "android",
      source: "local"
    } as BootedDevice;

    // Track tool calls
    toolCallLog = [];
    navigationMap = new Map();

    // Register fake tapOn tool that simulates navigation
    ToolRegistry.register(
      "tapOn",
      "Fake tap tool",
      z.object({
        text: z.string().optional(),
        id: z.string().optional(),
        action: z.string(),
        platform: z.string()
      }),
      async args => {
        toolCallLog.push({ toolName: "tapOn", args });

        // Simulate navigation by recording a navigation event
        const targetScreen = navigationMap.get(args.text);
        if (targetScreen) {
          await NavigationGraphManager.getInstance().recordNavigationEvent({
            destination: targetScreen,
            source: "TEST",
            arguments: {},
            metadata: {},
            timestamp: Date.now(),
            sequenceNumber: 0
          });
        }

        return { success: true };
      }
    );

    // Set up navigation graph with test data
    const manager = NavigationGraphManager.getInstance();
    await manager.setCurrentApp("com.test.app");
  });

  afterEach(() => {
    NavigationGraphManager.resetInstance();
    ToolRegistry.clearTools();
  });

  describe("execute", () => {
    test("should return error when no current screen", async () => {
      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "TargetScreen",
        platform: "android"
      });

      expect(result.success).toBe(false);
      expect(result.error!).toContain("Cannot determine current screen");
      expect(result.stepsExecuted).toBe(0);
    });

    test("should return success when already on target screen", async () => {
      const manager = NavigationGraphManager.getInstance();
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0
      });

      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "HomeScreen",
        platform: "android"
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Already on target screen");
      expect(result.stepsExecuted).toBe(0);
    });

    test("should return error when no path exists", async () => {
      const manager = NavigationGraphManager.getInstance();
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0
      });

      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "UnknownScreen",
        platform: "android"
      });

      expect(result.success).toBe(false);
      expect(result.error!).toContain("No known path");
      expect(result.error!).toContain("HomeScreen");
      expect(result.error!).toContain("UnknownScreen");
    });

    test("should execute tool call when path exists", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Settings", "SettingsScreen");

      // Record tool call before navigation (to correlate)
      manager.recordToolCall("tapOn", { text: "Settings", action: "tap", platform: "android" });

      // Record navigation: Home -> Settings
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await manager.recordNavigationEvent({
        destination: "SettingsScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });

      // Go back to Home to test navigation
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      navigateTo = new NavigateTo(device, null);

      await navigateTo.execute({
        targetScreen: "SettingsScreen",
        platform: "android"
      });

      // Should have attempted to execute the tool call
      expect(toolCallLog).toHaveLength(1);
      expect(toolCallLog[0].toolName).toBe("tapOn");
      expect(toolCallLog[0].args.text).toBe("Settings");
    });

    test("should include path in successful navigation result", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Profile", "ProfileScreen");

      manager.recordToolCall("tapOn", { text: "Profile", action: "tap", platform: "android" });
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await manager.recordNavigationEvent({
        destination: "ProfileScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "ProfileScreen",
        platform: "android"
      });

      expect(result.path).toBeDefined();
      expect(Array.isArray(result.path)).toBe(true);
      expect(result.path!.length > 0).toBe(true);
    });

    test("should report progress during navigation", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();
      const progressUpdates: Array<{ current: number; total: number; message: string }> = [];

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Step1", "Screen2");

      manager.recordToolCall("tapOn", { text: "Step1", action: "tap", platform: "android" });
      await manager.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await manager.recordNavigationEvent({
        destination: "Screen2",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });
      await manager.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      navigateTo = new NavigateTo(device, null);

      await navigateTo.execute(
        { targetScreen: "Screen2", platform: "android" },
        async (current, total, message) => {
          progressUpdates.push({ current, total, message });
        }
      );

      expect(progressUpdates.length > 0).toBe(true);
      expect(progressUpdates[0].total).toBe(1);
      expect(progressUpdates[0].message).toContain("Screen1");
      expect(progressUpdates[0].message).toContain("Screen2");
    });

    test("should return duration in result", async () => {
      const manager = NavigationGraphManager.getInstance();
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0
      });

      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "HomeScreen",
        platform: "android"
      });

      expect(result.durationMs).toBeDefined();
      expect(typeof result.durationMs).toBe("number");
      expect(result.durationMs!).toBeGreaterThanOrEqual(0);
    });
  });

  describe("multi-hop navigation", () => {
    test("should find and execute multi-hop path", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();

      // Set up navigation map so fake tools trigger navigation
      navigationMap.set("Settings", "SettingsScreen");
      navigationMap.set("Advanced", "AdvancedScreen");

      // Create path: Home -> Settings -> Advanced
      manager.recordToolCall("tapOn", { text: "Settings", action: "tap", platform: "android" });
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await manager.recordNavigationEvent({
        destination: "SettingsScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });

      manager.recordToolCall("tapOn", { text: "Advanced", action: "tap", platform: "android" });
      await manager.recordNavigationEvent({
        destination: "AdvancedScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      // Go back to Home
      await manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 300,
        sequenceNumber: 3
      });

      navigateTo = new NavigateTo(device, null);

      await navigateTo.execute({
        targetScreen: "AdvancedScreen",
        platform: "android"
      });

      // Should execute two tool calls: Home -> Settings -> Advanced
      expect(toolCallLog).toHaveLength(2);
      expect(toolCallLog[0].args.text).toBe("Settings");
      expect(toolCallLog[1].args.text).toBe("Advanced");
    });
  });
});
