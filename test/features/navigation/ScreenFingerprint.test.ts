import { expect, describe, test } from "bun:test";
import {
  ScreenFingerprint,
  AccessibilityHierarchy,
  FingerprintConfidence,
  FingerprintMethod,
} from "../../../src/features/navigation/ScreenFingerprint";

describe("ScreenFingerprint - Enhanced Implementation", () => {
  describe("Tier 1: Navigation ID Strategy", () => {
    test("should use navigation ID when present (highest confidence)", () => {
      const hierarchy = createHierarchy({
        node: {
          "resource-id": "navigation.HomeDestination",
          "node": {
            "text": "Home Screen",
            "resource-id": "home_screen_content",
          },
        },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.method).toBe(FingerprintMethod.NAVIGATION_ID);
      expect(result.confidence).toBe(FingerprintConfidence.VERY_HIGH);
      expect(result.navigationId).toBe("navigation.HomeDestination");
      expect(result.hash).toBeDefined();
    });

    test("should find navigation ID deep in hierarchy", () => {
      const hierarchy = createHierarchy({
        node: {
          className: "Root",
          node: {
            className: "Container",
            node: {
              "resource-id": "navigation.SettingsScreen",
              "node": {
                text: "Settings",
              },
            },
          },
        },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.method).toBe(FingerprintMethod.NAVIGATION_ID);
      expect(result.navigationId).toBe("navigation.SettingsScreen");
    });

    test("should produce same hash for same navigation ID", () => {
      const hierarchy1 = createHierarchy({
        node: {
          "resource-id": "navigation.Home",
          "node": { text: "Different content 1" },
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          "resource-id": "navigation.Home",
          "node": { text: "Different content 2" },
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should produce different hash for different navigation IDs", () => {
      const hierarchy1 = createHierarchy({
        node: { "resource-id": "navigation.Home" },
      });

      const hierarchy2 = createHierarchy({
        node: { "resource-id": "navigation.Settings" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });
  });

  describe("Tier 2: Cached Navigation ID (Keyboard Occlusion)", () => {
    test("should use cached navigation ID when keyboard detected", () => {
      const hierarchyWithKeyboard = createHierarchy({
        node: {
          "content-desc": "Delete",
          "node": { "content-desc": "Enter" },
        },
      });

      const result = ScreenFingerprint.compute(hierarchyWithKeyboard, {
        cachedNavigationId: "navigation.TextScreen",
        cachedNavigationIdTimestamp: 1234567890 - 5000, // 5 seconds ago
      });

      expect(result.method).toBe(FingerprintMethod.CACHED_NAVIGATION_ID);
      expect(result.confidence).toBe(FingerprintConfidence.HIGH);
      expect(result.navigationId).toBe("navigation.TextScreen");
      expect(result.keyboardDetected).toBe(true);
    });

    test("should not use cached ID if cache expired", () => {
      const hierarchyWithKeyboard = createHierarchy({
        node: { "content-desc": "Delete" },
      });

      const result = ScreenFingerprint.compute(hierarchyWithKeyboard, {
        cachedNavigationId: "navigation.TextScreen",
        cachedNavigationIdTimestamp: 1234567890 - 15000, // 15 seconds ago (expired)
        cacheTTL: 10000,
      });

      expect(result.method).not.toBe(FingerprintMethod.CACHED_NAVIGATION_ID);
      expect(result.keyboardDetected).toBe(true);
    });

    test("should not use cached ID if no keyboard detected", () => {
      const hierarchyWithoutKeyboard = createHierarchy({
        node: { text: "Regular content" },
      });

      const result = ScreenFingerprint.compute(hierarchyWithoutKeyboard, {
        cachedNavigationId: "navigation.TextScreen",
        cachedNavigationIdTimestamp: 1234567890 - 5000,
      });

      expect(result.method).toBe(FingerprintMethod.SHALLOW_SCROLLABLE);
      expect(result.keyboardDetected).toBe(false);
    });
  });

  describe("Keyboard Detection", () => {
    test("should detect keyboard from Delete content-desc", () => {
      const hierarchy = createHierarchy({
        node: { "content-desc": "Delete" },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.keyboardDetected).toBe(true);
    });

    test("should detect keyboard from Enter content-desc", () => {
      const hierarchy = createHierarchy({
        node: { "content-desc": "Enter" },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.keyboardDetected).toBe(true);
    });

    test("should detect keyboard from emoji content-desc", () => {
      const hierarchy = createHierarchy({
        node: { "content-desc": "Show emoji keyboard" },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.keyboardDetected).toBe(true);
    });

    test("should detect keyboard from resource-id", () => {
      const hierarchy = createHierarchy({
        node: { "resource-id": "com.google.android.inputmethod.latin:id/key" },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.keyboardDetected).toBe(true);
    });

    test("should not detect keyboard in normal content", () => {
      const hierarchy = createHierarchy({
        node: {
          "text": "Regular content",
          "resource-id": "app:id/content",
        },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.keyboardDetected).toBe(false);
    });
  });

  describe("Shallow Scrollable Markers", () => {
    test("should create shallow marker for scrollable container", () => {
      const hierarchy1 = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "list_container",
          "className": "RecyclerView",
          "node": [
            { "text": "Item 1", "resource-id": "item" },
            { "text": "Item 2", "resource-id": "item" },
            { "text": "Item 3", "resource-id": "item" },
          ],
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "list_container",
          "className": "RecyclerView",
          "node": [
            { "text": "Item 4", "resource-id": "item" },
            { "text": "Item 5", "resource-id": "item" },
          ],
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      // Same fingerprint despite different scrolled content
      expect(result1.hash).toBe(result2.hash);
      expect(result1.method).toBe(FingerprintMethod.SHALLOW_SCROLLABLE);
    });

    test("should handle scrolling with completely different items", () => {
      const hierarchyBeforeScroll = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "tap_screen_content",
          "node": [
            { "resource-id": "button_regular" },
            { "resource-id": "button_elevated" },
            { "resource-id": "press_duration_tracker" },
          ],
        },
      });

      const hierarchyAfterScroll = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "tap_screen_content",
          "node": [
            { "resource-id": "filter_chip_1" },
            { "resource-id": "icon_button_delete" },
            { "resource-id": "slider_control" },
          ],
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchyBeforeScroll);
      const result2 = ScreenFingerprint.compute(hierarchyAfterScroll);

      // Same screen, just scrolled
      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("Selected State Preservation", () => {
    test("should preserve selected state for non-scrollable tabs", () => {
      const homeTab = createHierarchy({
        node: [
          { selected: "true", node: { text: "Home" } },
          { selected: "false", node: { text: "Profile" } },
          { selected: "false", node: { text: "Settings" } },
        ],
      });

      const settingsTab = createHierarchy({
        node: [
          { selected: "false", node: { text: "Home" } },
          { selected: "false", node: { text: "Profile" } },
          { selected: "true", node: { text: "Settings" } },
        ],
      });

      const result1 = ScreenFingerprint.compute(homeTab);
      const result2 = ScreenFingerprint.compute(settingsTab);

      // Different selected tabs = different screens
      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should preserve selected items in scrollable tab rows (critical)", () => {
      const homeTabScrolled = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "tab_row",
          "node": [
            { selected: "true", node: { text: "Home" } },
            { selected: "false", node: { text: "Profile" } },
            { selected: "false", node: { text: "Settings" } },
          ],
        },
      });

      const settingsTabScrolled = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "tab_row",
          "node": [
            { selected: "false", node: { text: "Profile" } },
            { selected: "true", node: { text: "Settings" } },
            { selected: "false", node: { text: "About" } },
          ],
        },
      });

      const result1 = ScreenFingerprint.compute(homeTabScrolled);
      const result2 = ScreenFingerprint.compute(settingsTabScrolled);

      // Different screens despite same scrollable container
      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should handle same screen with scrollable tabs at different positions", () => {
      const settingsVisible1 = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "tab_row",
          "node": [
            { selected: "false", node: { text: "Home" } },
            { selected: "false", node: { text: "Profile" } },
            { selected: "true", node: { text: "Settings" } },
            { selected: "false", node: { text: "About" } },
          ],
        },
      });

      const settingsVisible2 = createHierarchy({
        node: {
          "scrollable": "true",
          "resource-id": "tab_row",
          "node": [
            { selected: "false", node: { text: "Profile" } },
            { selected: "true", node: { text: "Settings" } },
            { selected: "false", node: { text: "About" } },
            { selected: "false", node: { text: "Help" } },
          ],
        },
      });

      const result1 = ScreenFingerprint.compute(settingsVisible1);
      const result2 = ScreenFingerprint.compute(settingsVisible2);

      // Same screen (Settings selected) despite different visible tabs
      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("Dynamic Content Filtering", () => {
    test("should filter time patterns", () => {
      const hierarchy1 = createHierarchy({
        node: { text: "8:55" },
      });

      const hierarchy2 = createHierarchy({
        node: { text: "8:56" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      // Same screen despite different time
      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter AM/PM time patterns", () => {
      const hierarchy1 = createHierarchy({
        node: { text: "8:55 AM" },
      });

      const hierarchy2 = createHierarchy({
        node: { text: "9:00 PM" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter pure numbers", () => {
      const hierarchy1 = createHierarchy({
        node: { text: "42" },
      });

      const hierarchy2 = createHierarchy({
        node: { text: "100" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter percentage patterns", () => {
      const hierarchy1 = createHierarchy({
        node: { text: "45%" },
      });

      const hierarchy2 = createHierarchy({
        node: { text: "90%" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should keep static text", () => {
      const hierarchy1 = createHierarchy({
        node: { text: "Settings" },
      });

      const hierarchy2 = createHierarchy({
        node: { text: "Profile" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should filter system UI indicators", () => {
      const hierarchy1 = createHierarchy({
        node: { "content-desc": "Battery 50 percent" },
      });

      const hierarchy2 = createHierarchy({
        node: { "content-desc": "Battery 75 percent" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter signal strength indicators", () => {
      const hierarchy1 = createHierarchy({
        node: { "content-desc": "Phone two bars" },
      });

      const hierarchy2 = createHierarchy({
        node: { "content-desc": "Phone three bars" },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("Editable Text Filtering", () => {
    test("should filter text from EditText fields", () => {
      const hierarchy1 = createHierarchy({
        node: {
          "className": "android.widget.EditText",
          "text": "user input 1",
          "resource-id": "edit_field",
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          "className": "android.widget.EditText",
          "text": "different user input",
          "resource-id": "edit_field",
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      // Same screen despite different input text
      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter text from text-entry-mode fields", () => {
      const hierarchy1 = createHierarchy({
        node: {
          "text-entry-mode": "true",
          "text": "input 1",
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          "text-entry-mode": "true",
          "text": "input 2",
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter text from editable=true fields", () => {
      const hierarchy1 = createHierarchy({
        node: {
          editable: "true",
          text: "editable content 1",
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          editable: "true",
          text: "editable content 2",
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter text from input/edit resource-id patterns", () => {
      const hierarchy1 = createHierarchy({
        node: {
          "resource-id": "text_input_field",
          "text": "input 1",
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          "resource-id": "text_input_field",
          "text": "input 2",
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("Keyboard Element Filtering", () => {
    test("should filter keyboard elements from hierarchy", () => {
      const hierarchyWithKeyboard = createHierarchy({
        node: [
          { "text": "App Content", "resource-id": "app:id/content" },
          { "content-desc": "Delete", "resource-id": "keyboard:id/delete" },
          { "content-desc": "Enter", "resource-id": "keyboard:id/enter" },
        ],
      });

      const hierarchyWithoutKeyboard = createHierarchy({
        node: [
          { "text": "App Content", "resource-id": "app:id/content" },
        ],
      });

      const result1 = ScreenFingerprint.compute(hierarchyWithKeyboard);
      const result2 = ScreenFingerprint.compute(hierarchyWithoutKeyboard);

      // Keyboard elements filtered out
      expect(result1.keyboardDetected).toBe(true);
      expect(result2.keyboardDetected).toBe(false);
    });
  });

  describe("System UI Filtering", () => {
    test("should filter system UI resource-ids", () => {
      const hierarchy1 = createHierarchy({
        node: [
          { "resource-id": "com.android.systemui:id/clock" },
          { "resource-id": "app:id/content" },
        ],
      });

      const hierarchy2 = createHierarchy({
        node: [
          { "resource-id": "com.android.systemui:id/battery" },
          { "resource-id": "app:id/content" },
        ],
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      // Same fingerprint despite different system UI
      expect(result1.hash).toBe(result2.hash);
    });

    test("should filter android:id/ resource-ids", () => {
      const hierarchy1 = createHierarchy({
        node: {
          "resource-id": "android:id/status_bar",
        },
      });

      const hierarchy2 = createHierarchy({
        node: {
          "resource-id": "android:id/navigation_bar",
        },
      });

      const result1 = ScreenFingerprint.compute(hierarchy1);
      const result2 = ScreenFingerprint.compute(hierarchy2);

      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("Confidence Levels", () => {
    test("should return VERY_HIGH confidence for navigation ID", () => {
      const hierarchy = createHierarchy({
        node: { "resource-id": "navigation.Home" },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.confidence).toBe(FingerprintConfidence.VERY_HIGH);
    });

    test("should return HIGH confidence for cached navigation ID", () => {
      const hierarchy = createHierarchy({
        node: { "content-desc": "Delete" },
      });

      const result = ScreenFingerprint.compute(hierarchy, {
        cachedNavigationId: "navigation.Text",
        cachedNavigationIdTimestamp: 1234567890 - 5000,
      });

      expect(result.confidence).toBe(FingerprintConfidence.HIGH);
    });

    test("should return MEDIUM confidence for shallow scrollable", () => {
      const hierarchy = createHierarchy({
        node: { text: "Content" },
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.confidence).toBe(FingerprintConfidence.MEDIUM);
    });

    test("should return LOW_MEDIUM confidence for shallow scrollable with keyboard", () => {
      const hierarchy = createHierarchy({
        node: [
          { text: "Content" },
          { "content-desc": "Delete" },
        ],
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.confidence).toBe(FingerprintConfidence.LOW_MEDIUM);
      expect(result.keyboardDetected).toBe(true);
    });
  });

  describe("Real-world Scenarios", () => {
    test("should handle discover-swipe vs discover-tap collision", () => {
      // Before selected state fix, these would collide
      const swipeScreen = createHierarchy({
        node: {
          node: [
            { selected: "true", node: { text: "Swipe" } },
            { selected: "false", node: { text: "Tap" } },
          ],
        },
      });

      const tapScreen = createHierarchy({
        node: {
          node: [
            { selected: "false", node: { text: "Swipe" } },
            { selected: "true", node: { text: "Tap" } },
          ],
        },
      });

      const result1 = ScreenFingerprint.compute(swipeScreen);
      const result2 = ScreenFingerprint.compute(tapScreen);

      // No collision - different screens
      expect(result1.hash).not.toBe(result2.hash);
    });

    test("should handle keyboard occlusion with cached ID", () => {
      const screenWithoutKeyboard = createHierarchy({
        node: {
          "resource-id": "navigation.TextScreen",
          "node": { text: "Type something" },
        },
      });

      const screenWithKeyboard = createHierarchy({
        node: [
          { "content-desc": "Delete" },
          { "content-desc": "Enter" },
        ],
      });

      const result1 = ScreenFingerprint.compute(screenWithoutKeyboard);

      // Keyboard appears - use cached navigation ID
      const result2 = ScreenFingerprint.compute(screenWithKeyboard, {
        cachedNavigationId: result1.navigationId,
        cachedNavigationIdTimestamp: result1.timestamp,
      });

      // Same fingerprint despite keyboard
      expect(result1.hash).toBe(result2.hash);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty hierarchy", () => {
      const hierarchy = createHierarchy({});

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.hash).toBeDefined();
      expect(result.method).toBe(FingerprintMethod.SHALLOW_SCROLLABLE);
    });

    test("should handle null nodes", () => {
      const hierarchy = createHierarchy({
        node: null,
      });

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.hash).toBeDefined();
    });

    test("should handle deeply nested hierarchy", () => {
      let nested: any = { text: "Deep" };
      for (let i = 0; i < 20; i++) {
        nested = { node: nested };
      }

      const hierarchy = createHierarchy(nested);

      const result = ScreenFingerprint.compute(hierarchy);

      expect(result.hash).toBeDefined();
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
