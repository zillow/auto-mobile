import { assert } from "chai";
import { NavigateTo } from "../../../src/features/navigation/NavigateTo";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { ToolRegistry } from "../../../src/server/toolRegistry";
import { BootedDevice } from "../../../src/models";
import { z } from "zod";

describe("NavigateTo", () => {
  let navigateTo: NavigateTo;
  let device: BootedDevice;
  let toolCallLog: Array<{ toolName: string; args: Record<string, any> }>;

  // Map of text -> screen to simulate navigation when tools are called
  let navigationMap: Map<string, string>;

  beforeEach(() => {
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
      async (args) => {
        toolCallLog.push({ toolName: "tapOn", args });

        // Simulate navigation by recording a navigation event
        const targetScreen = navigationMap.get(args.text);
        if (targetScreen) {
          NavigationGraphManager.getInstance().recordNavigationEvent({
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
    manager.setCurrentApp("com.test.app");
  });

  afterEach(() => {
    NavigationGraphManager.resetInstance();
    ToolRegistry.clearTools();
  });

  describe("execute", () => {
    it("should return error when no current screen", async () => {
      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "TargetScreen",
        platform: "android"
      });

      assert.isFalse(result.success);
      assert.include(result.error!, "Cannot determine current screen");
      assert.equal(result.stepsExecuted, 0);
    });

    it("should return success when already on target screen", async () => {
      const manager = NavigationGraphManager.getInstance();
      manager.recordNavigationEvent({
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

      assert.isTrue(result.success);
      assert.equal(result.message, "Already on target screen");
      assert.equal(result.stepsExecuted, 0);
    });

    it("should return error when no path exists", async () => {
      const manager = NavigationGraphManager.getInstance();
      manager.recordNavigationEvent({
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

      assert.isFalse(result.success);
      assert.include(result.error!, "No known path");
      assert.include(result.error!, "HomeScreen");
      assert.include(result.error!, "UnknownScreen");
    });

    it("should execute tool call when path exists", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Settings", "SettingsScreen");

      // Record tool call before navigation (to correlate)
      manager.recordToolCall("tapOn", { text: "Settings", action: "tap", platform: "android" });

      // Record navigation: Home -> Settings
      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      manager.recordNavigationEvent({
        destination: "SettingsScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });

      // Go back to Home to test navigation
      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "SettingsScreen",
        platform: "android"
      });

      // Should have attempted to execute the tool call
      assert.lengthOf(toolCallLog, 1);
      assert.equal(toolCallLog[0].toolName, "tapOn");
      assert.equal(toolCallLog[0].args.text, "Settings");
    });

    it("should include path in successful navigation result", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Profile", "ProfileScreen");

      manager.recordToolCall("tapOn", { text: "Profile", action: "tap", platform: "android" });
      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      manager.recordNavigationEvent({
        destination: "ProfileScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });
      manager.recordNavigationEvent({
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

      assert.isDefined(result.path);
      assert.isArray(result.path);
      assert.isTrue(result.path!.length > 0);
    });

    it("should report progress during navigation", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();
      const progressUpdates: Array<{ current: number; total: number; message: string }> = [];

      // Set up navigation map so fake tool triggers navigation
      navigationMap.set("Step1", "Screen2");

      manager.recordToolCall("tapOn", { text: "Step1", action: "tap", platform: "android" });
      manager.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      manager.recordNavigationEvent({
        destination: "Screen2",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });
      manager.recordNavigationEvent({
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

      assert.isTrue(progressUpdates.length > 0);
      assert.equal(progressUpdates[0].total, 1);
      assert.include(progressUpdates[0].message, "Screen1");
      assert.include(progressUpdates[0].message, "Screen2");
    });

    it("should return duration in result", async () => {
      const manager = NavigationGraphManager.getInstance();
      manager.recordNavigationEvent({
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

      assert.isDefined(result.durationMs);
      assert.isNumber(result.durationMs);
      assert.isAtLeast(result.durationMs!, 0);
    });
  });

  describe("multi-hop navigation", () => {
    it("should find and execute multi-hop path", async () => {
      const manager = NavigationGraphManager.getInstance();
      const now = Date.now();

      // Set up navigation map so fake tools trigger navigation
      navigationMap.set("Settings", "SettingsScreen");
      navigationMap.set("Advanced", "AdvancedScreen");

      // Create path: Home -> Settings -> Advanced
      manager.recordToolCall("tapOn", { text: "Settings", action: "tap", platform: "android" });
      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now,
        sequenceNumber: 0
      });
      manager.recordNavigationEvent({
        destination: "SettingsScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 100,
        sequenceNumber: 1
      });

      manager.recordToolCall("tapOn", { text: "Advanced", action: "tap", platform: "android" });
      manager.recordNavigationEvent({
        destination: "AdvancedScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 200,
        sequenceNumber: 2
      });

      // Go back to Home
      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: now + 300,
        sequenceNumber: 3
      });

      navigateTo = new NavigateTo(device, null);

      const result = await navigateTo.execute({
        targetScreen: "AdvancedScreen",
        platform: "android"
      });

      // Should execute two tool calls: Home -> Settings -> Advanced
      assert.lengthOf(toolCallLog, 2);
      assert.equal(toolCallLog[0].args.text, "Settings");
      assert.equal(toolCallLog[1].args.text, "Advanced");
    });
  });
});
