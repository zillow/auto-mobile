import { describe, expect, test } from "bun:test";
import { DefaultElementFinder } from "../../../src/features/utility/ElementFinder";
import { DefaultElementParser } from "../../../src/features/utility/ElementParser";
import { DefaultTextMatcher } from "../../../src/features/utility/TextMatcher";
import type { ViewHierarchyResult } from "../../../src/models";

// Use real implementations — they're pure and fast
const parser = new DefaultElementParser();
const textMatcher = new DefaultTextMatcher();
const finder = new DefaultElementFinder(parser, textMatcher);

function makeHierarchy(nodes: any): ViewHierarchyResult {
  return {
    hierarchy: {
      node: {
        $: { bounds: "[0,0][1080,1920]" },
        node: Array.isArray(nodes) ? nodes : [nodes],
      },
    },
  };
}

describe("DefaultElementFinder", () => {
  describe("findElementsByText", () => {
    test("returns empty for null hierarchy", () => {
      expect(finder.findElementsByText(null as any, "Login")).toEqual([]);
    });

    test("returns empty for empty text", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      expect(finder.findElementsByText(hierarchy, "")).toEqual([]);
    });

    test("finds element by text", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[10,20][200,60]" } });
      const results = finder.findElementsByText(hierarchy, "Login");
      expect(results).toHaveLength(1);
      expect(results[0].bounds).toEqual({ left: 10, top: 20, right: 200, bottom: 60 });
    });

    test("finds element by content-desc", () => {
      const hierarchy = makeHierarchy({ $: { "content-desc": "Close button", "bounds": "[0,0][50,50]" } });
      const results = finder.findElementsByText(hierarchy, "Close button");
      expect(results).toHaveLength(1);
    });

    test("partial match by default", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login to Account", bounds: "[0,0][100,50]" } });
      const results = finder.findElementsByText(hierarchy, "Login");
      expect(results).toHaveLength(1);
    });

    test("prefers exact matches over partial", () => {
      const hierarchy = makeHierarchy([
        { $: { text: "Login", bounds: "[0,0][100,50]" } },
        { $: { text: "Login to Account", bounds: "[0,50][100,100]" } },
      ]);
      const results = finder.findElementsByText(hierarchy, "Login");
      expect(results).toHaveLength(1);
      // Should return the exact match only
      expect(results[0].bounds.bottom).toBe(50);
    });

    test("returns empty when container not found", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      const results = finder.findElementsByText(
        hierarchy, "Login",
        { elementId: "nonexistent-container" }
      );
      expect(results).toEqual([]);
    });

    test("searches within container by resource-id", () => {
      const hierarchy = makeHierarchy({
        $: { "resource-id": "my-form", "bounds": "[0,0][500,500]" },
        node: [
          { $: { text: "Login", bounds: "[10,10][200,50]" } },
        ],
      });
      const results = finder.findElementsByText(
        hierarchy, "Login",
        { elementId: "my-form" }
      );
      expect(results).toHaveLength(1);
    });
  });

  describe("findElementByText", () => {
    test("returns first match or null", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      expect(finder.findElementByText(hierarchy, "Login")).not.toBeNull();
      expect(finder.findElementByText(hierarchy, "NotFound")).toBeNull();
    });
  });

  describe("findElementsByResourceId", () => {
    test("returns empty for null hierarchy", () => {
      expect(finder.findElementsByResourceId(null as any, "btn_login")).toEqual([]);
    });

    test("finds element by exact resource-id", () => {
      const hierarchy = makeHierarchy({
        $: { "resource-id": "com.app:id/btn_login", "bounds": "[0,0][100,50]" },
      });
      const results = finder.findElementsByResourceId(hierarchy, "com.app:id/btn_login");
      expect(results).toHaveLength(1);
    });

    test("partial match when enabled", () => {
      const hierarchy = makeHierarchy({
        $: { "resource-id": "com.app:id/btn_login", "bounds": "[0,0][100,50]" },
      });
      const results = finder.findElementsByResourceId(hierarchy, "btn_login", null, true);
      expect(results).toHaveLength(1);
    });

    test("no partial match when disabled", () => {
      const hierarchy = makeHierarchy({
        $: { "resource-id": "com.app:id/btn_login", "bounds": "[0,0][100,50]" },
      });
      const results = finder.findElementsByResourceId(hierarchy, "btn_login", null, false);
      expect(results).toHaveLength(0);
    });
  });

  describe("findElementByResourceId", () => {
    test("returns first match or null", () => {
      const hierarchy = makeHierarchy({
        $: { "resource-id": "btn_login", "bounds": "[0,0][100,50]" },
      });
      expect(finder.findElementByResourceId(hierarchy, "btn_login")).not.toBeNull();
      expect(finder.findElementByResourceId(hierarchy, "btn_signup")).toBeNull();
    });
  });

  describe("hasContainerElement", () => {
    test("returns false for null hierarchy", () => {
      expect(finder.hasContainerElement(null as any, { text: "test" })).toBe(false);
    });

    test("returns false for null container", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      expect(finder.hasContainerElement(hierarchy, undefined)).toBe(false);
    });

    test("returns true when container found by resource-id", () => {
      const hierarchy = makeHierarchy({
        $: { "resource-id": "my-form", "bounds": "[0,0][500,500]" },
      });
      expect(finder.hasContainerElement(hierarchy, { elementId: "my-form" })).toBe(true);
    });

    test("returns false when container not found", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      expect(finder.hasContainerElement(hierarchy, { elementId: "missing" })).toBe(false);
    });

    test("finds container by text", () => {
      const hierarchy = makeHierarchy({
        $: { text: "Form Section", bounds: "[0,0][500,500]" },
      });
      expect(finder.hasContainerElement(hierarchy, { text: "Form Section" })).toBe(true);
    });
  });

  describe("findElementByIndex", () => {
    test("returns null for negative index", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      expect(finder.findElementByIndex(hierarchy, -1)).toBeNull();
    });

    test("returns null for out-of-bounds index", () => {
      const hierarchy = makeHierarchy({ $: { text: "Login", bounds: "[0,0][100,50]" } });
      expect(finder.findElementByIndex(hierarchy, 999)).toBeNull();
    });

    test("returns element at valid index", () => {
      const hierarchy = makeHierarchy([
        { $: { text: "First", bounds: "[0,0][100,50]" } },
        { $: { text: "Second", bounds: "[0,50][100,100]" } },
      ]);
      // Index 0 is the root, index 1 is "First", index 2 is "Second"
      const result = finder.findElementByIndex(hierarchy, 0);
      expect(result).not.toBeNull();
    });

    test("returns null for null hierarchy", () => {
      expect(finder.findElementByIndex(null as any, 0)).toBeNull();
    });
  });

  describe("findScrollableElements", () => {
    test("returns empty for null hierarchy", () => {
      expect(finder.findScrollableElements(null as any)).toEqual([]);
    });

    test("finds scrollable elements", () => {
      const hierarchy = makeHierarchy({
        $: { scrollable: "true", bounds: "[0,0][1080,1920]" },
      });
      const results = finder.findScrollableElements(hierarchy);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test("returns empty when no scrollable elements", () => {
      const hierarchy = makeHierarchy({
        $: { text: "Not scrollable", bounds: "[0,0][100,50]" },
      });
      expect(finder.findScrollableElements(hierarchy)).toEqual([]);
    });
  });

  describe("findScrollableContainer", () => {
    test("returns null for null hierarchy", () => {
      expect(finder.findScrollableContainer(null as any)).toBeNull();
    });

    test("finds first scrollable container", () => {
      const hierarchy = makeHierarchy({
        $: { scrollable: "true", bounds: "[0,0][1080,1920]" },
      });
      const result = finder.findScrollableContainer(hierarchy);
      expect(result).not.toBeNull();
    });
  });

  describe("findClickableElements", () => {
    test("returns empty for null hierarchy", () => {
      expect(finder.findClickableElements(null as any)).toEqual([]);
    });

    test("finds clickable elements", () => {
      const hierarchy = makeHierarchy([
        { $: { clickable: "true", text: "Button", bounds: "[0,0][100,50]" } },
        { $: { clickable: "false", text: "Label", bounds: "[0,50][100,100]" } },
      ]);
      const results = finder.findClickableElements(hierarchy);
      expect(results).toHaveLength(1);
    });
  });

  describe("isElementFocused", () => {
    test("returns true for focused element", () => {
      expect(finder.isElementFocused({ focused: "true" })).toBe(true);
      expect(finder.isElementFocused({ focused: true })).toBe(true);
    });

    test("returns true for selected element", () => {
      expect(finder.isElementFocused({ selected: "true" })).toBe(true);
    });

    test("returns true for isFocused element", () => {
      expect(finder.isElementFocused({ isFocused: true })).toBe(true);
    });

    test("returns true for has-keyboard-focus element", () => {
      expect(finder.isElementFocused({ "has-keyboard-focus": "true" })).toBe(true);
    });

    test("returns false for unfocused element", () => {
      expect(finder.isElementFocused({ focused: "false" })).toBe(false);
      expect(finder.isElementFocused({})).toBe(false);
    });
  });

  describe("validateElementText", () => {
    test("returns true when no expected text", () => {
      const found = { element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } } as any };
      expect(finder.validateElementText(found, undefined)).toBe(true);
    });

    test("returns false when element has no text but expected", () => {
      const found = { element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } } as any };
      expect(finder.validateElementText(found, "Login")).toBe(false);
    });

    test("returns true when text matches", () => {
      const found = {
        element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } } as any,
        text: "Login Button",
      };
      expect(finder.validateElementText(found, "Login")).toBe(true);
    });

    test("returns false when text does not match", () => {
      const found = {
        element: { bounds: { left: 0, top: 0, right: 100, bottom: 50 } } as any,
        text: "Signup",
      };
      expect(finder.validateElementText(found, "Login")).toBe(false);
    });
  });
});
