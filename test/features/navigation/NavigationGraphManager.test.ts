import { assert } from "chai";
import {
  NavigationGraphManager,
  NavigationEvent
} from "../../../src/features/navigation/NavigationGraphManager";
import { runMigrations } from "../../helpers/database";

describe("NavigationGraphManager", () => {
  let manager: NavigationGraphManager;

  before(async () => {
    // Run database migrations once before all tests
    await runMigrations();
  });

  beforeEach(async () => {
    // Reset singleton between tests
    NavigationGraphManager.resetInstance();
    manager = NavigationGraphManager.getInstance();
    // Set up a test app and clear any existing data
    await manager.setCurrentApp("com.test.app");
    await manager.clearCurrentGraph();
    // Re-set app after clearing (clearCurrentGraph sets currentScreen to null)
    await manager.setCurrentApp("com.test.app");
  });

  afterEach(async () => {
    NavigationGraphManager.resetInstance();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const instance1 = NavigationGraphManager.getInstance();
      const instance2 = NavigationGraphManager.getInstance();
      assert.strictEqual(instance1, instance2);
    });

    it("should reset instance correctly", async () => {
      const instance1 = NavigationGraphManager.getInstance();
      await instance1.setCurrentApp("com.test.app");
      await instance1.recordNavigationEvent(createEvent("Screen1"));

      NavigationGraphManager.resetInstance();

      const instance2 = NavigationGraphManager.getInstance();
      assert.isNull(instance2.getCurrentAppId());
      assert.deepEqual(await instance2.getKnownScreens(), []);
    });
  });

  describe("setCurrentApp", () => {
    it("should set the current app", async () => {
      await manager.setCurrentApp("com.example.app");
      assert.equal(manager.getCurrentAppId(), "com.example.app");
    });

    it("should create separate graphs for different apps", async () => {
      await manager.setCurrentApp("com.app1");
      await manager.recordNavigationEvent(createEvent("Screen1"));

      await manager.setCurrentApp("com.app2");
      await manager.recordNavigationEvent(createEvent("Screen2"));

      // App2 should only know Screen2
      assert.deepEqual(await manager.getKnownScreens(), ["Screen2"]);

      // Switch back to app1
      await manager.setCurrentApp("com.app1");
      assert.deepEqual(await manager.getKnownScreens(), ["Screen1"]);
    });
  });

  describe("recordNavigationEvent", () => {
    it("should record a navigation event and create a node", async () => {
      const event = createEvent("HomeScreen");
      await manager.recordNavigationEvent(event);

      const screens = await manager.getKnownScreens();
      assert.deepEqual(screens, ["HomeScreen"]);
      assert.equal(manager.getCurrentScreen(), "HomeScreen");
    });

    it("should auto-set current app from applicationId in event", async () => {
      NavigationGraphManager.resetInstance();
      const freshManager = NavigationGraphManager.getInstance();

      // No app set initially
      assert.isNull(freshManager.getCurrentAppId());

      // Record event with applicationId
      const event = createEvent("HomeScreen");
      event.applicationId = "com.auto.detected.app";
      await freshManager.recordNavigationEvent(event);

      // App should be auto-set
      assert.equal(freshManager.getCurrentAppId(), "com.auto.detected.app");
      assert.deepEqual(await freshManager.getKnownScreens(), ["HomeScreen"]);
    });

    it("should switch apps when applicationId changes", async () => {
      await manager.recordNavigationEvent(createEventWithApp("Screen1", "com.app1"));
      assert.equal(manager.getCurrentAppId(), "com.app1");
      assert.deepEqual(await manager.getKnownScreens(), ["Screen1"]);

      // Switch to different app
      await manager.recordNavigationEvent(createEventWithApp("Screen2", "com.app2"));
      assert.equal(manager.getCurrentAppId(), "com.app2");
      assert.deepEqual(await manager.getKnownScreens(), ["Screen2"]);

      // Original app's graph should still exist
      await manager.setCurrentApp("com.app1");
      assert.deepEqual(await manager.getKnownScreens(), ["Screen1"]);
    });

    it("should update node on revisit", async () => {
      const event1 = createEvent("HomeScreen", 1000);
      await manager.recordNavigationEvent(event1);

      const event2 = createEvent("HomeScreen", 2000);
      await manager.recordNavigationEvent(event2);

      const node = await manager.getNode("HomeScreen");
      assert.isDefined(node);
      assert.equal(node!.visitCount, 2);
      assert.equal(node!.firstSeenAt, 1000);
      assert.equal(node!.lastSeenAt, 2000);
    });

    it("should create edge when navigating between screens", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1", 1000));
      await manager.recordNavigationEvent(createEvent("Screen2", 2000));

      const edges = await manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].from, "Screen1");
      assert.equal(edges[0].to, "Screen2");
      assert.equal(edges[0].edgeType, "unknown"); // No tool call recorded
    });

    it("should not create edge for same screen navigation", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1", 1000));
      await manager.recordNavigationEvent(createEvent("Screen1", 2000));

      const edges = await manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 0);
    });
  });

  describe("recordToolCall", () => {
    it("should record a tool call", async () => {
      manager.recordToolCall("tapOn", { text: "Button" });

      const stats = await manager.getStats();
      assert.equal(stats.toolCallHistorySize, 1);
    });

    it("should correlate tool call with navigation event", async () => {
      const now = Date.now();

      // Record tool call
      manager.recordToolCall("tapOn", { text: "Settings" });

      // Navigation event occurs 500ms after tool call
      await manager.recordNavigationEvent(createEvent("Screen1", now));
      await manager.recordNavigationEvent(createEvent("SettingsScreen", now + 500));

      const edges = await manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].edgeType, "tool");
      assert.isDefined(edges[0].interaction);
      assert.equal(edges[0].interaction!.toolName, "tapOn");
      assert.deepEqual(edges[0].interaction!.args, { text: "Settings" });
    });

    it("should not correlate tool call outside correlation window", async () => {
      const now = Date.now();

      // Record tool call
      manager.recordToolCall("tapOn", { text: "Settings" });

      // Navigation event occurs 3000ms after tool call (outside 2000ms window)
      await manager.recordNavigationEvent(createEvent("Screen1", now));
      await manager.recordNavigationEvent(createEvent("SettingsScreen", now + 3000));

      const edges = await manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].edgeType, "unknown");
      assert.isUndefined(edges[0].interaction);
    });

    it("should use most recent tool call within window", async () => {
      const now = Date.now();

      // Record multiple tool calls
      manager.recordToolCall("tapOn", { text: "First" });
      manager.recordToolCall("tapOn", { text: "Second" });

      // Navigation event
      await manager.recordNavigationEvent(createEvent("Screen1", now));
      await manager.recordNavigationEvent(createEvent("Screen2", now + 500));

      const edges = await manager.getEdgesFrom("Screen1");
      assert.lengthOf(edges, 1);
      assert.equal(edges[0].interaction!.args.text, "Second");
    });
  });

  describe("findPath", () => {
    it("should find path when already on target screen", async () => {
      await manager.recordNavigationEvent(createEvent("HomeScreen"));

      const result = await manager.findPath("HomeScreen");
      assert.isTrue(result.found);
      assert.lengthOf(result.path, 0);
      assert.equal(result.startScreen, "HomeScreen");
      assert.equal(result.targetScreen, "HomeScreen");
    });

    it("should find direct path to adjacent screen", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1", 1000));
      await manager.recordNavigationEvent(createEvent("Screen2", 2000));
      // Go back to Screen1 to test path finding
      await manager.recordNavigationEvent(createEvent("Screen1", 3000));

      const result = await manager.findPath("Screen2");
      assert.isTrue(result.found);
      assert.lengthOf(result.path, 1);
      assert.equal(result.path[0].from, "Screen1");
      assert.equal(result.path[0].to, "Screen2");
    });

    it("should find multi-hop path", async () => {
      // Create navigation: Home -> Settings -> Advanced
      await manager.recordNavigationEvent(createEvent("Home", 1000));
      await manager.recordNavigationEvent(createEvent("Settings", 2000));
      await manager.recordNavigationEvent(createEvent("Advanced", 3000));
      // Go back to Home
      await manager.recordNavigationEvent(createEvent("Home", 4000));

      const result = await manager.findPath("Advanced");
      assert.isTrue(result.found);
      assert.lengthOf(result.path, 2);
      assert.equal(result.path[0].from, "Home");
      assert.equal(result.path[0].to, "Settings");
      assert.equal(result.path[1].from, "Settings");
      assert.equal(result.path[1].to, "Advanced");
    });

    it("should return not found when no path exists", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1"));

      const result = await manager.findPath("UnknownScreen");
      assert.isFalse(result.found);
      assert.lengthOf(result.path, 0);
    });

    it("should return not found when no current screen", async () => {
      NavigationGraphManager.resetInstance();
      const freshManager = NavigationGraphManager.getInstance();
      await freshManager.setCurrentApp("com.test.app");

      const result = await freshManager.findPath("SomeScreen");
      assert.isFalse(result.found);
    });
  });

  describe("getStats", () => {
    it("should return correct stats for empty graph", async () => {
      const stats = await manager.getStats();
      assert.equal(stats.nodeCount, 0);
      assert.equal(stats.edgeCount, 0);
      assert.isNull(stats.currentScreen);
      assert.equal(stats.knownEdgeCount, 0);
      assert.equal(stats.unknownEdgeCount, 0);
      assert.equal(stats.toolCallHistorySize, 0);
    });

    it("should return correct stats after navigation", async () => {
      manager.recordToolCall("tapOn", { text: "Settings" });
      await manager.recordNavigationEvent(createEvent("Home", Date.now()));
      await manager.recordNavigationEvent(createEvent("Settings", Date.now() + 100));

      const stats = await manager.getStats();
      assert.equal(stats.nodeCount, 2);
      assert.equal(stats.edgeCount, 1);
      assert.equal(stats.currentScreen, "Settings");
      assert.equal(stats.knownEdgeCount, 1);
      assert.equal(stats.unknownEdgeCount, 0);
    });
  });

  describe("exportGraph", () => {
    it("should export empty graph correctly", async () => {
      const exported = await manager.exportGraph();
      assert.equal(exported.appId, "com.test.app");
      assert.lengthOf(exported.nodes, 0);
      assert.lengthOf(exported.edges, 0);
      assert.isNull(exported.currentScreen);
    });

    it("should export populated graph correctly", async () => {
      await manager.recordNavigationEvent(createEvent("Home", 1000));
      await manager.recordNavigationEvent(createEvent("Settings", 2000));

      const exported = await manager.exportGraph();
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
    it("should clear the current app's graph", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1"));
      await manager.recordNavigationEvent(createEvent("Screen2"));

      await manager.clearCurrentGraph();

      // After clearing and re-setting app, should have empty graph
      await manager.setCurrentApp("com.test.app");
      assert.deepEqual(await manager.getKnownScreens(), []);
    });
  });

  describe("clearAllGraphs", () => {
    it("should clear all graphs", async () => {
      await manager.setCurrentApp("app1");
      await manager.recordNavigationEvent(createEvent("Screen1"));

      await manager.setCurrentApp("app2");
      await manager.recordNavigationEvent(createEvent("Screen2"));

      await manager.clearAllGraphs();

      assert.isNull(manager.getCurrentAppId());
      assert.deepEqual(await manager.getKnownScreens(), []);
    });
  });

  describe("getEdgesTo", () => {
    it("should return edges leading to a screen", async () => {
      await manager.recordNavigationEvent(createEvent("Home", 1000));
      await manager.recordNavigationEvent(createEvent("Settings", 2000));
      await manager.recordNavigationEvent(createEvent("Home", 3000));
      await manager.recordNavigationEvent(createEvent("Settings", 4000));

      const edges = await manager.getEdgesTo("Settings");
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

// Helper function to create navigation events with applicationId
function createEventWithApp(
  destination: string,
  applicationId: string,
  timestamp?: number
): NavigationEvent {
  return {
    destination,
    source: "TEST",
    arguments: {},
    metadata: {},
    timestamp: timestamp ?? Date.now(),
    sequenceNumber: 0,
    applicationId
  };
}

describe("NavigationGraphManager - Scroll Position", () => {
  let manager: NavigationGraphManager;

  before(async () => {
    // Run database migrations once before all tests
    await runMigrations();
  });

  beforeEach(async () => {
    // Get singleton and clear
    manager = NavigationGraphManager.getInstance();
    await manager.clearAllGraphs();
    await manager.setCurrentApp("com.test.scrollapp");
  });

  afterEach(async () => {
    await manager.clearAllGraphs();
  });

  it("should update scroll position on most recent swipeOn tool call", async () => {
    // Record a swipeOn tool call
    manager.recordToolCall("swipeOn", {
      direction: "down",
      lookFor: { text: "Advanced Settings" }
    });

    // Update with scroll position
    manager.updateScrollPosition({
      targetElement: { text: "Advanced Settings" },
      direction: "down"
    });

    // Record navigation event to correlate
    await manager.recordNavigationEvent(createEvent("Settings"));
    await manager.recordNavigationEvent(createEvent("AdvancedSettings"));

    // Check that the edge has scroll position
    const edges = await manager.getEdgesFrom("Settings");
    assert.lengthOf(edges, 1);
    assert.isDefined(edges[0].uiState);
    assert.isDefined(edges[0].uiState!.scrollPosition);
    assert.equal(edges[0].uiState!.scrollPosition!.targetElement.text, "Advanced Settings");
    assert.equal(edges[0].uiState!.scrollPosition!.direction, "down");
  });

  it("should update existing uiState with scroll position", async () => {
    // Record a swipeOn tool call with existing UI state
    const existingUIState = {
      selectedElements: [{ text: "Settings Tab" }],
      destinationId: "Settings"
    };
    manager.recordToolCall("swipeOn", {
      direction: "down",
      lookFor: { text: "Advanced Settings" }
    }, existingUIState);

    // Update with scroll position
    manager.updateScrollPosition({
      targetElement: { text: "Advanced Settings" },
      direction: "down"
    });

    // Record navigation event
    await manager.recordNavigationEvent(createEvent("Settings"));
    await manager.recordNavigationEvent(createEvent("AdvancedSettings"));

    // Check that both selected elements and scroll position exist
    const edges = await manager.getEdgesFrom("Settings");
    assert.lengthOf(edges, 1);
    assert.isDefined(edges[0].uiState);
    assert.lengthOf(edges[0].uiState!.selectedElements, 1);
    assert.equal(edges[0].uiState!.selectedElements[0].text, "Settings Tab");
    assert.isDefined(edges[0].uiState!.scrollPosition);
    assert.equal(edges[0].uiState!.scrollPosition!.targetElement.text, "Advanced Settings");
  });

  it("should handle scroll position with container and speed", async () => {
    manager.recordToolCall("swipeOn", {
      direction: "up",
      lookFor: { text: "Item" },
      container: { resourceId: "com.app:id/list" },
      speed: "slow"
    });

    manager.updateScrollPosition({
      targetElement: { text: "Item" },
      container: { resourceId: "com.app:id/list" },
      direction: "up",
      speed: "slow"
    });

    await manager.recordNavigationEvent(createEvent("Home"));
    await manager.recordNavigationEvent(createEvent("Details"));

    const edges = await manager.getEdgesFrom("Home");
    assert.lengthOf(edges, 1);
    const scrollPos = edges[0].uiState!.scrollPosition!;
    assert.equal(scrollPos.targetElement.text, "Item");
    assert.equal(scrollPos.container!.resourceId, "com.app:id/list");
    assert.equal(scrollPos.direction, "up");
    assert.equal(scrollPos.speed, "slow");
  });

  it("should not update if no swipeOn tool call exists", () => {
    // Record a different tool call
    manager.recordToolCall("tapOn", { text: "Button" });

    // Try to update scroll position
    manager.updateScrollPosition({
      targetElement: { text: "Element" },
      direction: "down"
    });

    // Should not throw, just log and return
    // No assertion needed, just verify it doesn't crash
  });

  it("should update most recent swipeOn when multiple exist", async () => {
    // Record multiple swipeOn calls
    manager.recordToolCall("swipeOn", {
      direction: "down",
      lookFor: { text: "First" }
    });

    manager.recordToolCall("swipeOn", {
      direction: "up",
      lookFor: { text: "Second" }
    });

    // Update should affect the most recent one
    manager.updateScrollPosition({
      targetElement: { text: "Second" },
      direction: "up"
    });

    await manager.recordNavigationEvent(createEvent("Screen1"));
    await manager.recordNavigationEvent(createEvent("Screen2"));

    const edges = await manager.getEdgesFrom("Screen1");
    assert.lengthOf(edges, 1);
    assert.equal(edges[0].uiState!.scrollPosition!.targetElement.text, "Second");
  });
});
