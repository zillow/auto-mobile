import { expect, describe, test } from "bun:test";
import { ScreenFingerprint, AccessibilityHierarchy } from "../../../src/features/navigation/ScreenFingerprint";

describe("ScreenFingerprint", () => {
  describe("compute", () => {
    test("should compute fingerprint from simple hierarchy", () => {
      const hierarchy = createHierarchy({
        "text": "Hello World",
        "resource-id": "com.app:id/title",
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64); // SHA-256 produces 64 hex chars
      expect(result.timestamp).toBe(1234567890);
      expect(result.packageName).toBe("com.test.app");
      expect(result.elementCount).toBeGreaterThan(0);
    });

    test("should produce same hash for same hierarchy (determinism)", () => {
      const hierarchy = createHierarchy({
        "text": "Screen Title",
        "resource-id": "com.app:id/header",
        "node": [
          { "text": "Button 1", "resource-id": "com.app:id/btn1" },
          { "text": "Button 2", "resource-id": "com.app:id/btn2" },
        ],
      });

      const result1 = ScreenFingerprint.compute(hierarchy);
      const result2 = ScreenFingerprint.compute(hierarchy);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should produce different hash for different hierarchy", () => {
      const hierarchy1 = createHierarchy({
        "text": "Screen A",
        "resource-id": "com.app:id/screen_a",
      });

      const hierarchy2 = createHierarchy({
        "text": "Screen B",
        "resource-id": "com.app:id/screen_b",
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should include text in fingerprint", () => {
      const hierarchy1 = createHierarchy({
        text: "Text A",
      });

      const hierarchy2 = createHierarchy({
        text: "Text B",
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should include resource-id in fingerprint", () => {
      const hierarchy1 = createHierarchy({
        "resource-id": "com.app:id/screen_a",
      });

      const hierarchy2 = createHierarchy({
        "resource-id": "com.app:id/screen_b",
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should include content-desc in fingerprint", () => {
      const hierarchy1 = createHierarchy({
        "content-desc": "Description A",
      });

      const hierarchy2 = createHierarchy({
        "content-desc": "Description B",
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should include test-tag in fingerprint", () => {
      const hierarchy1 = createHierarchy({
        "test-tag": "tag_a",
      });

      const hierarchy2 = createHierarchy({
        "test-tag": "tag_b",
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should handle nested hierarchy", () => {
      const hierarchy = createHierarchy({
        "resource-id": "com.app:id/root",
        "node": {
          "resource-id": "com.app:id/container",
          "node": {
            "text": "Nested Text",
            "resource-id": "com.app:id/nested",
          },
        },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.elementCount).toBeGreaterThanOrEqual(3); // At least 3 elements collected
    });

    test("should handle array of child nodes", () => {
      const hierarchy = createHierarchy({
        "resource-id": "com.app:id/root",
        "node": [
          { "text": "Item 1", "resource-id": "com.app:id/item1" },
          { "text": "Item 2", "resource-id": "com.app:id/item2" },
          { "text": "Item 3", "resource-id": "com.app:id/item3" },
        ],
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.elementCount).toBeGreaterThanOrEqual(4); // root + 3 items, each with text + id
    });

    test("should handle empty hierarchy", () => {
      const hierarchy = createHierarchy({});

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.hash).toBeDefined();
      expect(result.elementCount).toBe(0);
    });

    test("should include additional root nodes in fingerprint", () => {
      const hierarchyWithOverlay = createHierarchy({
        node: [
          { "resource-id": "com.app:id/main" },
          { "text": "Window Content", "resource-id": "com.app:id/window_content" },
        ],
      });

      const hierarchyWithoutOverlay = createHierarchy({
        node: [
          { "resource-id": "com.app:id/main" },
        ],
      });

      const result1 = ScreenFingerprint.compute(hierarchyWithOverlay);
      const result2 = ScreenFingerprint.compute(hierarchyWithoutOverlay);

      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe("scrollable container duplicate filtering", () => {
    test("should filter duplicate list items by resource-id", () => {
      const hierarchy = createHierarchy({
        "resource-id": "com.app:id/screen",
        "node": {
          "className": "androidx.recyclerview.widget.RecyclerView",
          "scrollable": "true",
          "resource-id": "com.app:id/list",
          "node": [
            { "text": "Item 1", "resource-id": "com.app:id/list_item" },
            { "text": "Item 2", "resource-id": "com.app:id/list_item" },
            { "text": "Item 3", "resource-id": "com.app:id/list_item" },
          ],
        },
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: true,
      });

      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      // With filtering, should have fewer elements
      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
    });

    test("should detect scrollable by scrollable attribute", () => {
      const hierarchy = createHierarchy({
        "resource-id": "com.app:id/screen",
        "node": {
          "scrollable": "true",
          "resource-id": "com.app:id/list",
          "node": [
            { "text": "A", "resource-id": "com.app:id/item" },
            { "text": "B", "resource-id": "com.app:id/item" },
          ],
        },
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: true,
      });

      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
    });

    test("should detect RecyclerView by class name", () => {
      const hierarchy = createHierarchy({
        node: {
          "className": "androidx.recyclerview.widget.RecyclerView",
          "resource-id": "com.app:id/list",
          "node": [
            { "text": "X", "resource-id": "com.app:id/row" },
            { "text": "Y", "resource-id": "com.app:id/row" },
          ],
        },
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: true,
      });

      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
    });

    test("should detect ListView by class name", () => {
      const hierarchy = createHierarchy({
        node: {
          className: "android.widget.ListView",
          node: [
            { "text": "P", "resource-id": "com.app:id/list_item" },
            { "text": "Q", "resource-id": "com.app:id/list_item" },
          ],
        },
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy);
      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
    });

    test("should detect LazyColumn by class name", () => {
      const hierarchy = createHierarchy({
        node: {
          className: "androidx.compose.foundation.lazy.LazyColumn",
          node: [
            { "text": "R", "resource-id": "item" },
            { "text": "S", "resource-id": "item" },
          ],
        },
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy);
      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
    });

    test("should detect ScrollView by class name", () => {
      const hierarchy = createHierarchy({
        node: {
          className: "android.widget.ScrollView",
          node: [
            { "resource-id": "com.app:id/section" },
            { "resource-id": "com.app:id/section" },
          ],
        },
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy);
      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
    });

    test("should keep first occurrence of each resource-id group", () => {
      const hierarchy = createHierarchy({
        node: {
          scrollable: "true",
          node: [
            { "text": "First", "resource-id": "com.app:id/item" },
            { "text": "Second", "resource-id": "com.app:id/item" },
            { "text": "Third", "resource-id": "com.app:id/item" },
          ],
        },
      });

      // Without filtering, we get all texts and ids
      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      // With filtering, duplicates are removed
      const resultWithFilter = ScreenFingerprint.compute(hierarchy);

      // Filtering should reduce element count
      expect(resultWithFilter.elementCount).toBeLessThan(
        resultWithoutFilter.elementCount
      );
      // Should remove duplicates, keeping only first item's elements
      expect(resultWithFilter.elementCount).toBe(1); // Only the first id:com.app:id/item
    });

    test("should not filter items outside scrollable containers", () => {
      const hierarchy = createHierarchy({
        node: [
          { "text": "Static 1", "resource-id": "com.app:id/static" },
          { "text": "Static 2", "resource-id": "com.app:id/static" },
        ],
      });

      const resultWithFilter = ScreenFingerprint.compute(hierarchy);
      const resultWithoutFilter = ScreenFingerprint.compute(hierarchy, {
        filterDuplicates: false,
      });

      // Should be the same since items aren't in scrollable container
      expect(resultWithFilter.elementCount).toBe(
        resultWithoutFilter.elementCount
      );
    });

    test("should handle nested scrollable containers", () => {
      const hierarchy = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "com.app:id/outer_list",
          "node": [
            {
              "scrollable": "true",
              "resource-id": "com.app:id/inner_list",
              "node": [
                { "text": "Inner 1", "resource-id": "com.app:id/inner_item" },
                { "text": "Inner 2", "resource-id": "com.app:id/inner_item" },
              ],
            },
          ],
        },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      // Should have filtered duplicates in the inner list
      expect(result.elementCount).toBeGreaterThan(0);
    });
  });

  describe("options", () => {
    test("should exclude resource-ids when includeResourceIds is false", () => {
      const hierarchy = createHierarchy({
        "resource-id": "com.app:id/title",
      });

      const resultWith = ScreenFingerprint.compute(hierarchy, {
        includeResourceIds: true,
      });
      const resultWithout = ScreenFingerprint.compute(hierarchy, {
        includeResourceIds: false,
      });

      expect(resultWith.elementCount).toBe(1);
      expect(resultWithout.elementCount).toBe(0);
    });

    test("should exclude text when includeText is false", () => {
      const hierarchy = createHierarchy({
        text: "Hello",
      });

      const resultWith = ScreenFingerprint.compute(hierarchy, {
        includeText: true,
      });
      const resultWithout = ScreenFingerprint.compute(hierarchy, {
        includeText: false,
      });

      expect(resultWith.elementCount).toBe(1);
      expect(resultWithout.elementCount).toBe(0);
    });

    test("should exclude content-desc when includeContentDesc is false", () => {
      const hierarchy = createHierarchy({
        "content-desc": "Description",
      });

      const resultWith = ScreenFingerprint.compute(hierarchy, {
        includeContentDesc: true,
      });
      const resultWithout = ScreenFingerprint.compute(hierarchy, {
        includeContentDesc: false,
      });

      expect(resultWith.elementCount).toBe(1);
      expect(resultWithout.elementCount).toBe(0);
    });

    test("should exclude test-tag when includeTestTags is false", () => {
      const hierarchy = createHierarchy({
        "test-tag": "my_tag",
      });

      const resultWith = ScreenFingerprint.compute(hierarchy, {
        includeTestTags: true,
      });
      const resultWithout = ScreenFingerprint.compute(hierarchy, {
        includeTestTags: false,
      });

      expect(resultWith.elementCount).toBe(1);
      expect(resultWithout.elementCount).toBe(0);
    });
  });

  describe("element ordering", () => {
    test("should produce same hash regardless of child order", () => {
      const hierarchy1 = createHierarchy({
        node: [
          { "resource-id": "com.app:id/a" },
          { "resource-id": "com.app:id/b" },
          { "resource-id": "com.app:id/c" },
        ],
      });

      const hierarchy2 = createHierarchy({
        node: [
          { "resource-id": "com.app:id/c" },
          { "resource-id": "com.app:id/a" },
          { "resource-id": "com.app:id/b" },
        ],
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      // Hashes should be the same because elements are sorted
      expect(result1.hash).toBe(result2.hash);
    });
  });
});

// Helper function to create AccessibilityHierarchy
function createHierarchy(
  hierarchy: Record<string, any>
): AccessibilityHierarchy {
  return {
    updatedAt: 1234567890,
    packageName: "com.test.app",
    hierarchy,
  };
}
