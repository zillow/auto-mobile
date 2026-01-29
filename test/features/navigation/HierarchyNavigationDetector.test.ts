import { expect, describe, test, beforeEach, afterEach, beforeAll } from "bun:test";
import {
  HierarchyNavigationDetector,
} from "../../../src/features/navigation/HierarchyNavigationDetector";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { AccessibilityHierarchy } from "../../../src/features/navigation/ScreenFingerprint";
import { FakeTimer } from "../../fakes/FakeTimer";
import { runMigrations } from "../../helpers/database";

describe("HierarchyNavigationDetector", () => {
  let manager: NavigationGraphManager;
  let detector: HierarchyNavigationDetector;
  let fakeTimer: FakeTimer;

  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    NavigationGraphManager.resetInstance();
    manager = NavigationGraphManager.getInstance();
    await manager.setCurrentApp("com.test.app");
    await manager.clearCurrentGraph();
    await manager.setCurrentApp("com.test.app");

    // Use FakeTimer in manual mode for deterministic timing
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();

    detector = new HierarchyNavigationDetector(manager, {
      debounceMs: 50,
      stabilityTimeoutMs: 200,
      timer: fakeTimer,
    });
  });

  afterEach(() => {
    detector.dispose();
    fakeTimer.reset();
    NavigationGraphManager.resetInstance();
  });

  describe("initial state", () => {
    test("should start with no fingerprints", () => {
      expect(detector.getCurrentFingerprint()).toBeNull();
      expect(detector.getPreviousFingerprint()).toBeNull();
      expect(detector.hasPendingFingerprint()).toBe(false);
    });
  });

  describe("onHierarchyUpdate", () => {
    test("should set pending fingerprint on first update", () => {
      const hierarchy = createHierarchy("Screen A");
      detector.onHierarchyUpdate(hierarchy);

      expect(detector.hasPendingFingerprint()).toBe(true);
      expect(detector.getCurrentFingerprint()).toBeNull(); // Not stable yet
    });

    test("should stabilize fingerprint after debounce", () => {
      const hierarchy = createHierarchy("Screen A");
      detector.onHierarchyUpdate(hierarchy);

      // Advance time past debounce
      fakeTimer.advanceTime(60);

      expect(detector.hasPendingFingerprint()).toBe(false);
      expect(detector.getCurrentFingerprint()).not.toBeNull();
      expect(detector.getCurrentFingerprint()?.packageName).toBe("com.test.app");
    });

    test("should reset debounce timer on new fingerprint", () => {
      const hierarchy1 = createHierarchy("Screen A");
      const hierarchy2 = createHierarchy("Screen B");

      detector.onHierarchyUpdate(hierarchy1);
      fakeTimer.advanceTime(30); // Less than debounce

      detector.onHierarchyUpdate(hierarchy2);
      fakeTimer.advanceTime(30); // Less than debounce from second update

      // Should still be pending (timer was reset)
      expect(detector.hasPendingFingerprint()).toBe(true);

      // Advance past debounce
      fakeTimer.advanceTime(30);

      // Should now be stable with Screen B
      expect(detector.hasPendingFingerprint()).toBe(false);
      expect(detector.getCurrentFingerprint()).not.toBeNull();
    });

    test("should not reset timer for same fingerprint", () => {
      const hierarchy = createHierarchy("Screen A");

      detector.onHierarchyUpdate(hierarchy);
      fakeTimer.advanceTime(30);

      // Same hierarchy again - should not reset timer
      detector.onHierarchyUpdate(hierarchy);
      fakeTimer.advanceTime(30);

      // Should be stable now (60ms > 50ms debounce)
      expect(detector.hasPendingFingerprint()).toBe(false);
      expect(detector.getCurrentFingerprint()).not.toBeNull();
    });
  });

  describe("navigation detection", () => {
    test("should detect navigation when fingerprint changes", () => {
      const hierarchy1 = createHierarchy("Screen A");
      const hierarchy2 = createHierarchy("Screen B");

      // First screen
      detector.onHierarchyUpdate(hierarchy1);
      fakeTimer.advanceTime(60);

      const firstFingerprint = detector.getCurrentFingerprint();
      expect(firstFingerprint).not.toBeNull();

      // Navigate to second screen
      detector.onHierarchyUpdate(hierarchy2);
      fakeTimer.advanceTime(60);

      const secondFingerprint = detector.getCurrentFingerprint();
      expect(secondFingerprint).not.toBeNull();
      expect(secondFingerprint?.hash).not.toBe(firstFingerprint?.hash);

      // Previous should be first screen
      expect(detector.getPreviousFingerprint()?.hash).toBe(firstFingerprint?.hash);
    });

    test("should call recordHierarchyNavigation on graph manager", async () => {
      // Note: With the named-nodes-only feature, hierarchy events only create nodes
      // if there's an active navigation from an SDK event within the correlation window.
      // Without SDK events, hierarchy navigation is tracked as suggestions (if app has named nodes)
      // or ignored entirely (if app has no named nodes).

      const hierarchy1 = createHierarchy("Screen A");
      const hierarchy2 = createHierarchy("Screen B");

      detector.onHierarchyUpdate(hierarchy1);
      fakeTimer.advanceTime(60);

      detector.onHierarchyUpdate(hierarchy2);
      fakeTimer.advanceTime(60);

      // Wait for async navigation recording
      await new Promise(resolve => setImmediate(resolve));

      // For apps without SDK events (no named nodes), hierarchy events don't create screens
      // They are silently ignored until the app has named nodes from SDK integration
      const screens = await manager.getKnownScreens();
      expect(screens.length).toBe(0); // No named nodes yet

      // The detector should still track fingerprints internally
      expect(detector.getCurrentFingerprint()).not.toBeNull();
      expect(detector.getPreviousFingerprint()).not.toBeNull();
    });

    test("should not detect navigation for same fingerprint", () => {
      const hierarchy = createHierarchy("Screen A");

      detector.onHierarchyUpdate(hierarchy);
      fakeTimer.advanceTime(60);

      const firstFingerprint = detector.getCurrentFingerprint();

      // Same hierarchy again
      detector.onHierarchyUpdate(hierarchy);
      fakeTimer.advanceTime(60);

      // Should still be same fingerprint, no navigation
      expect(detector.getCurrentFingerprint()?.hash).toBe(firstFingerprint?.hash);
      expect(detector.getPreviousFingerprint()).toBeNull(); // No navigation occurred
    });
  });

  describe("stability timeout", () => {
    test("should force navigation detection after timeout", () => {
      // Create detector with long debounce, short timeout
      detector.dispose();
      const longDebounceTimer = new FakeTimer();
      longDebounceTimer.setManualMode();
      detector = new HierarchyNavigationDetector(manager, {
        debounceMs: 1000, // Long debounce
        stabilityTimeoutMs: 100, // Short timeout
        timer: longDebounceTimer,
      });

      const hierarchy1 = createHierarchy("Screen A");
      detector.onHierarchyUpdate(hierarchy1);

      // Advance past stability timeout (not debounce)
      longDebounceTimer.advanceTime(150);

      // Should have forced stable despite long debounce
      expect(detector.hasPendingFingerprint()).toBe(false);
      expect(detector.getCurrentFingerprint()).not.toBeNull();
    });
  });

  describe("reset", () => {
    test("should clear all state", () => {
      const hierarchy = createHierarchy("Screen A");
      detector.onHierarchyUpdate(hierarchy);
      fakeTimer.advanceTime(60);

      expect(detector.getCurrentFingerprint()).not.toBeNull();

      detector.reset();

      expect(detector.getCurrentFingerprint()).toBeNull();
      expect(detector.getPreviousFingerprint()).toBeNull();
      expect(detector.hasPendingFingerprint()).toBe(false);
    });

    test("should clear pending timers", () => {
      const hierarchy = createHierarchy("Screen A");
      detector.onHierarchyUpdate(hierarchy);

      expect(detector.hasPendingFingerprint()).toBe(true);

      detector.reset();

      expect(detector.hasPendingFingerprint()).toBe(false);
    });
  });

  describe("dispose", () => {
    test("should clear timers", () => {
      const hierarchy = createHierarchy("Screen A");
      detector.onHierarchyUpdate(hierarchy);

      detector.dispose();

      // Advancing time after dispose should not crash
      fakeTimer.advanceTime(100);
    });
  });

  describe("tool call correlation", () => {
    test("should record tool calls even without SDK integration", async () => {
      // Note: With the named-nodes-only feature, hierarchy events don't create edges
      // without SDK integration. Tool calls are still recorded for future correlation
      // when SDK events arrive.

      // First screen - stabilize
      const hierarchy1: AccessibilityHierarchy = {
        updatedAt: Date.now(),
        packageName: "com.test.app",
        hierarchy: {
          "text": "Screen A",
          "resource-id": "com.test.app:id/screen_a",
        },
      };
      detector.onHierarchyUpdate(hierarchy1);
      fakeTimer.advanceTime(60);

      // Wait for async recording
      await new Promise(resolve => setImmediate(resolve));

      // Record a tool call BEFORE the second screen appears
      manager.recordToolCall("tapOn", { text: "Next" });

      // Second screen appears (navigation triggered by tool call)
      const hierarchy2: AccessibilityHierarchy = {
        updatedAt: Date.now(),
        packageName: "com.test.app",
        hierarchy: {
          "text": "Screen B",
          "resource-id": "com.test.app:id/screen_b",
        },
      };
      detector.onHierarchyUpdate(hierarchy2);
      fakeTimer.advanceTime(60);

      // Wait for async navigation recording
      await new Promise(resolve => setImmediate(resolve));

      // Without SDK events (named nodes), no screens or edges are created
      // The detector tracks fingerprints internally, but they aren't recorded
      // as named nodes in the graph
      const screens = await manager.getKnownScreens();
      expect(screens.length).toBe(0);

      // Tool call should still be recorded in history
      const stats = await manager.getStats();
      expect(stats.toolCallHistorySize).toBe(1);

      // The detector should still track fingerprints
      expect(detector.getCurrentFingerprint()).not.toBeNull();
      expect(detector.getPreviousFingerprint()).not.toBeNull();
    });
  });
});

// Helper to create hierarchy with unique content
function createHierarchy(uniqueContent: string): AccessibilityHierarchy {
  return {
    updatedAt: Date.now(),
    packageName: "com.test.app",
    hierarchy: {
      "text": uniqueContent,
      "resource-id": `com.test.app:id/${uniqueContent.toLowerCase().replace(/\s/g, "_")}`,
    },
  };
}
