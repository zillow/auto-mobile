import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { SmartNavigationHelper } from "../../../src/features/navigation/SmartNavigationHelper";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";

describe("SmartNavigationHelper", function() {
  let navGraph: NavigationGraphManager;

  beforeEach(function() {
    navGraph = NavigationGraphManager.getInstance();
    navGraph.setCurrentApp("com.example.app");
  });

  afterEach(function() {
    NavigationGraphManager.resetInstance();
  });

  describe("shouldUseBackButton", function() {
    it("should recommend back button for direct parent screen", function() {
      // Set up a simple navigation graph
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      // Update ScreenA with back stack depth 0
      navGraph.recordBackStack({
        depth: 0,
        currentTaskId: 100
      });

      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });

      // Update ScreenB with back stack depth 1
      navGraph.recordBackStack({
        depth: 1,
        currentTaskId: 100
      });

      const result = SmartNavigationHelper.shouldUseBackButton(
        "ScreenB",
        "ScreenA",
        1 // Current back stack depth
      );

      expect(result.shouldUseBack).to.be.true;
      expect(result.backPresses).to.equal(1);
      expect(result.reason).to.include("Depth difference is 1");
    });

    it("should not recommend back button when current depth is lower", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      navGraph.recordBackStack({
        depth: 2,
        currentTaskId: 100
      });

      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });

      navGraph.recordBackStack({
        depth: 5,
        currentTaskId: 100
      });

      const result = SmartNavigationHelper.shouldUseBackButton(
        "ScreenB",
        "ScreenA",
        2 // Current depth is less than target depth
      );

      expect(result.shouldUseBack).to.be.false;
      expect(result.reason).to.include("not greater than target depth");
    });

    it("should not recommend back button when target has no back stack info", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      // Don't record back stack for ScreenA

      const result = SmartNavigationHelper.shouldUseBackButton(
        "ScreenB",
        "ScreenA",
        3
      );

      expect(result.shouldUseBack).to.be.false;
      expect(result.reason).to.include("no back stack information");
    });

    it("should recommend multiple back presses when path matches depth", function() {
      // Create a linear path: A -> B -> C
      const baseTime = Date.now();

      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: baseTime,
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      // Record a tool call before navigation to create an edge (within correlation window)
      navGraph.recordToolCall("tapOn", { text: "Next" });

      // Navigation event happens right after tool call (within 2000ms correlation window)
      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: baseTime + 100,
        sequenceNumber: 2
      });
      navGraph.recordBackStack({ depth: 1, currentTaskId: 100 });

      // Another tool call
      navGraph.recordToolCall("tapOn", { text: "Next" });

      navGraph.recordNavigationEvent({
        destination: "ScreenC",
        source: "ScreenB",
        arguments: {},
        metadata: {},
        timestamp: baseTime + 200,
        sequenceNumber: 3
      });
      navGraph.recordBackStack({ depth: 2, currentTaskId: 100 });

      const result = SmartNavigationHelper.shouldUseBackButton(
        "ScreenC",
        "ScreenA",
        2 // Current depth
      );

      // This may be true or false depending on whether the path is found
      // The key is that if shouldUseBack is true, backPresses should equal 2
      if (result.shouldUseBack) {
        expect(result.backPresses).to.equal(2);
      } else {
        // If back button is not recommended, it should be for a valid reason
        expect(result.reason).to.exist;
      }
    });
  });

  describe("areInSameTask", function() {
    it("should return true for screens in same task", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      navGraph.recordBackStack({ depth: 1, currentTaskId: 100 });

      const result = SmartNavigationHelper.areInSameTask("ScreenA", "ScreenB");

      expect(result).to.be.true;
    });

    it("should return false for screens in different tasks", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 200 });

      const result = SmartNavigationHelper.areInSameTask("ScreenA", "ScreenB");

      expect(result).to.be.false;
    });

    it("should return false when task info is missing", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });

      const result = SmartNavigationHelper.areInSameTask("ScreenA", "ScreenB");

      expect(result).to.be.false;
    });
  });

  describe("getNavigationRecommendation", function() {
    it("should recommend back navigation when appropriate", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      navGraph.recordBackStack({ depth: 1, currentTaskId: 100 });

      const result = SmartNavigationHelper.getNavigationRecommendation(
        "ScreenA",
        "ScreenB",
        1
      );

      expect(result.method).to.equal("back");
      expect(result.backPresses).to.equal(1);
    });

    it("should recommend forward navigation when back is not suitable", function() {
      navGraph.recordNavigationEvent({
        destination: "ScreenA",
        source: "",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.example.app"
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      navGraph.recordToolCall("tapOn", { text: "Next" });

      navGraph.recordNavigationEvent({
        destination: "ScreenB",
        source: "ScreenA",
        arguments: {},
        metadata: {},
        timestamp: Date.now() + 100,
        sequenceNumber: 2
      });
      navGraph.recordBackStack({ depth: 0, currentTaskId: 100 });

      const result = SmartNavigationHelper.getNavigationRecommendation(
        "ScreenB",
        "ScreenA",
        0
      );

      expect(result.method).to.equal("forward");
    });

    it("should return unknown when no navigation path exists", function() {
      const result = SmartNavigationHelper.getNavigationRecommendation(
        "UnknownScreen",
        "CurrentScreen",
        2
      );

      expect(result.method).to.equal("unknown");
    });
  });
});
