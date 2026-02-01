import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { NavigateTo } from "../../../src/features/navigation/NavigateTo";
import { ToolRegistry } from "../../../src/server/toolRegistry";
import { BootedDevice } from "../../../src/models";
import { z } from "zod";
import { FakeNavigationGraphManager } from "../../fakes/FakeNavigationGraphManager";
import { FakeAdbClientFactory } from "../../fakes/FakeAdbClientFactory";

describe("NavigateTo", () => {
  let navigateTo: NavigateTo;
  let device: BootedDevice;
  let toolCallLog: Array<{ toolName: string; args: Record<string, any> }>;
  let fakeGraph: FakeNavigationGraphManager;
  let fakeAdbFactory: FakeAdbClientFactory;

  // Map of text -> screen to simulate navigation when tools are called
  let navigationMap: Map<string, string>;

  beforeEach(async () => {
    fakeGraph = new FakeNavigationGraphManager();
    ToolRegistry.clearTools();

    // Create fake device
    device = {
      deviceId: "test-device-123",
      platform: "android",
      source: "local"
    } as BootedDevice;

    // Create FakeAdbClientFactory to avoid real ADB calls
    fakeAdbFactory = new FakeAdbClientFactory();

    // Track tool calls
    toolCallLog = [];
    navigationMap = new Map();

    // Register fake tapOn tool that simulates navigation
    ToolRegistry.register(
      "tapOn",
      "Fake tap tool",
      z.object({
        id: z.string().optional(),
        text: z.string().optional(),
        action: z.string(),
        platform: z.string()
      }),
      async args => {
        toolCallLog.push({ toolName: "tapOn", args });

        // Simulate navigation by recording a navigation event
        const targetScreen = navigationMap.get(args.text);
        if (targetScreen) {
          await fakeGraph.recordNavigationEvent({
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
    await fakeGraph.setCurrentApp("com.test.app");
  });

  afterEach(() => {
    ToolRegistry.clearTools();
  });

  describe("execute", () => {
    test("should return error when no current screen", async () => {
      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

      const result = await navigateTo.execute({
        targetScreen: "TargetScreen",
        platform: "android"
      });

      expect(result.success).toBe(false);
      expect(result.error!).toContain("Cannot determine current screen");
      expect(result.stepsExecuted).toBe(0);
    });

    test("should return success when already on target screen", async () => {
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

      const result = await navigateTo.execute({
        targetScreen: "HomeScreen",
        platform: "android"
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Already on target screen");
      expect(result.stepsExecuted).toBe(0);
    });

    test("should return error when no path exists", async () => {
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

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
      const now = Date.now();

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Settings", "SettingsScreen");

      // Record tool call before navigation (to correlate)
      fakeGraph.recordToolCall("tapOn", { text: "Settings", action: "tap", platform: "android" });

      // Record navigation: Home -> Settings
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await fakeGraph.recordNavigationEvent({
        destination: "SettingsScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });

      // Go back to Home to test navigation
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

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
      const now = Date.now();

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Profile", "ProfileScreen");

      fakeGraph.recordToolCall("tapOn", { text: "Profile", action: "tap", platform: "android" });
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await fakeGraph.recordNavigationEvent({
        destination: "ProfileScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

      const result = await navigateTo.execute({
        targetScreen: "ProfileScreen",
        platform: "android"
      });

      expect(result.path).toBeDefined();
      expect(Array.isArray(result.path)).toBe(true);
      expect(result.path!.length > 0).toBe(true);
    });

    test("should report progress during navigation", async () => {
      const now = Date.now();
      const progressUpdates: Array<{ current: number; total: number; message: string }> = [];

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Step1", "Screen2");

      fakeGraph.recordToolCall("tapOn", { text: "Step1", action: "tap", platform: "android" });
      await fakeGraph.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await fakeGraph.recordNavigationEvent({
        destination: "Screen2",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });
      await fakeGraph.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

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
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

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
      const now = Date.now();

      // Set up navigation map so fake tools trigger navigation
      navigationMap.set("Settings", "SettingsScreen");
      navigationMap.set("Advanced", "AdvancedScreen");

      // Create path: Home -> Settings -> Advanced
      fakeGraph.recordToolCall("tapOn", { text: "Settings", action: "tap", platform: "android" });
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      await fakeGraph.recordNavigationEvent({
        destination: "SettingsScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });

      fakeGraph.recordToolCall("tapOn", { text: "Advanced", action: "tap", platform: "android" });
      await fakeGraph.recordNavigationEvent({
        destination: "AdvancedScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      // Go back to Home
      await fakeGraph.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 300,
        sequenceNumber: 3
      });

      // Inject fakeGraph via constructor
      navigateTo = new NavigateTo(device, fakeAdbFactory, null, null, fakeGraph);

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
