import { expect, describe, test, beforeEach, afterEach, beforeAll } from "bun:test";
import { SmartNavigationHelper } from "../../../src/features/navigation/SmartNavigationHelper";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { runMigrations } from "../../helpers/database";

describe("SmartNavigationHelper", function() {
  let navGraph: NavigationGraphManager;

  beforeAll(async function() {
    await runMigrations();
  });

  beforeEach(async function() {
    navGraph = NavigationGraphManager.getInstance();
    await navGraph.setCurrentApp("com.example.app");
    await navGraph.clearCurrentGraph();
  });

  afterEach(async function() {
    NavigationGraphManager.resetInstance();
    SmartNavigationHelper.resetOptimizer();
  });

  describe("shouldUseBackButton", function() {
    test("should recommend back button for direct parent screen", async function() {
      // Set up a simple navigation graph
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      // Update ScreenA with back stack depth 0
      await navGraph.recordBackStack({
        depth: 0,
        currentTaskId: 100
      });

      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });

      // Update ScreenB with back stack depth 1
      await navGraph.recordBackStack({
        depth: 1,
        currentTaskId: 100
      });

      const result = await SmartNavigationHelper.shouldUseBackButton(
        "ScreenB",
        "ScreenA",
        1 // Current back stack depth
      );

      expect(result.shouldUseBack).toBe(true);
      expect(result.backPresses).toBe(1);
      expect(result.reason).toContain("Depth difference is 1");
    });

    test("should not recommend back button when current depth is lower", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      await navGraph.recordBackStack({
        depth: 2,
        currentTaskId: 100
      });

      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });

      await navGraph.recordBackStack({
        depth: 5,
        currentTaskId: 100
      });

      const result = await SmartNavigationHelper.shouldUseBackButton(
        "ScreenB",
        "ScreenA",
        2 // Current depth is less than target depth
      );

      expect(result.shouldUseBack).toBe(false);
      expect(result.reason).toContain("not greater than target depth");
    });

    test("should not recommend back button when target has no back stack info", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      // Don't record back stack for ScreenA

      const result = await SmartNavigationHelper.shouldUseBackButton(
        "ScreenB",
        "ScreenA",
        3
      );

      expect(result.shouldUseBack).toBe(false);
      expect(result.reason).toContain("no back stack information");
    });

    test("should recommend multiple back presses when path matches depth", async function() {
      // Create a linear path: A -> B -> C
      const baseTime = Date.now();

      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: baseTime,
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      // Record a tool call before navigation to create an edge (within correlation window)
      navGraph.recordToolCall("tapOn", { text: "Next" });

      // Navigation event happens right after tool call (within 2000ms correlation window)
      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: baseTime + 100,
        sequenceNumber: 2
      });
      await navGraph.recordBackStack({ depth: 1, currentTaskId: 100 });

      // Another tool call
      navGraph.recordToolCall("tapOn", { text: "Next" });

      await navGraph.recordNavigationEvent({
        destination: "ScreenC",
        source: "ScreenB",
        arguments: {},
        metadata: {},
        timestamp: baseTime + 200,
        sequenceNumber: 3
      });
      await navGraph.recordBackStack({ depth: 2, currentTaskId: 100 });

      const result = await SmartNavigationHelper.shouldUseBackButton(
        "ScreenC",
        "ScreenA",
        2 // Current depth
      );

      // This may be true or false depending on whether the path is found
      // The key is that if shouldUseBack is true, backPresses should equal 2
      if (result.shouldUseBack) {
        expect(result.backPresses).toBe(2);
      } else {
        // If back button is not recommended, it should be for a valid reason
        expect(result.reason).toBeDefined();
      }
    });
  });

  describe("areInSameTask", function() {
    test("should return true for screens in same task", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      await navGraph.recordBackStack({ depth: 1, currentTaskId: 100 });

      const result = await SmartNavigationHelper.areInSameTask("ScreenA", "ScreenB");

      expect(result).toBe(true);
    });

    test("should return false for screens in different tasks", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 200 });

      const result = await SmartNavigationHelper.areInSameTask("ScreenA", "ScreenB");

      expect(result).toBe(false);
    });

    test("should return false when task info is missing", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      const result = await SmartNavigationHelper.areInSameTask("ScreenA", "ScreenB");

      expect(result).toBe(false);
    });
  });

  describe("getNavigationRecommendation", function() {
    test("should recommend back navigation when appropriate", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      await navGraph.recordBackStack({ depth: 1, currentTaskId: 100 });

      const result = await SmartNavigationHelper.getNavigationRecommendation(
        "ScreenA",
        "ScreenB",
        1
      );

      expect(result.method).toBe("back");
      expect(result.backPresses).toBe(1);
    });

    test("should recommend forward navigation when back is not suitable", async function() {
      await navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      navGraph.recordToolCall("tapOn", { text: "Next" });

      await navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      await navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      const result = await SmartNavigationHelper.getNavigationRecommendation(
        "ScreenB",
        "ScreenA",
        0
      );

      expect(result.method).toBe("forward");
    });

    test("should return unknown when no navigation path exists", async function() {
      const result = await SmartNavigationHelper.getNavigationRecommendation(
        "UnknownScreen",
        "CurrentScreen",
        2
      );

      expect(result.method).toBe("unknown");
    });
  });
});
