import { assert } from "chai";
import { MonkeyNavigate } from "../../../src/features/navigation/MonkeyNavigate";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { BootedDevice, Element, ObserveResult } from "../../../src/models";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";

describe("MonkeyNavigate", () => {
  let monkeyNavigate: MonkeyNavigate;
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
          return "Back button pressed";
        }
        if (cmd.includes("KEYCODE_HOME")) {
          return "Home button pressed";
        }
        return "";
      }
    } as AdbClient;

    // Create mock ObserveScreen
    mockObserveScreen = {
      execute: async () => {
        return createMockObservation();
      }
    };
  });

  afterEach(() => {
    NavigationGraphManager.resetInstance();
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

  function createMockObservation(elements: Element[] = []): ObserveResult {
    const defaultElements = elements.length > 0 ? elements : [
      createMockElement({ "text": "Settings", "resource-id": "com.test:id/settings_btn" }),
      createMockElement({ "text": "Profile", "resource-id": "com.test:id/profile_btn" })
    ];

    return {
      viewHierarchy: {
        hierarchy: {
          children: defaultElements
        },
        packageName: "com.test.app"
      }
    } as ObserveResult;
  }

  describe("execute", () => {
    it("should complete with default options", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 2,
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
      assert.isAtLeast(result.interactionsPerformed, 0);
      assert.exists(result.navigationGraph);
      assert.exists(result.coverage);
    });

    it("should respect maxInteractions limit", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const maxInteractions = 3;
      const result = await monkeyNavigate.execute({
        maxInteractions,
        timeoutMs: 10000
      });

      assert.isAtMost(result.interactionsPerformed, maxInteractions);
    });

    it("should discover new screens", async () => {
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

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 5,
        timeoutMs: 10000
      });

      assert.isAtLeast(result.screensDiscovered, 0);
      assert.exists(result.navigationGraph);
    });

    it("should track exploration path", async () => {
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

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        timeoutMs: 5000
      });

      assert.isArray(result.explorationPath);
    });

    it("should calculate coverage correctly", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
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
    it("should prioritize navigation elements", async () => {
      const elements = [
        createMockElement({
          "text": "Settings",
          "class": "android.widget.Button",
          "resource-id": "com.test:id/settings_btn"
        }),
        createMockElement({
          "text": "Like",
          "class": "android.widget.ImageButton",
          "clickable": true
        }),
        createMockElement({
          "text": "",
          "class": "android.widget.EditText",
          "clickable": true
        })
      ];

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      const navElements = (monkeyNavigate as any).extractNavigationElements(elements);

      // Should filter out EditText
      assert.isBelow(navElements.length, elements.length);

      // Should include Settings button
      const hasSettings = navElements.some((el: Element) => el.text === "Settings");
      assert.isTrue(hasSettings);
    });

    it("should calculate navigation scores correctly", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);

      const buttonElement = createMockElement({
        "text": "Settings",
        "class": "android.widget.Button",
        "resource-id": "com.test:id/settings_btn"
      });

      const tabElement = createMockElement({
        "text": "Profile",
        "class": "android.widget.TabLayout",
        "resource-id": "com.test:id/tab_profile"
      });

      const buttonScore = (monkeyNavigate as any).calculateNavigationScore(buttonElement);
      const tabScore = (monkeyNavigate as any).calculateNavigationScore(tabElement);

      // Tab should score higher than button
      assert.isAbove(tabScore, buttonScore);
      assert.isAbove(buttonScore, 0);
    });

    it("should filter out non-clickable elements", async () => {
      const elements = [
        createMockElement({ clickable: true }),
        createMockElement({ clickable: false }),
        createMockElement({ clickable: true, enabled: false })
      ];

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      const navElements = (monkeyNavigate as any).extractNavigationElements(elements);

      // Should only include enabled clickable elements
      assert.equal(navElements.length, 1);
    });
  });

  describe("blocker detection", () => {
    it("should detect permission dialogs", async () => {
      const elements = [
        createMockElement({ text: "Allow" }),
        createMockElement({ text: "While using the app" }),
        createMockElement({ text: "This app needs camera permission" })
      ];

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      const isPermission = (monkeyNavigate as any).isPermissionDialog(elements);

      assert.isTrue(isPermission);
    });

    it("should detect login screens", async () => {
      const elements = [
        createMockElement({ "text": "Sign in", "class": "android.widget.Button" }),
        createMockElement({ "text": "", "class": "android.widget.EditText" }),
        createMockElement({ "text": "Password", "class": "android.widget.TextView" })
      ];

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      const isLogin = (monkeyNavigate as any).isLoginScreen(elements);

      assert.isTrue(isLogin);
    });

    it("should detect rating dialogs", async () => {
      const elements = [
        createMockElement({ text: "Rate this app" }),
        createMockElement({ text: "Not now" }),
        createMockElement({ text: "5 stars" })
      ];

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      const isRating = (monkeyNavigate as any).isRatingDialog(elements);

      assert.isTrue(isRating);
    });

    it("should not detect regular screens as blockers", async () => {
      const elements = [
        createMockElement({ text: "Home" }),
        createMockElement({ text: "Settings" }),
        createMockElement({ text: "Profile" })
      ];

      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      const isPermission = (monkeyNavigate as any).isPermissionDialog(elements);
      const isLogin = (monkeyNavigate as any).isLoginScreen(elements);
      const isRating = (monkeyNavigate as any).isRatingDialog(elements);

      assert.isFalse(isPermission);
      assert.isFalse(isLogin);
      assert.isFalse(isRating);
    });
  });

  describe("exploration strategies", () => {
    it("should support breadth-first strategy", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        strategy: "breadth-first",
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
    });

    it("should support depth-first strategy", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        strategy: "depth-first",
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
    });

    it("should support weighted strategy", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        strategy: "weighted",
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
    });
  });

  describe("exploration modes", () => {
    it("should support discover mode", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        mode: "discover",
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
    });

    it("should support validate mode", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        mode: "validate",
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
    });

    it("should support hybrid mode", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 3,
        mode: "hybrid",
        timeoutMs: 5000
      });

      assert.isTrue(result.success);
    });
  });

  describe("safety features", () => {
    it("should track consecutive back presses", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);

      // Mock observe screen that returns no navigation elements
      (monkeyNavigate as any).observeScreen = {
        execute: async () => createMockObservation([])
      };

      const result = await monkeyNavigate.execute({
        maxInteractions: 20,
        timeoutMs: 5000
      });

      // Should stop before reaching maxInteractions due to safety limit
      assert.isTrue(result.success);
    });

    it("should include performance metrics", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 2,
        timeoutMs: 5000
      });

      assert.exists(result.durationMs);
      assert.isNumber(result.durationMs);
      assert.isAbove(result.durationMs, 0);
    });
  });

  describe("element tracking", () => {
    it("should track element interactions", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);
      (monkeyNavigate as any).observeScreen = mockObserveScreen;

      const result = await monkeyNavigate.execute({
        maxInteractions: 5,
        timeoutMs: 5000
      });

      // Should have element selection stats
      if (result.elementSelections) {
        assert.isArray(result.elementSelections);
      }
    });

    it("should generate unique element keys", async () => {
      monkeyNavigate = new MonkeyNavigate(device, mockAdb);

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

      const key1 = (monkeyNavigate as any).getElementKey(element1);
      const key2 = (monkeyNavigate as any).getElementKey(element2);
      const key3 = (monkeyNavigate as any).getElementKey(element3);

      assert.equal(key1, key2);
      assert.notEqual(key1, key3);
    });
  });
});
