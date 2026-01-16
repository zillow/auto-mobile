import { describe, expect, test } from "bun:test";
import { FocusPathCalculator } from "../../../src/features/talkback/FocusPathCalculator";
import type { Element } from "../../../src/models/Element";
import type { ElementSelector as FocusElementSelector } from "../../../src/utils/AccessibilityFocusTracker";

const makeElement = (index: number, overrides: Partial<Element> = {}): Element => ({
  bounds: {
    left: index * 10,
    top: index * 10,
    right: index * 10 + 5,
    bottom: index * 10 + 5
  },
  ...overrides
});

describe("FocusPathCalculator", () => {
  test("returns null when target element is not present", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [makeElement(0, { "resource-id": "a" })];
    const targetSelector: FocusElementSelector = { resourceId: "missing" };

    const path = calculator.calculatePath(null, targetSelector, orderedElements);

    expect(path).toBeNull();
  });

  test("calculates forward path with checkpoints", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [
      makeElement(0, { "resource-id": "a" }),
      makeElement(1, { "resource-id": "b" }),
      makeElement(2, { "resource-id": "c" }),
      makeElement(3, { "resource-id": "d" }),
      makeElement(4, { "resource-id": "e" }),
      makeElement(5, { "resource-id": "f" }),
      makeElement(6, { "resource-id": "g" }),
      makeElement(7, { "resource-id": "h" })
    ];
    const currentFocus = orderedElements[1];
    const targetSelector: FocusElementSelector = { resourceId: "h" };

    const path = calculator.calculatePath(currentFocus, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    expect(path?.currentFocusIndex).toBe(1);
    expect(path?.targetFocusIndex).toBe(7);
    expect(path?.swipeCount).toBe(6);
    expect(path?.direction).toBe("forward");
    expect(path?.intermediateCheckpoints).toEqual([6]);
  });

  test("calculates backward path", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [
      makeElement(0, { "resource-id": "a" }),
      makeElement(1, { "resource-id": "b" }),
      makeElement(2, { "resource-id": "c" }),
      makeElement(3, { "resource-id": "d" }),
      makeElement(4, { "resource-id": "e" })
    ];
    const currentFocus = orderedElements[4];
    const targetSelector: FocusElementSelector = { resourceId: "b" };

    const path = calculator.calculatePath(currentFocus, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    expect(path?.currentFocusIndex).toBe(4);
    expect(path?.targetFocusIndex).toBe(1);
    expect(path?.swipeCount).toBe(3);
    expect(path?.direction).toBe("backward");
    expect(path?.intermediateCheckpoints).toEqual([]);
  });

  test("defaults to index 0 when there is no current focus", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [
      makeElement(0, { "resource-id": "a" }),
      makeElement(1, { "resource-id": "b" }),
      makeElement(2, { "resource-id": "c" })
    ];
    const targetSelector: FocusElementSelector = { resourceId: "c" };

    const path = calculator.calculatePath(null, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    expect(path?.currentFocusIndex).toBeNull();
    expect(path?.targetFocusIndex).toBe(2);
    expect(path?.swipeCount).toBe(2);
    expect(path?.direction).toBe("forward");
  });

  test("matches target by text with fuzzy match", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [
      makeElement(0, { text: "Save changes" }),
      makeElement(1, { text: "Discard" })
    ];
    const targetSelector: FocusElementSelector = { text: "Save" };

    const path = calculator.calculatePath(null, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    expect(path?.targetFocusIndex).toBe(0);
  });

  test("treats unfound current focus as null and uses index 0", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [
      makeElement(0, { "resource-id": "a" }),
      makeElement(1, { "resource-id": "b" })
    ];
    const currentFocus = makeElement(99, { "resource-id": "missing" });
    const targetSelector: FocusElementSelector = { resourceId: "b" };

    const path = calculator.calculatePath(currentFocus, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    expect(path?.currentFocusIndex).toBeNull();
    expect(path?.swipeCount).toBe(1);
  });

  test("disambiguates elements with same resourceId using bounds", () => {
    const calculator = new FocusPathCalculator();
    // Three list items with the same resource-id but different bounds
    const orderedElements = [
      makeElement(0, { "resource-id": "list_item", "text": "Item 1", "bounds": { left: 0, top: 0, right: 100, bottom: 50 } }),
      makeElement(1, { "resource-id": "list_item", "text": "Item 2", "bounds": { left: 0, top: 50, right: 100, bottom: 100 } }),
      makeElement(2, { "resource-id": "list_item", "text": "Item 3", "bounds": { left: 0, top: 100, right: 100, bottom: 150 } })
    ];
    // Target the second item using bounds
    const targetSelector: FocusElementSelector = {
      resourceId: "list_item",
      bounds: { left: 0, top: 50, right: 100, bottom: 100 }
    };

    const path = calculator.calculatePath(null, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    // Should select index 1 (second item) based on bounds, not index 0 (first visible match)
    expect(path?.targetFocusIndex).toBe(1);
    expect(path?.swipeCount).toBe(1);
  });

  test("falls back to first visible match when bounds do not match any element", () => {
    const calculator = new FocusPathCalculator();
    const orderedElements = [
      makeElement(0, { "resource-id": "list_item", "text": "Item 1", "bounds": { left: 0, top: 0, right: 100, bottom: 50 } }),
      makeElement(1, { "resource-id": "list_item", "text": "Item 2", "bounds": { left: 0, top: 50, right: 100, bottom: 100 } })
    ];
    // Provide bounds that don't match any element
    const targetSelector: FocusElementSelector = {
      resourceId: "list_item",
      bounds: { left: 999, top: 999, right: 999, bottom: 999 }
    };

    const path = calculator.calculatePath(null, targetSelector, orderedElements);

    expect(path).not.toBeNull();
    // Should fall back to first visible match (index 0)
    expect(path?.targetFocusIndex).toBe(0);
  });
});
