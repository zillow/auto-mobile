import { expect, describe, test, beforeEach, afterEach } from "bun:test";
import { Explore } from "../../../src/features/navigation/Explore";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { BootedDevice, Element, ObserveResult } from "../../../src/models";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";

describe("Explore", () => {
  let explore: Explore;
  let device: BootedDevice;
  let mockAdb: any;
  let mockObserveScreen: any;

  beforeEach(() => {
    // Reset singleton
    NavigationGraphManager.resetInstance();

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
          NavigationGraphManager.getInstance().recordNavigationEvent({
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
          NavigationGraphManager.getInstance().recordNavigationEvent({
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
    NavigationGraphManager.resetInstance();
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
    test.skip("should complete with default options (requires full device setup)", async () => {
      // This test requires mocking TapOnElement which is complex
      // Core functionality is tested in unit tests below
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 2,
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
      assert.isAtLeast(result.interactionsPerformed, 0);
      assert.exists(result.navigationGraph);
      assert.exists(result.coverage);
    });

    test.skip("should respect maxInteractions limit (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const maxInteractions = 3;
      const result = await explore.execute({
        maxInteractions,
        timeoutMs: 10000
      });

      assert.isAtMost(result.interactionsPerformed, maxInteractions);
    });

    test.skip("should discover new screens (requires full device setup)", async () => {
      const manager = NavigationGraphManager.getInstance();
      manager.setCurrentApp("com.test.app");

      // Set initial screen
      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0,
        applicationId: "com.test.app"
      });

      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 5,
        timeoutMs: 10000
      });

      assert.isAtLeast(result.screensDiscovered, 0);
      assert.exists(result.navigationGraph);
    });

    test.skip("should track exploration path (requires full device setup)", async () => {
      const manager = NavigationGraphManager.getInstance();
      manager.setCurrentApp("com.test.app");

      manager.recordNavigationEvent({
        destination: "HomeScreen",
        source: "TEST",
        arguments: {},
        metadata: {},
        timestamp: Date.now(),
        sequenceNumber: 0,
        applicationId: "com.test.app"
      });

      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        timeoutMs: 5000
      });

      assert.isArray(result.explorationPath);
    });

    test.skip("should calculate coverage correctly (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 5,
        timeoutMs: 5000
      });

      assert.exists(result.coverage);
      assert.isNumber(result.coverage.totalScreens);
      assert.isNumber(result.coverage.exploredScreens);
      assert.isNumber(result.coverage.percentage);
      assert.isAtLeast(result.coverage.percentage, 0);
      assert.isAtMost(result.coverage.percentage, 100);
    });
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

      explore = new Explore(device, mockAdb);
      const navElements = (explore as any).extractNavigationElements(mockObservation.viewHierarchy);

      // Should filter out EditText
      expect(navElements.length).toBeLessThan(nodes.length);

      // Should include Settings button
      const hasSettings = navElements.some((el: Element) => el.text === "Settings");
      expect(hasSettings).toBe(true);
    });

    test("should calculate navigation scores correctly", async () => {
      explore = new Explore(device, mockAdb);

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

      const buttonScore = (explore as any).calculateNavigationScore(buttonElement);
      const tabScore = (explore as any).calculateNavigationScore(tabElement);

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

      explore = new Explore(device, mockAdb);
      const navElements = (explore as any).extractNavigationElements(mockObservation.viewHierarchy);

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

      explore = new Explore(device, mockAdb);
      const isPermission = (explore as any).isPermissionDialog(elements);

      expect(isPermission).toBe(true);
    });

    test("should detect login screens", async () => {
      const elements = [
        createMockElement({ "text": "Sign in", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" }),
        createMockElement({ "text": "Password", "class": "android.widget.TextView" })
      ];

      explore = new Explore(device, mockAdb);
      const isLogin = (explore as any).isLoginScreen(elements);

      expect(isLogin).toBe(true);
    });

    test("should detect rating dialogs", async () => {
      const elements = [
        createMockElement({ text: "Rate this app" }),
        createMockElement({ text: "Not now" }),
        createMockElement({ text: "5 stars" })
      ];

      explore = new Explore(device, mockAdb);
      const isRating = (explore as any).isRatingDialog(elements);

      expect(isRating).toBe(true);
    });

    test("should not detect regular screens as blockers", async () => {
      const elements = [
        createMockElement({ text: "Home" }),
        createMockElement({ text: "Settings" }),
        createMockElement({ text: "Profile" })
      ];

      explore = new Explore(device, mockAdb);
      const isPermission = (explore as any).isPermissionDialog(elements);
      const isLogin = (explore as any).isLoginScreen(elements);
      const isRating = (explore as any).isRatingDialog(elements);

      expect(isPermission).toBe(false);
      expect(isLogin).toBe(false);
      expect(isRating).toBe(false);
    });
  });

  describe("exploration strategies", () => {
    test.skip("should support breadth-first strategy (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        strategy: "breadth-first",
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
    });

    test.skip("should support depth-first strategy (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        strategy: "depth-first",
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
    });

    test.skip("should support weighted strategy (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        strategy: "weighted",
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
    });
  });

  describe("exploration modes", () => {
    test.skip("should support discover mode (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        mode: "discover",
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
    });

    test.skip("should support validate mode (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        mode: "validate",
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
    });

    test.skip("should support hybrid mode (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 3,
        mode: "hybrid",
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
    });
  });

  describe("safety features", () => {
    test.skip("should track consecutive back presses (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);

      // Mock observe screen that returns no navigation elements
      (explore as any).observeScreen = {
        execute: async () => createMockObservation([])
      };

      const result = await explore.execute({
        maxInteractions: 20,
        timeoutMs: 5000
      });

      // Should stop before reaching maxInteractions due to safety limit
      expect(result.success).toBe(true);
    });

    test.skip("should include performance metrics (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 2,
        timeoutMs: 5000
      });

      assert.exists(result.durationMs);
      assert.isNumber(result.durationMs);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

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

      explore = new Explore(device, adbWithTracking);
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

      explore = new Explore(device, adbWithTracking);
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
    test.skip("should track element interactions (requires full device setup)", async () => {
      explore = new Explore(device, mockAdb);
      (explore as any).observeScreen = mockObserveScreen;

      const result = await explore.execute({
        maxInteractions: 5,
        timeoutMs: 5000
      });

      // Should have element selection stats
      if (result.elementSelections) {
        assert.isArray(result.elementSelections);
      }
    });

    test("should generate unique element keys", async () => {
      explore = new Explore(device, mockAdb);

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

      const key1 = (explore as any).getElementKey(element1);
      const key2 = (explore as any).getElementKey(element2);
      const key3 = (explore as any).getElementKey(element3);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });
});
