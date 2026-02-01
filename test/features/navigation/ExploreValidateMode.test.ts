import { expect, describe, test, beforeEach, afterEach, spyOn } from "bun:test";
import { Element } from "../../../src/models";
import { NavigationGraphManager, type NavigationEdge } from "../../../src/features/navigation/NavigationGraphManager";
import { FakeNavigationGraphManager } from "../../fakes/FakeNavigationGraphManager";
import { FakeTimer } from "../../fakes/FakeTimer";
import {
  initializeGraphTraversal,
  getEdgeKey,
  hashEdgeAction,
  markNodeVisited,
  markEdgeTraversed,
  selectNextEdgeToTraverse,
  findElementMatchingEdge
} from "../../../src/features/navigation/ExploreValidateMode";

describe("ExploreValidateMode", () => {
  let fakeGraph: FakeNavigationGraphManager;
  let fakeTimer: FakeTimer;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;

  beforeEach(() => {
    fakeGraph = new FakeNavigationGraphManager();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    getInstanceSpy = spyOn(NavigationGraphManager, "getInstance").mockReturnValue(
      fakeGraph as unknown as NavigationGraphManager
    );
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
  });

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

  function createMockEdge(from: string, to: string, overrides: Partial<NavigationEdge> = {}): NavigationEdge {
    return {
      from,
      to,
      timestamp: Date.now(),
      edgeType: "tool",
      ...overrides
    };
  }

  describe("initializeGraphTraversal", () => {
    test("should create empty state for empty graph", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);

      expect(state.visitedNodes.size).toBe(0);
      expect(state.traversedEdges.size).toBe(0);
      expect(state.pendingEdges.length).toBe(0);
      expect(state.totalNodesInGraph).toBe(0);
      expect(state.totalEdgesInGraph).toBe(0);
    });

    test("should populate state from existing graph", async () => {
      const navManager = NavigationGraphManager.getInstance();

      navManager.recordNavigationEvent({
        destination: "Screen1",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 1,
        applicationId: "com.test.app"
      });

      await navManager.recordToolCall("tapOn", { text: "Button1" }, {
        selectedElements: [{ text: "Button1", resourceId: "btn1", contentDesc: "" }]
      });

      navManager.recordNavigationEvent({
        destination: "Screen2",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 2,
        applicationId: "com.test.app"
      });

      const state = await initializeGraphTraversal(navManager);

      expect(state.totalNodesInGraph).toBeGreaterThan(0);
      expect(state.totalEdgesInGraph).toBeGreaterThan(0);
      expect(state.pendingEdges.length).toBeGreaterThan(0);
    });
  });

  describe("getEdgeKey", () => {
    test("should generate key in format from->hash->to", () => {
      const edge = createMockEdge("ScreenA", "ScreenB", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      const key = getEdgeKey(edge);

      expect(key).toMatch(/^ScreenA->[a-f0-9]{8}->ScreenB$/);
    });

    test("should generate same key for identical edges", () => {
      const edge1 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      const edge2 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 2000 // Different timestamp
        }
      });

      expect(getEdgeKey(edge1)).toBe(getEdgeKey(edge2));
    });

    test("should generate different keys for different interactions", () => {
      const edge1 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button A" },
          timestamp: 1000
        }
      });

      const edge2 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button B" },
          timestamp: 1000
        }
      });

      expect(getEdgeKey(edge1)).not.toBe(getEdgeKey(edge2));
    });

    test("should generate different keys for different screens", () => {
      const edge1 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      const edge2 = createMockEdge("B", "C", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      expect(getEdgeKey(edge1)).not.toBe(getEdgeKey(edge2));
    });
  });

  describe("hashEdgeAction", () => {
    test("should hash edge type for edges without interaction", () => {
      const edge = createMockEdge("A", "B", { edgeType: "back" });

      const hash = hashEdgeAction(edge);

      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    test("should create deterministic hash from interaction", () => {
      const edge = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Submit" },
          timestamp: 1000
        }
      });

      const hash1 = hashEdgeAction(edge);
      const hash2 = hashEdgeAction(edge);

      expect(hash1).toBe(hash2);
    });

    test("should exclude timestamp fields from hash", () => {
      const edge1 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button", timestamp: 1000 },
          timestamp: 1000
        }
      });

      const edge2 = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button", timestamp: 2000 },
          timestamp: 2000
        }
      });

      expect(hashEdgeAction(edge1)).toBe(hashEdgeAction(edge2));
    });
  });

  describe("markNodeVisited", () => {
    test("should add node to visited set", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);

      expect(state.visitedNodes.has("Screen1")).toBe(false);

      markNodeVisited(state, "Screen1");

      expect(state.visitedNodes.has("Screen1")).toBe(true);
    });

    test("should not duplicate nodes", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);

      markNodeVisited(state, "Screen1");
      markNodeVisited(state, "Screen1");

      expect(state.visitedNodes.size).toBe(1);
    });
  });

  describe("markEdgeTraversed", () => {
    test("should add edge to traversed set", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      markEdgeTraversed(state, edge, "B", true, fakeTimer);

      expect(state.traversedEdges.size).toBe(1);
      expect(state.traversedEdges.has(getEdgeKey(edge))).toBe(true);
    });

    test("should record validation result", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      markEdgeTraversed(state, edge, "B", true, fakeTimer, undefined, 0.95);

      const result = state.edgeValidationResults.get(getEdgeKey(edge));
      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.expectedTo).toBe("B");
      expect(result?.actualTo).toBe("B");
      expect(result?.matchConfidence).toBe(0.95);
    });

    test("should record failed validation", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      markEdgeTraversed(state, edge, "C", false, fakeTimer, "Went to wrong screen", 0.7);

      const result = state.edgeValidationResults.get(getEdgeKey(edge));
      expect(result?.success).toBe(false);
      expect(result?.expectedTo).toBe("B");
      expect(result?.actualTo).toBe("C");
      expect(result?.error).toBe("Went to wrong screen");
    });

    test("should remove edge from pending", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });

      state.pendingEdges.push(edge);
      const initialLength = state.pendingEdges.length;

      markEdgeTraversed(state, edge, "B", true, fakeTimer);

      expect(state.pendingEdges.length).toBeLessThan(initialLength);
    });
  });

  describe("selectNextEdgeToTraverse", () => {
    test("should return edge from current screen", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge = createMockEdge("CurrentScreen", "NextScreen", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Button" },
          timestamp: 1000
        }
      });
      state.pendingEdges.push(edge);

      const selected = selectNextEdgeToTraverse(state, "CurrentScreen");

      expect(selected).toBe(edge);
    });

    test("should return null if no edges from current screen", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge = createMockEdge("OtherScreen", "NextScreen");
      state.pendingEdges.push(edge);

      const selected = selectNextEdgeToTraverse(state, "CurrentScreen");

      expect(selected).toBeNull();
    });

    test("should return null for empty pending edges", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);

      const selected = selectNextEdgeToTraverse(state, "CurrentScreen");

      expect(selected).toBeNull();
    });

    test("should return first matching edge", async () => {
      const state = await initializeGraphTraversal(fakeGraph as unknown as NavigationGraphManager);
      const edge1 = createMockEdge("Current", "A");
      const edge2 = createMockEdge("Current", "B");
      state.pendingEdges.push(edge1, edge2);

      const selected = selectNextEdgeToTraverse(state, "Current");

      expect(selected).toBe(edge1);
    });
  });

  describe("findElementMatchingEdge", () => {
    test("should return null for edge without uiState", () => {
      const elements = [createMockElement({ text: "Button" })];
      const edge = createMockEdge("A", "B");

      const result = findElementMatchingEdge(elements, edge);

      expect(result).toBeNull();
    });

    test("should match element by resource-id", () => {
      const elements = [
        createMockElement({ "resource-id": "com.test:id/btn", "text": "Click" })
      ];
      const edge = createMockEdge("A", "B", {
        uiState: {
          selectedElements: [
            { resourceId: "com.test:id/btn", text: "", contentDesc: "" }
          ]
        }
      });

      const result = findElementMatchingEdge(elements, edge);

      expect(result).not.toBeNull();
      expect(result?.element["resource-id"]).toBe("com.test:id/btn");
      expect(result?.confidence).toBeGreaterThan(0.6);
    });

    test("should match element by text", () => {
      const elements = [
        createMockElement({ text: "Submit Button" })
      ];
      const edge = createMockEdge("A", "B", {
        uiState: {
          selectedElements: [
            { text: "Submit Button", resourceId: "", contentDesc: "" }
          ]
        }
      });

      const result = findElementMatchingEdge(elements, edge);

      expect(result).not.toBeNull();
      expect(result?.element.text).toBe("Submit Button");
    });

    test("should return null when confidence is below threshold", () => {
      const elements = [
        createMockElement({ "text": "Different Text", "resource-id": "different_id" })
      ];
      const edge = createMockEdge("A", "B", {
        uiState: {
          selectedElements: [
            { text: "Submit", resourceId: "submit_btn", contentDesc: "" }
          ]
        }
      });

      const result = findElementMatchingEdge(elements, edge);

      expect(result).toBeNull();
    });

    test("should return best match when multiple elements match", () => {
      const elements = [
        createMockElement({ "text": "Submit", "resource-id": "wrong_id" }),
        createMockElement({ "text": "Submit", "resource-id": "com.test:id/submit" })
      ];
      const edge = createMockEdge("A", "B", {
        uiState: {
          selectedElements: [
            { text: "Submit", resourceId: "com.test:id/submit", contentDesc: "" }
          ]
        }
      });

      const result = findElementMatchingEdge(elements, edge);

      expect(result).not.toBeNull();
      // Should match the one with both text and resource-id match
      expect(result?.element["resource-id"]).toBe("com.test:id/submit");
    });

    test("should match using interaction uiState as fallback", () => {
      const elements = [
        createMockElement({ text: "Navigate" })
      ];
      const edge = createMockEdge("A", "B", {
        interaction: {
          toolName: "tapOn",
          args: { text: "Navigate" },
          timestamp: 1000,
          uiState: {
            selectedElements: [
              { text: "Navigate", resourceId: "", contentDesc: "" }
            ]
          }
        }
      });

      const result = findElementMatchingEdge(elements, edge);

      expect(result).not.toBeNull();
      expect(result?.element.text).toBe("Navigate");
    });
  });
});
