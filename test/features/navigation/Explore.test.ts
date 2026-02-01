import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { Explore } from "../../../src/features/navigation/Explore";
import { BootedDevice, Element, ObserveResult } from "../../../src/models";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { FakeNavigationGraphManager } from "../../fakes/FakeNavigationGraphManager";
import { FakeTimer } from "../../fakes/FakeTimer";

// Import extracted functions for testing
import {
  extractNavigationElements,
  getElementKey
} from "../../../src/features/navigation/ExploreElementExtraction";
import {
  calculateNavigationScore
} from "../../../src/features/navigation/ExploreElementScoring";
import {
  isPermissionDialog,
  isLoginScreen,
  isRatingDialog
} from "../../../src/features/navigation/ExploreBlockerDetection";
import {
  initializeGraphTraversal,
  getEdgeKey,
  markNodeVisited,
  markEdgeTraversed,
  selectNextEdgeToTraverse
} from "../../../src/features/navigation/ExploreValidateMode";
import { ElementParser } from "../../../src/features/utility/ElementParser";

describe("Explore", () => {
  let explore: Explore;
  let device: BootedDevice;
  let mockAdb: any;
  let mockObserveScreen: any;
  let fakeGraph: FakeNavigationGraphManager;
  let fakeTimer: FakeTimer;
  let elementParser: ElementParser;

  beforeEach(() => {
    fakeGraph = new FakeNavigationGraphManager();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    elementParser = new ElementParser();

    // Create fake device
    device = {
      deviceId: "test-device-123",
      platform: "android",
      source: "local"
    } as BootedDevice;

    // Create mock ADB client
    mockAdb = {
      executeCommand: async (cmd: string) => {
        if (cmd.includes("KEYCODE_BACK")) {
          // Simulate navigation event when back is pressed
          fakeGraph.recordNavigationEvent({
            destination: "PreviousScreen",
            source: "TEST",
            arguments: {},
            metadata: {},
            timestamp: Date.now(),
            sequenceNumber: 0,
            applicationId: "com.test.app"
          });
          return "Back button pressed";
        }
        if (cmd.includes("KEYCODE_HOME")) {
          return "Home button pressed";
        }
        return "";
      }
    } as AdbClient;

    // Create mock ObserveScreen that cycles through different screens
    let observeCallCount = 0;
    mockObserveScreen = {
      execute: async () => {
        observeCallCount++;
        // Alternate between screens to simulate navigation
        if (observeCallCount % 2 === 0) {
          fakeGraph.recordNavigationEvent({
            destination: `Screen${observeCallCount}`,
            source: "TEST",
            arguments: {},
            metadata: {},
            timestamp: Date.now(),
            sequenceNumber: observeCallCount,
            applicationId: "com.test.app"
          });
        }
        return createMockObservation();
      },
      getMostRecentCachedObserveResult: async () => {
        return createMockObservation();
      }
    };
  });

  afterEach(() => {
    // No cleanup needed since we're using injected fakes
  });

  function createMockViewHierarchyNode(overrides: any = {}): any {
    const defaults = {
      $: {
        "class": "android.widget.Button",
        "text": "Button",
        "resource-id": "com.test:id/button",
        "clickable": "true",
        "enabled": "true",
        "bounds": "[0,0][100,50]"
      }
    };

    return {
      $: { ...defaults.$, ...overrides },
      bounds: { left: 0, top: 0, right: 100, bottom: 50 }
    };
  }

  function createMockElement(overrides: Partial<Element> = {}): Element {
    return {
      "bounds": { left: 0, top: 0, right: 100, bottom: 50 },
      "clickable": true,
      "enabled": true,
      "text": "Button",
      "class": "android.widget.Button",
      "resource-id": "com.test:id/button",
      ...overrides
    } as Element;
  }

  function createMockObservation(nodes: any[] = [], packageName: string = "com.test.app"): ObserveResult {
    const defaultNodes = nodes.length > 0 ? nodes : [
      createMockViewHierarchyNode({
        "text": "Settings",
        "resource-id": "com.test:id/settings_btn"
      }),
      createMockViewHierarchyNode({
        "text": "Profile",
        "resource-id": "com.test:id/profile_btn"
      })
    ];

    return {
      viewHierarchy: {
        hierarchy: {
          node: defaultNodes
        },
        packageName
      }
    } as ObserveResult;
  }

  describe("execute", () => {
    // Core execute functionality is tested through the unit tests below
    // Full device integration tests are in JUnitRunner and XCTestRunner
  });

  describe("element selection", () => {
    test("should prioritize navigation elements", async () => {
      const nodes = [
        createMockViewHierarchyNode({
          "text": "Settings",
          "class": "android.widget.Button",
          "resource-id": "com.test:id/settings_btn"
        }),
        createMockViewHierarchyNode({
          "text": "Like",
          "class": "android.widget.ImageButton",
          "clickable": "true"
        }),
        createMockViewHierarchyNode({
          "text": "",
          "class": "android.widget.EditText",
          "clickable": "true"
        })
      ];

      const mockObservation = createMockObservation(nodes);

      const navElements = extractNavigationElements(mockObservation.viewHierarchy, elementParser);

      // Should filter out EditText
      expect(navElements.length).toBeLessThan(nodes.length);

      // Should include Settings button
      const hasSettings = navElements.some((el: Element) => el.text === "Settings");
      expect(hasSettings).toBe(true);
    });

    test("should calculate navigation scores correctly", async () => {
      const buttonElement = createMockElement({
        "text": "Settings",
        "class": "android.widget.Button",
        "resource-id": "com.test:id/settings_btn"
      });
      // Set hierarchyDepth for button (deeper in the hierarchy)
      (buttonElement as any).hierarchyDepth = 8;

      const tabElement = createMockElement({
        "text": "Profile",
        "class": "android.widget.TabLayout",
        "resource-id": "com.test:id/tab_profile"
      });
      // Set hierarchyDepth for tab (closer to root, should score higher)
      (tabElement as any).hierarchyDepth = 2;

      const buttonScore = calculateNavigationScore(buttonElement);
      const tabScore = calculateNavigationScore(tabElement);

      // Tab should score higher than button due to being closer to root
      // Button: 5 (clickable) + max(0, 25 - 8*2) = 5 + 9 = 14
      // Tab: 5 (clickable) + max(0, 25 - 2*2) = 5 + 21 = 26
      expect(tabScore).toBeGreaterThan(buttonScore);
      expect(buttonScore).toBeGreaterThan(0);
    });

    test("should filter out non-clickable elements", async () => {
      const nodes = [
        createMockViewHierarchyNode({ "clickable": "true" }),
        createMockViewHierarchyNode({ "clickable": "false" }),
        createMockViewHierarchyNode({ "clickable": "true", "enabled": "false" })
      ];

      const mockObservation = createMockObservation(nodes);

      const navElements = extractNavigationElements(mockObservation.viewHierarchy, elementParser);

      // Should only include enabled clickable elements
      expect(navElements.length).toBe(1);
    });
  });

  describe("blocker detection", () => {
    test("should detect permission dialogs", async () => {
      const elements = [
        createMockElement({ text: "Allow" }),
        createMockElement({ text: "While using the app" }),
        createMockElement({ text: "This app needs camera permission" })
      ];

      const isPermission = isPermissionDialog(elements);

      expect(isPermission).toBe(true);
    });

    test("should detect login screens", async () => {
      const elements = [
        createMockElement({ "text": "Sign in", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" }),
        createMockElement({ "text": "Password", "class": "android.widget.TextView" })
      ];

      const isLogin = isLoginScreen(elements);

      expect(isLogin).toBe(true);
    });

    test("should detect rating dialogs", async () => {
      const elements = [
        createMockElement({ text: "Rate this app" }),
        createMockElement({ text: "Not now" }),
        createMockElement({ text: "5 stars" })
      ];

      const isRating = isRatingDialog(elements);

      expect(isRating).toBe(true);
    });

    test("should not detect regular screens as blockers", async () => {
      const elements = [
        createMockElement({ text: "Home" }),
        createMockElement({ text: "Settings" }),
        createMockElement({ text: "Profile" })
      ];

      const isPermission = isPermissionDialog(elements);
      const isLogin = isLoginScreen(elements);
      const isRating = isRatingDialog(elements);

      expect(isPermission).toBe(false);
      expect(isLogin).toBe(false);
      expect(isRating).toBe(false);
    });
  });

  // Exploration strategies and modes are tested through unit tests
  // Full device integration tests are in JUnitRunner and XCTestRunner

  // Safety features are tested through unit tests
  // Full device integration tests are in JUnitRunner and XCTestRunner

  describe("foreground app enforcement", () => {
    test("should default to initial foreground package when packageName is not provided", async () => {
      const outOfAppLimit = (Explore as any).MAX_OUT_OF_APP_ATTEMPTS ?? 5;
      const backPresses: string[] = [];
      const adbWithTracking = {
        executeCommand: async (cmd: string) => {
          if (cmd.includes("KEYCODE_BACK")) {
            backPresses.push(cmd);
          }
          return "";
        }
      } as AdbClient;

      explore = new Explore(device, adbWithTracking, fakeTimer, fakeGraph);
      (explore as any).handleDeadEnd = async () => {
        backPresses.push("back");
      };

      let observeCount = 0;
      (explore as any).observeScreen = {
        execute: async () => {
          observeCount++;
          if (observeCount === 1) {
            return createMockObservation([], "com.test.app");
          }
          return createMockObservation([], "com.android.settings");
        }
      };

      const result = await explore.execute({
        maxInteractions: 50,
        timeoutMs: 5000
      });

      expect(result.stopReason).toContain("com.test.app");
      expect(backPresses.length).toBe(outOfAppLimit);
    });

    test("should attempt to return to provided package when navigation leaves app", async () => {
      const outOfAppLimit = (Explore as any).MAX_OUT_OF_APP_ATTEMPTS ?? 5;
      const backPresses: string[] = [];
      const adbWithTracking = {
        executeCommand: async (cmd: string) => {
          if (cmd.includes("KEYCODE_BACK")) {
            backPresses.push(cmd);
          }
          return "";
        }
      } as AdbClient;

      explore = new Explore(device, adbWithTracking, fakeTimer, fakeGraph);
      (explore as any).handleDeadEnd = async () => {
        backPresses.push("back");
      };
      (explore as any).observeScreen = {
        execute: async () => createMockObservation([], "com.android.settings")
      };

      const result = await explore.execute({
        maxInteractions: 50,
        timeoutMs: 5000,
        packageName: "com.test.app"
      });

      expect(result.stopReason).toContain("com.test.app");
      expect(backPresses.length).toBe(outOfAppLimit);
    });
  });

  describe("element tracking", () => {
    test("should generate unique element keys", async () => {
      const element1 = createMockElement({
        "text": "Button",
        "resource-id": "com.test:id/btn"
      });

      const element2 = createMockElement({
        "text": "Button",
        "resource-id": "com.test:id/btn"
      });

      const element3 = createMockElement({
        "text": "Other",
        "resource-id": "com.test:id/other"
      });

      const key1 = getElementKey(element1);
      const key2 = getElementKey(element2);
      const key3 = getElementKey(element3);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe("graph-based navigation (validate mode)", () => {
    test("should initialize graph traversal state in validate mode", async () => {
      // Pre-populate the graph with some nodes and edges
      fakeGraph.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.test.app"
      });

      fakeGraph.recordToolCall(
        "tapOn",
        { text: "Button1" },
        {
          selectedElements: [{ text: "Button1", resourceId: "btn1", contentDesc: "" }]
        }
      );

      fakeGraph.recordNavigationEvent({
        destination: "Screen2",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 2,
        applicationId: "com.test.app"
      });

      // Initialize traversal using the extracted function with fakeGraph
      const state = await initializeGraphTraversal(fakeGraph);

      expect(state).toBeDefined();
      expect(state.totalNodesInGraph).toBeGreaterThan(0);
      expect(state.totalEdgesInGraph).toBeGreaterThan(0);
      expect(state.visitedNodes.size).toBe(0);
      expect(state.traversedEdges.size).toBe(0);
    });

    test("should select next edge to traverse", async () => {
      const state = await initializeGraphTraversal(fakeGraph);

      // If there are any pending edges, selectNextEdgeToTraverse should return one
      if (state.pendingEdges.length > 0) {
        const firstEdge = state.pendingEdges[0];
        const edge = selectNextEdgeToTraverse(state, firstEdge.from);
        expect(edge).toBeDefined();
        expect(edge).toBe(firstEdge);
      }

      // If there are no edges from current screen, it should return null
      const edge = selectNextEdgeToTraverse(state, "NonExistentScreen");
      expect(edge).toBeNull();
    });

    test("should mark nodes as visited", async () => {
      const state = await initializeGraphTraversal(fakeGraph);

      expect(state.visitedNodes.size).toBe(0);

      markNodeVisited(state, "Screen1");
      expect(state.visitedNodes.size).toBe(1);
      expect(state.visitedNodes.has("Screen1")).toBe(true);

      markNodeVisited(state, "Screen2");
      expect(state.visitedNodes.size).toBe(2);
    });

    test("should mark edges as traversed with validation results", async () => {
      const state = await initializeGraphTraversal(fakeGraph);

      expect(state.traversedEdges.size).toBe(0);

      // Create a mock edge with interaction
      const mockEdge = {
        from: "Screen1",
        to: "Screen2",
        timestamp: Date.now(),
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Submit Button" },
          timestamp: Date.now()
        }
      };

      markEdgeTraversed(state, mockEdge, "Screen2", true, fakeTimer, undefined, 0.95);

      expect(state.traversedEdges.size).toBe(1);

      // Get the actual edge key generated
      const edgeKey = getEdgeKey(mockEdge);
      expect(state.traversedEdges.has(edgeKey)).toBe(true);

      const validation = state.edgeValidationResults.get(edgeKey);
      expect(validation).toBeDefined();
      expect(validation?.success).toBe(true);
      expect(validation?.expectedTo).toBe("Screen2");
      expect(validation?.actualTo).toBe("Screen2");
      expect(validation?.matchConfidence).toBe(0.95);
    });

    test("should record failed edge validation", async () => {
      const state = await initializeGraphTraversal(fakeGraph);

      // Create a mock edge with interaction
      const mockEdge = {
        from: "Screen1",
        to: "Screen2",
        timestamp: Date.now(),
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Navigate Button" },
          timestamp: Date.now()
        }
      };

      markEdgeTraversed(
        state,
        mockEdge,
        "Screen3",
        false,
        fakeTimer,
        "Navigation diverged",
        0.8
      );

      const edgeKey = getEdgeKey(mockEdge);
      const validation = state.edgeValidationResults.get(edgeKey);
      expect(validation?.success).toBe(false);
      expect(validation?.expectedTo).toBe("Screen2");
      expect(validation?.actualTo).toBe("Screen3");
      expect(validation?.error).toBe("Navigation diverged");
    });

    test("should generate edge keys correctly", async () => {
      // Create edges with same interaction
      const edge1 = {
        from: "Screen1",
        to: "Screen2",
        timestamp: 1000,
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Button A" },
          timestamp: 1000
        }
      };

      const edge2 = {
        from: "Screen1",
        to: "Screen2",
        timestamp: 2000, // Different timestamp
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Button A" }, // Same interaction
          timestamp: 2000
        }
      };

      const edge3 = {
        from: "Screen1",
        to: "Screen2",
        timestamp: 1000,
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Button B" }, // Different interaction
          timestamp: 1000
        }
      };

      const edge4 = {
        from: "Screen2",
        to: "Screen1",
        timestamp: 1000,
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Button A" },
          timestamp: 1000
        }
      };

      const key1 = getEdgeKey(edge1);
      const key2 = getEdgeKey(edge2);
      const key3 = getEdgeKey(edge3);
      const key4 = getEdgeKey(edge4);

      // Same interaction = same key (deterministic)
      expect(key1).toBe(key2);
      // Different interaction = different key
      expect(key1).not.toBe(key3);
      // Different screens = different key
      expect(key1).not.toBe(key4);

      // Verify format: from->hash->to
      expect(key1).toMatch(/^Screen1->[a-f0-9]{8}->Screen2$/);
    });

    test("should include graph traversal metrics in result", async () => {
      // Create a simple graph
      fakeGraph.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.test.app"
      });

      // Inject fakeGraph via constructor
      explore = new Explore(device, mockAdb, fakeTimer, fakeGraph);
      (explore as any).observeScreen = mockObserveScreen;

      // Initialize traversal state on explore instance
      (explore as any).graphTraversalState = await initializeGraphTraversal(fakeGraph);
      const state = (explore as any).graphTraversalState;

      // Mark some edges as traversed
      const mockEdge = {
        from: "Screen1",
        to: "Screen2",
        timestamp: fakeTimer.now(),
        edgeType: "tool" as const,
        interaction: {
          toolName: "tapOn",
          args: { text: "Test Button" },
          timestamp: fakeTimer.now()
        }
      };
      markEdgeTraversed(state, mockEdge, "Screen2", true, fakeTimer);
      markNodeVisited(state, "Screen1");
      markNodeVisited(state, "Screen2");

      const initialGraph = await fakeGraph.exportGraph();
      const result = await (explore as any).generateReport(initialGraph, Date.now(), false);

      expect(result.graphTraversal).toBeDefined();
      expect(result.graphTraversal?.nodesVisited).toBe(2);
      expect(result.graphTraversal?.edgesTraversed).toBe(1);
      expect(result.graphTraversal?.edgeValidationResults).toBeDefined();
      expect(result.graphTraversal?.edgeValidationResults.length).toBeGreaterThan(0);
      expect(result.graphTraversal?.coveragePercentage).toBeGreaterThanOrEqual(0);
    });
  });
});
