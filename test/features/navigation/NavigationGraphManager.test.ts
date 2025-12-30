import { assert } from "chai";
import {
  NavigationGraphManager,
  NavigationEvent
} from "../../../src/features/navigation/NavigationGraphManager";

describe("NavigationGraphManager", () => {
  let manager: NavigationGraphManager;

  beforeEach(() => {
    // Reset singleton between tests
    NavigationGraphManager.resetInstance();
    manager = NavigationGraphManager.getInstance();
    // Set up a test app
    manager.setCurrentApp("com.test.app");
  });

  afterEach(() => {
    NavigationGraphManager.resetInstance();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = NavigationGraphManager.getInstance();
      const instance2 = NavigationGraphManager.getInstance();
      assert.strictEqual(instance1, instance2);
    });

    it("should reset instance correctly", () => {
      const instance1 = NavigationGraphManager.getInstance();
      instance1.setCurrentApp("com.test.app");
      instance1.recordNavigationEvent(createEvent("Screen1"));

      NavigationGraphManager.resetInstance();

      const instance2 = NavigationGraphManager.getInstance();
      assert.isNull(instance2.getCurrentAppId());
      assert.deepEqual(instance2.getKnownScreens(), []);
    });
  });

  describe("setCurrentApp", () => {
    it("should set the current app", () => {
      manager.setCurrentApp("com.example.app");
      assert.equal(manager.getCurrentAppId(), "com.example.app");
    });

    it("should create separate graphs for different apps", () => {
      manager.setCurrentApp("com.app1");
      manager.recordNavigationEvent(createEvent("Screen1"));

      manager.setCurrentApp("com.app2");
      manager.recordNavigationEvent(createEvent("Screen2"));

      // App2 should only know Screen2
      assert.deepEqual(manager.getKnownScreens(), ["Screen2"]);

      // Switch back to app1
      manager.setCurrentApp("com.app1");
      assert.deepEqual(manager.getKnownScreens(), ["Screen1"]);
    });
  });

  describe("recordNavigationEvent", () => {
    it("should record a navigation event and create a node", () => {
      const event = createEvent("HomeScreen");
      manager.recordNavigationEvent(event);

      const screens = manager.getKnownScreens();
      assert.deepEqual(screens, ["HomeScreen"]);
      assert.equal(manager.getCurrentScreen(), "HomeScreen");
    });

    it("should update node on revisit", () => {
      const event1 = createEvent("HomeScreen", 1000);
      manager.recordNavigationEvent(event1);

      const event2 = createEvent("HomeScreen", 2000);
      manager.recordNavigationEvent(event2);

      const node = manager.getNode("HomeScreen");
      assert.isDefined(node);
      assert.equal(node!.visitCount, 2);
      assert.equal(node!.firstSeenAt, 1000);
      assert.equal(node!.lastSeenAt, 2000);
    });

    it("should create edge when navigating between screens", () => {
      manager.recordNavigationEvent(createEvent("Screen1", 1000));
      manager.recordNavigationEvent(createEvent("Screen2", 2000));

      const edges = manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].from, "Screen1");
      assert.equal(edges[0].to, "Screen2");
      assert.equal(edges[0].edgeType, "unknown"); // No tool call recorded
    });

    it("should not create edge for same screen navigation", () => {
      manager.recordNavigationEvent(createEvent("Screen1", 1000));
      manager.recordNavigationEvent(createEvent("Screen1", 2000));

      const edges = manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 0);
    });
  });

  describe("recordToolCall", () => {
    it("should record a tool call", () => {
      manager.recordToolCall("tapOn", { text: "Button" });

      const stats = manager.getStats();
      assert.equal(stats.toolCallHistorySize, 1);
    });

    it("should correlate tool call with navigation event", () => {
      const now = Date.now();

      // Record tool call
      manager.recordToolCall("tapOn", { text: "Settings" });

      // Navigation event occurs 500ms after tool call
      manager.recordNavigationEvent(createEvent("Screen1", now));
      manager.recordNavigationEvent(createEvent("SettingsScreen", now + 500));

      const edges = manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].edgeType, "tool");
      assert.isDefined(edges[0].interaction);
      assert.equal(edges[0].interaction!.toolName, "tapOn");
      assert.deepEqual(edges[0].interaction!.args, { text: "Settings" });
    });

    it("should not correlate tool call outside correlation window", () => {
      const now = Date.now();

      // Record tool call
      manager.recordToolCall("tapOn", { text: "Settings" });

      // Navigation event occurs 3000ms after tool call (outside 2000ms window)
      manager.recordNavigationEvent(createEvent("Screen1", now));
      manager.recordNavigationEvent(createEvent("SettingsScreen", now + 3000));

      const edges = manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].edgeType, "unknown");
      assert.isUndefined(edges[0].interaction);
    });

    it("should use most recent tool call within window", () => {
      const now = Date.now();

      // Record multiple tool calls
      manager.recordToolCall("tapOn", { text: "First" });
      manager.recordToolCall("tapOn", { text: "Second" });

      // Navigation event
      manager.recordNavigationEvent(createEvent("Screen1", now));
      manager.recordNavigationEvent(createEvent("Screen2", now + 500));

      const edges = manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].interaction!.args.text, "Second");
    });
  });

  describe("findPath", () => {
    it("should find path when already on target screen", () => {
      manager.recordNavigationEvent(createEvent("HomeScreen"));

      const result = manager.findPath("HomeScreen");
      assert.isTrue(result.found);
      assert.lengthOf(result.path, 0);
      assert.equal(result.startScreen, "HomeScreen");
      assert.equal(result.targetScreen, "HomeScreen");
    });

    it("should find direct path to adjacent screen", () => {
      manager.recordNavigationEvent(createEvent("Screen1", 1000));
      manager.recordNavigationEvent(createEvent("Screen2", 2000));
      // Go back to Screen1 to test path finding
      manager.recordNavigationEvent(createEvent("Screen1", 3000));

      const result = manager.findPath("Screen2");
      assert.isTrue(result.found);
      assert.lengthOf(result.path, 1);
      assert.equal(result.path[0].from, "Screen1");
      assert.equal(result.path[0].to, "Screen2");
    });

    it("should find multi-hop path", () => {
      // Create navigation: Home -> Settings -> Advanced
      manager.recordNavigationEvent(createEvent("Home", 1000));
      manager.recordNavigationEvent(createEvent("Settings", 2000));
      manager.recordNavigationEvent(createEvent("Advanced", 3000));
      // Go back to Home
      manager.recordNavigationEvent(createEvent("Home", 4000));

      const result = manager.findPath("Advanced");
      assert.isTrue(result.found);
      assert.lengthOf(result.path, 2);
      assert.equal(result.path[0].from, "Home");
      assert.equal(result.path[0].to, "Settings");
      assert.equal(result.path[1].from, "Settings");
      assert.equal(result.path[1].to, "Advanced");
    });

    it("should return not found when no path exists", () => {
      manager.recordNavigationEvent(createEvent("Screen1"));

      const result = manager.findPath("UnknownScreen");
      assert.isFalse(result.found);
      assert.lengthOf(result.path, 0);
    });

    it("should return not found when no current screen", () => {
      NavigationGraphManager.resetInstance();
      const freshManager = NavigationGraphManager.getInstance();
      freshManager.setCurrentApp("com.test.app");

      const result = freshManager.findPath("SomeScreen");
      assert.isFalse(result.found);
    });
  });

  describe("getStats", () => {
    it("should return correct stats for empty graph", () => {
      const stats = manager.getStats();
      assert.equal(stats.nodeCount, 0);
      assert.equal(stats.edgeCount, 0);
      assert.isNull(stats.currentScreen);
      assert.equal(stats.knownEdgeCount, 0);
      assert.equal(stats.unknownEdgeCount, 0);
      assert.equal(stats.toolCallHistorySize, 0);
    });

    it("should return correct stats after navigation", () => {
      manager.recordToolCall("tapOn", { text: "Settings" });
      manager.recordNavigationEvent(createEvent("Home", Date.now()));
      manager.recordNavigationEvent(createEvent("Settings", Date.now() + 100));

      const stats = manager.getStats();
      assert.equal(stats.nodeCount, 2);
      assert.equal(stats.edgeCount, 1);
      assert.equal(stats.currentScreen, "Settings");
      assert.equal(stats.knownEdgeCount, 1);
      assert.equal(stats.unknownEdgeCount, 0);
    });
  });

  describe("exportGraph", () => {
    it("should export empty graph correctly", () => {
      const exported = manager.exportGraph();
      assert.equal(exported.appId, "com.test.app");
      assert.lengthOf(exported.nodes, 0);
      assert.lengthOf(exported.edges, 0);
      assert.isNull(exported.currentScreen);
    });

    it("should export populated graph correctly", () => {
      manager.recordNavigationEvent(createEvent("Home", 1000));
      manager.recordNavigationEvent(createEvent("Settings", 2000));

      const exported = manager.exportGraph();
      assert.equal(exported.appId, "com.test.app");
      assert.lengthOf(exported.nodes, 2);
      assert.lengthOf(exported.edges, 1);
      assert.equal(exported.currentScreen, "Settings");

      const homeNode = exported.nodes.find(n => n.screenName === "Home");
      assert.isDefined(homeNode);
      assert.equal(homeNode!.visitCount, 1);
    });
  });

  describe("clearCurrentGraph", () => {
    it("should clear the current app's graph", () => {
      manager.recordNavigationEvent(createEvent("Screen1"));
      manager.recordNavigationEvent(createEvent("Screen2"));

      manager.clearCurrentGraph();

      // After clearing and re-setting app, should have empty graph
      manager.setCurrentApp("com.test.app");
      assert.deepEqual(manager.getKnownScreens(), []);
    });
  });

  describe("clearAllGraphs", () => {
    it("should clear all graphs", () => {
      manager.setCurrentApp("app1");
      manager.recordNavigationEvent(createEvent("Screen1"));

      manager.setCurrentApp("app2");
      manager.recordNavigationEvent(createEvent("Screen2"));

      manager.clearAllGraphs();

      assert.isNull(manager.getCurrentAppId());
      assert.deepEqual(manager.getKnownScreens(), []);
    });
  });

  describe("getEdgesTo", () => {
    it("should return edges leading to a screen", () => {
      manager.recordNavigationEvent(createEvent("Home", 1000));
      manager.recordNavigationEvent(createEvent("Settings", 2000));
      manager.recordNavigationEvent(createEvent("Home", 3000));
      manager.recordNavigationEvent(createEvent("Settings", 4000));

      const edges = manager.getEdgesTo("Settings");
      assert.lengthOf(edges, 2);
      edges.forEach(e => assert.equal(e.to, "Settings"));
    });
  });
});

// Helper function to create navigation events
function createEvent(
  destination: string,
  timestamp?: number
): NavigationEvent {
  return {
    destination,
    source: "TEST",
    arguments: {},
    metadata: {},
    timestamp: timestamp ?? Date.now(),
    sequenceNumber: 0
  };
}
