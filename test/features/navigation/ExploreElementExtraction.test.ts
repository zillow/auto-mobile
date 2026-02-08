import { expect, describe, test, beforeEach } from "bun:test";
import { Element } from "../../../src/models";
import { DefaultElementParser } from "../../../src/features/utility/ElementParser";
import type { ElementParser } from "../../../src/utils/interfaces/ElementParser";
import {
  extractNavigationElements,
  enrichElementWithChildProperties,
  extractScrollableContainers,
  isNavigationCandidate,
  extractAllElements,
  getElementKey,
  filterUnexhaustedElements
} from "../../../src/features/navigation/ExploreElementExtraction";
import type { TrackedElement } from "../../../src/features/navigation/ExploreTypes";

describe("ExploreElementExtraction", () => {
  let elementParser: ElementParser;

  beforeEach(() => {
    elementParser = new DefaultElementParser();
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

  function createMockViewHierarchy(nodes: any[] = [], packageName: string = "com.test.app") {
    return {
      hierarchy: {
        node: nodes
      },
      packageName
    };
  }

  function createMockNode(overrides: any = {}) {
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

  describe("isNavigationCandidate", () => {
    test("should accept clickable and enabled elements", () => {
      const element = createMockElement({
        clickable: true,
        enabled: true
      });
      expect(isNavigationCandidate(element)).toBe(true);
    });

    test("should reject non-clickable elements", () => {
      const element = createMockElement({
        clickable: false
      });
      expect(isNavigationCandidate(element)).toBe(false);
    });

    test("should reject disabled elements", () => {
      const element = createMockElement({
        enabled: false
      });
      expect(isNavigationCandidate(element)).toBe(false);
    });

    test("should reject EditText elements", () => {
      const element = createMockElement({
        "class": "android.widget.EditText"
      });
      expect(isNavigationCandidate(element)).toBe(false);
    });

    test("should reject Checkbox elements", () => {
      const element = createMockElement({
        "class": "android.widget.CheckBox"
      });
      expect(isNavigationCandidate(element)).toBe(false);
    });

    test("should reject elements that are too small", () => {
      const element = createMockElement({
        bounds: { left: 0, top: 0, right: 5, bottom: 5 }
      });
      expect(isNavigationCandidate(element)).toBe(false);
    });

    test("should handle string boolean values from XML", () => {
      const element = {
        ...createMockElement(),
        clickable: "true" as any,
        enabled: "true" as any
      };
      expect(isNavigationCandidate(element)).toBe(true);

      const disabledElement = {
        ...createMockElement(),
        clickable: "true" as any,
        enabled: "false" as any
      };
      expect(isNavigationCandidate(disabledElement)).toBe(false);
    });
  });

  describe("extractNavigationElements", () => {
    test("should extract clickable buttons from view hierarchy", () => {
      const nodes = [
        createMockNode({ text: "Settings", clickable: "true" }),
        createMockNode({ text: "Profile", clickable: "true" })
      ];
      const viewHierarchy = createMockViewHierarchy(nodes);

      const elements = extractNavigationElements(viewHierarchy, elementParser);

      expect(elements.length).toBe(2);
    });

    test("should filter out non-clickable elements", () => {
      const nodes = [
        createMockNode({ text: "Settings", clickable: "true" }),
        createMockNode({ text: "Label", clickable: "false" })
      ];
      const viewHierarchy = createMockViewHierarchy(nodes);

      const elements = extractNavigationElements(viewHierarchy, elementParser);

      expect(elements.length).toBe(1);
      expect(elements[0].text).toBe("Settings");
    });

    test("should filter out EditText elements", () => {
      const nodes = [
        createMockNode({ text: "Submit", clickable: "true" }),
        createMockNode({ "text": "", "class": "android.widget.EditText", "clickable": "true" })
      ];
      const viewHierarchy = createMockViewHierarchy(nodes);

      const elements = extractNavigationElements(viewHierarchy, elementParser);

      expect(elements.length).toBe(1);
    });

    test("should filter out elements from different packages", () => {
      const nodes = [
        createMockNode({ text: "In-app", clickable: "true", package: "com.test.app" }),
        createMockNode({ text: "External", clickable: "true", package: "com.other.app" })
      ];
      const viewHierarchy = createMockViewHierarchy(nodes, "com.test.app");

      const elements = extractNavigationElements(viewHierarchy, elementParser);

      // Only the in-app element should be extracted
      expect(elements.filter(e => e.text === "External").length).toBe(0);
    });
  });

  describe("enrichElementWithChildProperties", () => {
    test("should copy text from child node if parent has none", () => {
      const element = createMockElement({ text: undefined });
      (element as any).node = [{ text: "Child Text" }];

      const enriched = enrichElementWithChildProperties(element);

      expect(enriched.text).toBe("Child Text");
    });

    test("should not override existing text", () => {
      const element = createMockElement({ text: "Parent Text" });
      (element as any).node = [{ text: "Child Text" }];

      const enriched = enrichElementWithChildProperties(element);

      expect(enriched.text).toBe("Parent Text");
    });

    test("should handle missing node property", () => {
      const element = createMockElement({ text: "Existing" });

      const enriched = enrichElementWithChildProperties(element);

      expect(enriched.text).toBe("Existing");
    });
  });

  describe("extractScrollableContainers", () => {
    test("should extract scrollable elements", () => {
      const nodes = [
        createMockNode({
          scrollable: "true",
          bounds: "[0,0][300,500]"
        })
      ];
      // Manually set bounds for the test
      nodes[0].bounds = { left: 0, top: 0, right: 300, bottom: 500 };
      const viewHierarchy = createMockViewHierarchy(nodes);

      const containers = extractScrollableContainers(viewHierarchy, elementParser);

      expect(containers.length).toBe(1);
    });

    test("should filter out small scrollable elements", () => {
      const nodes = [
        createMockNode({
          scrollable: "true",
          bounds: "[0,0][30,30]"
        })
      ];
      nodes[0].bounds = { left: 0, top: 0, right: 30, bottom: 30 };
      const viewHierarchy = createMockViewHierarchy(nodes);

      const containers = extractScrollableContainers(viewHierarchy, elementParser);

      expect(containers.length).toBe(0);
    });
  });

  describe("extractAllElements", () => {
    test("should extract all elements regardless of clickability", () => {
      const nodes = [
        createMockNode({ text: "Clickable", clickable: "true" }),
        createMockNode({ text: "NonClickable", clickable: "false" })
      ];
      const viewHierarchy = createMockViewHierarchy(nodes);

      const elements = extractAllElements(viewHierarchy, elementParser);

      expect(elements.length).toBe(2);
    });
  });

  describe("getElementKey", () => {
    test("should generate key from resource-id and text", () => {
      const element = createMockElement({
        "resource-id": "com.test:id/btn",
        "text": "Click Me"
      });

      const key = getElementKey(element);

      expect(key).toContain("id:com.test:id/btn");
      expect(key).toContain("text:Click Me");
    });

    test("should generate same key for identical elements", () => {
      const element1 = createMockElement({
        "resource-id": "com.test:id/btn",
        "text": "Click"
      });
      const element2 = createMockElement({
        "resource-id": "com.test:id/btn",
        "text": "Click"
      });

      expect(getElementKey(element1)).toBe(getElementKey(element2));
    });

    test("should generate different keys for different elements", () => {
      const element1 = createMockElement({ text: "Button A" });
      const element2 = createMockElement({ text: "Button B" });

      expect(getElementKey(element1)).not.toBe(getElementKey(element2));
    });

    test("should return 'unknown' for elements with no identifying properties", () => {
      const element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        clickable: true
      } as Element;

      expect(getElementKey(element)).toBe("unknown");
    });
  });

  describe("filterUnexhaustedElements", () => {
    test("should include elements not in tracked map", () => {
      const elements = [
        createMockElement({ text: "New Button" })
      ];
      const tracked = new Map<string, TrackedElement>();

      const filtered = filterUnexhaustedElements(elements, tracked, "Screen1");

      expect(filtered.length).toBe(1);
    });

    test("should include elements tried on different screen", () => {
      const element = createMockElement({ text: "Button" });
      const tracked = new Map<string, TrackedElement>();
      tracked.set(getElementKey(element), {
        interactionCount: 2,
        lastInteractionScreen: "Screen1"
      });

      const filtered = filterUnexhaustedElements([element], tracked, "Screen2");

      expect(filtered.length).toBe(1);
    });

    test("should filter out elements tried twice on same screen", () => {
      const element = createMockElement({ text: "Button" });
      const tracked = new Map<string, TrackedElement>();
      tracked.set(getElementKey(element), {
        interactionCount: 2,
        lastInteractionScreen: "Screen1"
      });

      const filtered = filterUnexhaustedElements([element], tracked, "Screen1");

      expect(filtered.length).toBe(0);
    });

    test("should include elements tried only once on same screen", () => {
      const element = createMockElement({ text: "Button" });
      const tracked = new Map<string, TrackedElement>();
      tracked.set(getElementKey(element), {
        interactionCount: 1,
        lastInteractionScreen: "Screen1"
      });

      const filtered = filterUnexhaustedElements([element], tracked, "Screen1");

      expect(filtered.length).toBe(1);
    });
  });
});
