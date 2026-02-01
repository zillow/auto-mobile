import { expect, describe, test } from "bun:test";
import { Element } from "../../../src/models";
import {
  calculateNavigationScore,
  calculateNoveltyScore,
  estimateCoverageGain,
  selectBreadthFirst,
  selectDepthFirst,
  selectWeighted,
  rankElementsForDryRun,
  getElementTarget,
  predictOutcomeForElement,
  scoreEdgeMatch,
  scoreSelectedElementMatch,
  scoreIdentifierMatch
} from "../../../src/features/navigation/ExploreElementScoring";
import { getElementKey } from "../../../src/features/navigation/ExploreElementExtraction";
import type { TrackedElement } from "../../../src/features/navigation/ExploreTypes";
import type { NavigationEdge } from "../../../src/features/navigation/NavigationGraphManager";

describe("ExploreElementScoring", () => {
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

  describe("calculateNavigationScore", () => {
    test("should give clickable elements a base score", () => {
      const element = createMockElement({ clickable: true });
      (element as any).hierarchyDepth = 99; // Deep in hierarchy, no depth bonus

      const score = calculateNavigationScore(element);

      expect(score).toBe(5); // Clickable bonus only
    });

    test("should give scrollable elements additional score", () => {
      const element = createMockElement({
        clickable: false,
        scrollable: true
      });
      (element as any).hierarchyDepth = 99;

      const score = calculateNavigationScore(element);

      expect(score).toBe(3); // Scrollable bonus only
    });

    test("should give higher scores to elements closer to root", () => {
      const deepElement = createMockElement();
      (deepElement as any).hierarchyDepth = 10;

      const shallowElement = createMockElement();
      (shallowElement as any).hierarchyDepth = 2;

      const deepScore = calculateNavigationScore(deepElement);
      const shallowScore = calculateNavigationScore(shallowElement);

      expect(shallowScore).toBeGreaterThan(deepScore);
    });

    test("should calculate correct depth bonus", () => {
      const element = createMockElement({ clickable: true });
      (element as any).hierarchyDepth = 0; // Root level

      const score = calculateNavigationScore(element);

      // 5 (clickable) + 25 (depth bonus at root) = 30
      expect(score).toBe(30);
    });

    test("should handle elements with both clickable and scrollable", () => {
      const element = createMockElement({
        clickable: true,
        scrollable: true
      });
      (element as any).hierarchyDepth = 99;

      const score = calculateNavigationScore(element);

      expect(score).toBe(8); // 5 (clickable) + 3 (scrollable)
    });
  });

  describe("calculateNoveltyScore", () => {
    test("should return max score for unexplored elements", () => {
      const element = createMockElement();
      const explored = new Map<string, TrackedElement>();

      const score = calculateNoveltyScore(element, explored);

      expect(score).toBe(10);
    });

    test("should reduce score based on interaction count", () => {
      const element = createMockElement();
      const explored = new Map<string, TrackedElement>();
      explored.set(getElementKey(element), {
        interactionCount: 3,
        lastInteractionScreen: "Screen1"
      });

      const score = calculateNoveltyScore(element, explored);

      expect(score).toBe(7); // 10 - 3
    });

    test("should return minimum score of 1 for highly explored elements", () => {
      const element = createMockElement();
      const explored = new Map<string, TrackedElement>();
      explored.set(getElementKey(element), {
        interactionCount: 100,
        lastInteractionScreen: "Screen1"
      });

      const score = calculateNoveltyScore(element, explored);

      expect(score).toBe(1);
    });
  });

  describe("estimateCoverageGain", () => {
    test("should return at least 1", () => {
      const element = createMockElement();
      (element as any).hierarchyDepth = 99;

      const gain = estimateCoverageGain(element);

      expect(gain).toBeGreaterThanOrEqual(1);
    });

    test("should increase with navigation score", () => {
      const lowScoreElement = createMockElement({ clickable: false });
      (lowScoreElement as any).hierarchyDepth = 99;

      const highScoreElement = createMockElement({ clickable: true });
      (highScoreElement as any).hierarchyDepth = 0;

      const lowGain = estimateCoverageGain(lowScoreElement);
      const highGain = estimateCoverageGain(highScoreElement);

      expect(highGain).toBeGreaterThan(lowGain);
    });
  });

  describe("selectBreadthFirst", () => {
    test("should return null for empty array", () => {
      expect(selectBreadthFirst([])).toBeNull();
    });

    test("should select element with highest navigation score", () => {
      const lowScore = createMockElement({ text: "Low" });
      (lowScore as any).hierarchyDepth = 10;

      const highScore = createMockElement({ text: "High" });
      (highScore as any).hierarchyDepth = 1;

      const selected = selectBreadthFirst([lowScore, highScore]);

      expect(selected?.text).toBe("High");
    });
  });

  describe("selectDepthFirst", () => {
    test("should return null for empty array", () => {
      expect(selectDepthFirst([], new Map())).toBeNull();
    });

    test("should prefer unexplored elements", () => {
      const explored = createMockElement({ text: "Explored" });
      (explored as any).hierarchyDepth = 0; // High score

      const unexplored = createMockElement({ text: "Unexplored" });
      (unexplored as any).hierarchyDepth = 10; // Lower score

      const trackedElements = new Map<string, TrackedElement>();
      trackedElements.set(getElementKey(explored), {
        interactionCount: 1,
        lastInteractionScreen: "Screen1"
      });

      const selected = selectDepthFirst([explored, unexplored], trackedElements);

      expect(selected?.text).toBe("Unexplored");
    });

    test("should fall back to score when all elements are explored", () => {
      const lowScore = createMockElement({ text: "Low" });
      (lowScore as any).hierarchyDepth = 10;

      const highScore = createMockElement({ text: "High" });
      (highScore as any).hierarchyDepth = 1;

      const trackedElements = new Map<string, TrackedElement>();
      trackedElements.set(getElementKey(lowScore), {
        interactionCount: 1,
        lastInteractionScreen: "Screen1"
      });
      trackedElements.set(getElementKey(highScore), {
        interactionCount: 1,
        lastInteractionScreen: "Screen1"
      });

      const selected = selectDepthFirst([lowScore, highScore], trackedElements);

      expect(selected?.text).toBe("High");
    });
  });

  describe("selectWeighted", () => {
    test("should return null for empty array", () => {
      expect(selectWeighted([], "discover", new Map())).toBeNull();
    });

    test("should return element and stats", () => {
      const element = createMockElement({ text: "Test" });
      (element as any).hierarchyDepth = 5;

      const result = selectWeighted([element], "discover", new Map());

      expect(result).not.toBeNull();
      expect(result?.element.text).toBe("Test");
      expect(result?.stats).toBeDefined();
      expect(result?.stats.score).toBeGreaterThan(0);
    });

    test("should favor novelty in discover mode", () => {
      // Use same depth so navigation score is similar, novelty becomes deciding factor
      const explored = createMockElement({ text: "Explored" });
      (explored as any).hierarchyDepth = 5;

      const unexplored = createMockElement({ text: "Unexplored" });
      (unexplored as any).hierarchyDepth = 5;

      const trackedElements = new Map<string, TrackedElement>();
      trackedElements.set(getElementKey(explored), {
        interactionCount: 8, // High interaction count = low novelty
        lastInteractionScreen: "Screen1"
      });

      const result = selectWeighted([explored, unexplored], "discover", trackedElements);

      // In discover mode, novelty is heavily weighted (0.4), so unexplored should win
      expect(result?.element.text).toBe("Unexplored");
    });
  });

  describe("rankElementsForDryRun", () => {
    test("should rank elements by score", () => {
      const low = createMockElement({ text: "Low" });
      (low as any).hierarchyDepth = 10;

      const high = createMockElement({ text: "High" });
      (high as any).hierarchyDepth = 1;

      const ranked = rankElementsForDryRun([low, high], "weighted", "discover", new Map());

      expect(ranked[0].element.text).toBe("High");
      expect(ranked[1].element.text).toBe("Low");
    });

    test("should set action to swipeOn for scrollable elements", () => {
      const scrollable = createMockElement({ scrollable: true });

      const ranked = rankElementsForDryRun([scrollable], "weighted", "discover", new Map());

      expect(ranked[0].action).toBe("swipeOn");
    });

    test("should set action to tapOn for non-scrollable elements", () => {
      const clickable = createMockElement({ clickable: true });

      const ranked = rankElementsForDryRun([clickable], "weighted", "discover", new Map());

      expect(ranked[0].action).toBe("tapOn");
    });
  });

  describe("getElementTarget", () => {
    test("should use text as primary target", () => {
      const element = createMockElement({ text: "Click Me" });

      const target = getElementTarget(element);

      expect(target.type).toBe("text");
      expect(target.value).toBe("Click Me");
    });

    test("should use content-desc if no text", () => {
      const element = createMockElement({
        "text": undefined,
        "content-desc": "Description"
      });

      const target = getElementTarget(element);

      expect(target.type).toBe("text");
      expect(target.value).toBe("Description");
    });

    test("should use resource-id if no text or content-desc", () => {
      const element = createMockElement({
        "text": undefined,
        "content-desc": undefined,
        "resource-id": "com.test:id/btn"
      });

      const target = getElementTarget(element);

      expect(target.type).toBe("id");
      expect(target.value).toBe("com.test:id/btn");
    });

    test("should use coordinates as fallback", () => {
      const element = createMockElement({
        "text": undefined,
        "content-desc": undefined,
        "resource-id": undefined
      });

      const target = getElementTarget(element);

      expect(target.type).toBe("coordinates");
      expect(target.value).toBe("50,25"); // Center of bounds
    });
  });

  describe("predictOutcomeForElement", () => {
    test("should return unknown for empty edges", () => {
      const element = createMockElement();

      const outcome = predictOutcomeForElement(element, []);

      expect(outcome.screen).toBe("unknown");
      expect(outcome.confidence).toBe(0);
    });

    test("should predict screen from matching edge", () => {
      const element = createMockElement({
        "text": "Settings",
        "resource-id": "com.test:id/settings"
      });

      const edges: NavigationEdge[] = [
        {
          from: "Home",
          to: "SettingsScreen",
          timestamp: Date.now(),
          edgeType: "tool",
          uiState: {
            selectedElements: [
              { text: "Settings", resourceId: "com.test:id/settings", contentDesc: "" }
            ]
          }
        }
      ];

      const outcome = predictOutcomeForElement(element, edges);

      expect(outcome.screen).toBe("SettingsScreen");
      expect(outcome.confidence).toBeGreaterThan(0);
    });
  });

  describe("scoreEdgeMatch", () => {
    test("should return 0 for edge without uiState", () => {
      const element = createMockElement();
      const edge: NavigationEdge = {
        from: "A",
        to: "B",
        timestamp: Date.now(),
        edgeType: "tool"
      };

      expect(scoreEdgeMatch(element, edge)).toBe(0);
    });

    test("should score based on selected elements", () => {
      const element = createMockElement({
        "resource-id": "com.test:id/btn"
      });

      const edge: NavigationEdge = {
        from: "A",
        to: "B",
        timestamp: Date.now(),
        edgeType: "tool",
        uiState: {
          selectedElements: [
            { resourceId: "com.test:id/btn", text: "", contentDesc: "" }
          ]
        }
      };

      const score = scoreEdgeMatch(element, edge);

      expect(score).toBeGreaterThan(0);
    });
  });

  describe("scoreSelectedElementMatch", () => {
    test("should match on resource-id", () => {
      const element = createMockElement({
        "resource-id": "com.test:id/btn"
      });

      const score = scoreSelectedElementMatch(element, {
        resourceId: "com.test:id/btn"
      });

      expect(score).toBe(0.95);
    });

    test("should match on text", () => {
      const element = createMockElement({
        text: "Submit"
      });

      const score = scoreSelectedElementMatch(element, {
        text: "Submit"
      });

      expect(score).toBe(0.9);
    });

    test("should return 0 for no match", () => {
      const element = createMockElement({
        "text": "A",
        "resource-id": "x"
      });

      const score = scoreSelectedElementMatch(element, {
        text: "B",
        resourceId: "y"
      });

      expect(score).toBe(0);
    });
  });

  describe("scoreIdentifierMatch", () => {
    test("should return full score for exact match", () => {
      expect(scoreIdentifierMatch("hello", "hello", 1.0, 0.8)).toBe(1.0);
    });

    test("should return partial score for partial match", () => {
      expect(scoreIdentifierMatch("hello world", "hello", 1.0, 0.8)).toBe(0.8);
    });

    test("should be case insensitive", () => {
      expect(scoreIdentifierMatch("HELLO", "hello", 1.0, 0.8)).toBe(1.0);
    });

    test("should return 0 for no match", () => {
      expect(scoreIdentifierMatch("abc", "xyz", 1.0, 0.8)).toBe(0);
    });

    test("should return 0 for undefined values", () => {
      expect(scoreIdentifierMatch(undefined, "test", 1.0, 0.8)).toBe(0);
      expect(scoreIdentifierMatch("test", undefined, 1.0, 0.8)).toBe(0);
    });
  });
});
