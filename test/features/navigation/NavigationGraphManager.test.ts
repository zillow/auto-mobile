import { expect, describe, test, beforeEach, afterEach, beforeAll, it } from "bun:test";
import {
  NavigationGraphManager,
  NavigationEvent
} from "../../../src/features/navigation/NavigationGraphManager";
import { runMigrations } from "../../helpers/database";

describe("NavigationGraphManager", () => {
  let manager: NavigationGraphManager;

  beforeAll(async () => {
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
    test("should return the same instance", () => {
      const instance1 = NavigationGraphManager.getInstance();
      const instance2 = NavigationGraphManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    test("should reset instance correctly", async () => {
      const instance1 = NavigationGraphManager.getInstance();
      await instance1.setCurrentApp("com.test.app");
      await instance1.recordNavigationEvent(createEvent("Screen1"));

      NavigationGraphManager.resetInstance();

      const instance2 = NavigationGraphManager.getInstance();
      expect(instance2.getCurrentAppId()).toBeNull();
      expect(await instance2.getKnownScreens()).toEqual([]);
    });
  });

  describe("setCurrentApp", () => {
    test("should set the current app", async () => {
      await manager.setCurrentApp("com.example.app");
      expect(manager.getCurrentAppId()).toBe("com.example.app");
    });

    test("should create separate graphs for different apps", async () => {
      await manager.setCurrentApp("com.app1");
      await manager.recordNavigationEvent(createEvent("Screen1"));

      await manager.setCurrentApp("com.app2");
      await manager.recordNavigationEvent(createEvent("Screen2"));

      // App2 should only know Screen2
      expect(await manager.getKnownScreens()).toEqual(["Screen2"]);

      // Switch back to app1
      await manager.setCurrentApp("com.app1");
      expect(await manager.getKnownScreens()).toEqual(["Screen1"]);
    });
  });

  describe("recordNavigationEvent", () => {
    test("should record a navigation event and create a node", async () => {
      const event = createEvent("HomeScreen");
      await manager.recordNavigationEvent(event);

      const screens = await manager.getKnownScreens();
      expect(screens).toEqual(["HomeScreen"]);
      expect(manager.getCurrentScreen()).toBe("HomeScreen");
    });

    test("should auto-set current app from applicationId in event", async () => {
      NavigationGraphManager.resetInstance();
      const freshManager = NavigationGraphManager.getInstance();

      // No app set initially
      expect(freshManager.getCurrentAppId()).toBeNull();

      // Record event with applicationId
      const event = createEvent("HomeScreen");
      event.applicationId = "com.auto.detected.app";
      await freshManager.recordNavigationEvent(event);

      // App should be auto-set
      expect(freshManager.getCurrentAppId()).toBe("com.auto.detected.app");
      expect(await freshManager.getKnownScreens()).toEqual(["HomeScreen"]);
    });

    test("should switch apps when applicationId changes", async () => {
      await manager.recordNavigationEvent(createEventWithApp("Screen1", "com.app1"));
      expect(manager.getCurrentAppId()).toBe("com.app1");
      expect(await manager.getKnownScreens()).toEqual(["Screen1"]);

      // Switch to different app
      await manager.recordNavigationEvent(createEventWithApp("Screen2", "com.app2"));
      expect(manager.getCurrentAppId()).toBe("com.app2");
      expect(await manager.getKnownScreens()).toEqual(["Screen2"]);

      // Original app's graph should still exist
      await manager.setCurrentApp("com.app1");
      expect(await manager.getKnownScreens()).toEqual(["Screen1"]);
    });

    test("should update node on revisit", async () => {
      const event1 = createEvent("HomeScreen", 1000);
      await manager.recordNavigationEvent(event1);

      const event2 = createEvent("HomeScreen", 2000);
      await manager.recordNavigationEvent(event2);

      const node = await manager.getNode("HomeScreen");
      expect(node).toBeDefined();
      expect(node!.visitCount).toBe(2);
      expect(node!.firstSeenAt).toBe(1000);
      expect(node!.lastSeenAt).toBe(2000);
    });

    test("should create edge when navigating between screens", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1", 1000));
      await manager.recordNavigationEvent(createEvent("Screen2", 2000));

      const edges = await manager.getEdgesFrom("Screen1");
      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe("Screen1");
      expect(edges[0].to).toBe("Screen2");
      expect(edges[0].edgeType).toBe("unknown"); // No tool call recorded
    });

    test("should not create edge for same screen navigation", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1", 1000));
      await manager.recordNavigationEvent(createEvent("Screen1", 2000));

      const edges = await manager.getEdgesFrom("Screen1");
      expect(edges).toHaveLength(0);
    });
  });

  describe("recordToolCall", () => {
    test("should record a tool call", async () => {
      manager.recordToolCall("tapOn", { text: "Button" });

      const stats = await manager.getStats();
      expect(stats.toolCallHistorySize).toBe(1);
    });

    test("should correlate tool call with navigation event", async () => {
      const now = Date.now();

      // Record tool call
      manager.recordToolCall("tapOn", { text: "Settings" });

      // Navigation event occurs 500ms after tool call
      await manager.recordNavigationEvent(createEvent("Screen1", now));
      await manager.recordNavigationEvent(createEvent("SettingsScreen", now + 500));

      const edges = await manager.getEdgesFrom("Screen1");
      expect(edges).toHaveLength(1);
      expect(edges[0].edgeType).toBe("tool");
      expect(edges[0].interaction).toBeDefined();
      expect(edges[0].interaction!.toolName).toBe("tapOn");
      expect(edges[0].interaction!.args).toEqual({ text: "Settings" });
    });

    test("should not correlate tool call outside correlation window", async () => {
      const now = Date.now();

      // Record tool call
      manager.recordToolCall("tapOn", { text: "Settings" });

      // Navigation event occurs 3000ms after tool call (outside 2000ms window)
      await manager.recordNavigationEvent(createEvent("Screen1", now));
      await manager.recordNavigationEvent(createEvent("SettingsScreen", now + 3000));

      const edges = await manager.getEdgesFrom("Screen1");
      expect(edges).toHaveLength(1);
      expect(edges[0].edgeType).toBe("unknown");
      expect(edges[0].interaction).toBeUndefined();
    });

    test("should use most recent tool call within window", async () => {
      const now = Date.now();

      // Record multiple tool calls
      manager.recordToolCall("tapOn", { text: "First" });
      manager.recordToolCall("tapOn", { text: "Second" });

      // Navigation event
      await manager.recordNavigationEvent(createEvent("Screen1", now));
      await manager.recordNavigationEvent(createEvent("Screen2", now + 500));

      const edges = await manager.getEdgesFrom("Screen1");
      expect(edges).toHaveLength(1);
      expect(edges[0].interaction!.args.text).toBe("Second");
    });
  });

  describe("findPath", () => {
    test("should find path when already on target screen", async () => {
      await manager.recordNavigationEvent(createEvent("HomeScreen"));

      const result = await manager.findPath("HomeScreen");
      expect(result.found).toBe(true);
      expect(result.path).toHaveLength(0);
      expect(result.startScreen).toBe("HomeScreen");
      expect(result.targetScreen).toBe("HomeScreen");
    });

    test("should find direct path to adjacent screen", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1", 1000));
      await manager.recordNavigationEvent(createEvent("Screen2", 2000));
      // Go back to Screen1 to test path finding
      await manager.recordNavigationEvent(createEvent("Screen1", 3000));

      const result = await manager.findPath("Screen2");
      expect(result.found).toBe(true);
      expect(result.path).toHaveLength(1);
      expect(result.path[0].from).toBe("Screen1");
      expect(result.path[0].to).toBe("Screen2");
    });

    test("should find multi-hop path", async () => {
      // Create navigation: Home -> Settings -> Advanced
      await manager.recordNavigationEvent(createEvent("Home", 1000));
      await manager.recordNavigationEvent(createEvent("Settings", 2000));
      await manager.recordNavigationEvent(createEvent("Advanced", 3000));
      // Go back to Home
      await manager.recordNavigationEvent(createEvent("Home", 4000));

      const result = await manager.findPath("Advanced");
      expect(result.found).toBe(true);
      expect(result.path).toHaveLength(2);
      expect(result.path[0].from).toBe("Home");
      expect(result.path[0].to).toBe("Settings");
      expect(result.path[1].from).toBe("Settings");
      expect(result.path[1].to).toBe("Advanced");
    });

    test("should return not found when no path exists", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1"));

      const result = await manager.findPath("UnknownScreen");
      expect(result.found).toBe(false);
      expect(result.path).toHaveLength(0);
    });

    test("should return not found when no current screen", async () => {
      NavigationGraphManager.resetInstance();
      const freshManager = NavigationGraphManager.getInstance();
      await freshManager.setCurrentApp("com.test.app");

      const result = await freshManager.findPath("SomeScreen");
      expect(result.found).toBe(false);
    });
  });

  describe("getStats", () => {
    test("should return correct stats for empty graph", async () => {
      const stats = await manager.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.currentScreen).toBeNull();
      expect(stats.knownEdgeCount).toBe(0);
      expect(stats.unknownEdgeCount).toBe(0);
      expect(stats.toolCallHistorySize).toBe(0);
    });

    test("should return correct stats after navigation", async () => {
      manager.recordToolCall("tapOn", { text: "Settings" });
      await manager.recordNavigationEvent(createEvent("Home", Date.now()));
      await manager.recordNavigationEvent(createEvent("Settings", Date.now() + 100));

      const stats = await manager.getStats();
      expect(stats.nodeCount).toBe(2);
      expect(stats.edgeCount).toBe(1);
      expect(stats.currentScreen).toBe("Settings");
      expect(stats.knownEdgeCount).toBe(1);
      expect(stats.unknownEdgeCount).toBe(0);
    });
  });

  describe("exportGraph", () => {
    test("should export empty graph correctly", async () => {
      const exported = await manager.exportGraph();
      expect(exported.appId).toBe("com.test.app");
      expect(exported.nodes).toHaveLength(0);
      expect(exported.edges).toHaveLength(0);
      expect(exported.currentScreen).toBeNull();
    });

    test("should export populated graph correctly", async () => {
      await manager.recordNavigationEvent(createEvent("Home", 1000));
      await manager.recordNavigationEvent(createEvent("Settings", 2000));

      const exported = await manager.exportGraph();
      expect(exported.appId).toBe("com.test.app");
      expect(exported.nodes).toHaveLength(2);
      expect(exported.edges).toHaveLength(1);
      expect(exported.currentScreen).toBe("Settings");

      const homeNode = exported.nodes.find(n => n.screenName === "Home");
      expect(homeNode).toBeDefined();
      expect(homeNode!.visitCount).toBe(1);
    });
  });

  describe("clearCurrentGraph", () => {
    test("should clear the current app's graph", async () => {
      await manager.recordNavigationEvent(createEvent("Screen1"));
      await manager.recordNavigationEvent(createEvent("Screen2"));

      await manager.clearCurrentGraph();

      // After clearing and re-setting app, should have empty graph
      await manager.setCurrentApp("com.test.app");
      expect(await manager.getKnownScreens()).toEqual([]);
    });
  });

  describe("clearAllGraphs", () => {
    test("should clear all graphs", async () => {
      await manager.setCurrentApp("app1");
      await manager.recordNavigationEvent(createEvent("Screen1"));

      await manager.setCurrentApp("app2");
      await manager.recordNavigationEvent(createEvent("Screen2"));

      await manager.clearAllGraphs();

      expect(manager.getCurrentAppId()).toBeNull();
      expect(await manager.getKnownScreens()).toEqual([]);
    });
  });

  describe("getEdgesTo", () => {
    test("should return edges leading to a screen", async () => {
      await manager.recordNavigationEvent(createEvent("Home", 1000));
      await manager.recordNavigationEvent(createEvent("Settings", 2000));
      await manager.recordNavigationEvent(createEvent("Home", 3000));
      await manager.recordNavigationEvent(createEvent("Settings", 4000));

      const edges = await manager.getEdgesTo("Settings");
      expect(edges).toHaveLength(2);
      edges.forEach(e => expect(e.to).toBe("Settings"));
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

  beforeAll(async () => {
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
    expect(edges).toHaveLength(1);
    expect(edges[0].uiState).toBeDefined();
    expect(edges[0].uiState!.scrollPosition).toBeDefined();
    expect(edges[0].uiState!.scrollPosition!.targetElement.text).toBe("Advanced Settings");
    expect(edges[0].uiState!.scrollPosition!.direction).toBe("down");
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
    expect(edges).toHaveLength(1);
    expect(edges[0].uiState).toBeDefined();
    expect(edges[0].uiState!.selectedElements).toHaveLength(1);
    expect(edges[0].uiState!.selectedElements[0].text).toBe("Settings Tab");
    expect(edges[0].uiState!.scrollPosition).toBeDefined();
    expect(edges[0].uiState!.scrollPosition!.targetElement.text).toBe("Advanced Settings");
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
    expect(edges).toHaveLength(1);
    const scrollPos = edges[0].uiState!.scrollPosition!;
    expect(scrollPos.targetElement.text).toBe("Item");
    expect(scrollPos.container!.resourceId).toBe("com.app:id/list");
    expect(scrollPos.direction).toBe("up");
    expect(scrollPos.speed).toBe("slow");
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
    expect(edges).toHaveLength(1);
    expect(edges[0].uiState!.scrollPosition!.targetElement.text).toBe("Second");
  });
});

describe("NavigationGraphManager - Named Nodes Only", () => {
  let manager: NavigationGraphManager;

  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    NavigationGraphManager.resetInstance();
    manager = NavigationGraphManager.getInstance();
    await manager.setCurrentApp("com.test.namedapp");
    await manager.clearCurrentGraph();
    await manager.setCurrentApp("com.test.namedapp");
  });

  afterEach(async () => {
    NavigationGraphManager.resetInstance();
  });

  describe("recordHierarchyNavigation", () => {
    it("should NOT create nodes from hierarchy events alone", async () => {
      // Record hierarchy navigation without any SDK events
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "abc123def456",
        timestamp: Date.now(),
        packageName: "com.test.namedapp"
      });

      // Should have no nodes since app has no named nodes yet
      const screens = await manager.getKnownScreens();
      expect(screens).toHaveLength(0);
    });

    it("should correlate fingerprint during active navigation window", async () => {
      const now = Date.now();

      // First, create a named node via SDK event
      await manager.recordNavigationEvent(createEvent("HomeScreen", now));

      // Then, hierarchy event within 1000ms window should correlate
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_home_123",
        fingerprintData: JSON.stringify({ layout: "home" }),
        timestamp: now + 500, // Within 1000ms window
        packageName: "com.test.namedapp"
      });

      // Should still have only one node (HomeScreen)
      const screens = await manager.getKnownScreens();
      expect(screens).toHaveLength(1);
      expect(screens[0]).toBe("HomeScreen");

      // The fingerprint should be correlated to this node
      // Future hierarchy events with same fingerprint should update this node
    });

    it("should create suggestion when fingerprint is outside navigation window", async () => {
      const now = Date.now();

      // First, create a named node via SDK event
      await manager.recordNavigationEvent(createEvent("HomeScreen", now));

      // Hierarchy event outside the 1000ms window should create suggestion
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_settings_456",
        fingerprintData: JSON.stringify({ layout: "settings" }),
        timestamp: now + 1500, // Outside 1000ms window
        packageName: "com.test.namedapp"
      });

      // Should have suggestions
      const suggestions = await manager.getSuggestions();
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0].fingerprintHash).toBe("fingerprint_settings_456");
    });

    it("should update existing node when fingerprint is already correlated", async () => {
      const now = Date.now();

      // Create named node and correlate fingerprint
      await manager.recordNavigationEvent(createEvent("HomeScreen", now));
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_home_123",
        timestamp: now + 500,
        packageName: "com.test.namedapp"
      });

      // Navigate away
      await manager.recordNavigationEvent(createEvent("Settings", now + 2000));

      // Now hierarchy event with same fingerprint should update HomeScreen
      // Using timestamp well outside the active navigation window (>1000ms)
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_home_123",
        timestamp: now + 5000, // 3000ms after Settings navigation, well outside window
        packageName: "com.test.namedapp"
      });

      // Should update current screen to HomeScreen
      expect(manager.getCurrentScreen()).toBe("HomeScreen");

      // Check visit count increased
      const node = await manager.getNode("HomeScreen");
      expect(node).toBeDefined();
      expect(node!.visitCount).toBe(2);
    });
  });

  describe("getSuggestions and promoteSuggestion", () => {
    it("should return empty suggestions for app without named nodes", async () => {
      // No SDK events, no named nodes
      const suggestions = await manager.getSuggestions();
      expect(suggestions).toHaveLength(0);
    });

    it("should promote suggestion to named node", async () => {
      const now = Date.now();

      // Create a named node so app has named nodes
      await manager.recordNavigationEvent(createEvent("HomeScreen", now));

      // Create a suggestion by sending hierarchy event outside window
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_settings_456",
        fingerprintData: JSON.stringify({ layout: "settings" }),
        timestamp: now + 1500, // Outside window
        packageName: "com.test.namedapp"
      });

      // Get suggestions
      const suggestions = await manager.getSuggestions();
      expect(suggestions.length).toBeGreaterThanOrEqual(1);

      const settingsSuggestion = suggestions.find(
        s => s.fingerprintHash === "fingerprint_settings_456"
      );
      expect(settingsSuggestion).toBeDefined();

      // Promote the suggestion
      await manager.promoteSuggestion(settingsSuggestion!.id, "SettingsScreen");

      // Should now have two named nodes
      const screens = await manager.getKnownScreens();
      expect(screens).toContain("HomeScreen");
      expect(screens).toContain("SettingsScreen");

      // Suggestion should no longer appear in unpromoted list
      const remainingSuggestions = await manager.getSuggestions();
      const stillPresent = remainingSuggestions.find(
        s => s.fingerprintHash === "fingerprint_settings_456"
      );
      expect(stillPresent).toBeUndefined();
    });

    it("should recognize promoted fingerprint on future hierarchy events", async () => {
      const now = Date.now();

      // Create named node and suggestion
      await manager.recordNavigationEvent(createEvent("HomeScreen", now));
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_settings_456",
        fingerprintData: JSON.stringify({ layout: "settings" }),
        timestamp: now + 1500, // Outside HomeScreen's window
        packageName: "com.test.namedapp"
      });

      // Promote suggestion
      const suggestions = await manager.getSuggestions();
      const settingsSuggestion = suggestions.find(
        s => s.fingerprintHash === "fingerprint_settings_456"
      );
      await manager.promoteSuggestion(settingsSuggestion!.id, "SettingsScreen");

      // Navigate somewhere else
      await manager.recordNavigationEvent(createEvent("Profile", now + 3000));

      // Now hierarchy event with same fingerprint should update SettingsScreen
      // Using timestamp well outside the active navigation window
      await manager.recordHierarchyNavigation({
        fromFingerprint: null,
        toFingerprint: "fingerprint_settings_456",
        timestamp: now + 6000, // 3000ms after Profile navigation, well outside window
        packageName: "com.test.namedapp"
      });

      // Current screen should be SettingsScreen
      expect(manager.getCurrentScreen()).toBe("SettingsScreen");
    });
  });
});
