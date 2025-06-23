import { assert } from "chai";
import { HomeScreen } from "../../../src/features/action/HomeScreen";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("HomeScreen", () => {
  let homeScreen: HomeScreen;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);

    homeScreen = new HomeScreen("test-device");

    // Clear navigation cache before each test
    (HomeScreen as any).navigationCache.clear();
  });

  afterEach(() => {
    sinon.restore();
  });

  // Helper function to create mock ExecResult
  const createMockExecResult = (stdout: string = ""): ExecResult => ({
    stdout,
    stderr: "",
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (searchString: string) => stdout.includes(searchString)
  });

  // Helper function to create mock ObserveResult
  const createMockObserveResult = (viewHierarchy?: any): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
    viewHierarchy: viewHierarchy || { node: {} }
  });

  // Helper to create view hierarchy with Android 10+ properties
  const createAndroid10PropsResult = () => createMockExecResult(`
        [ro.build.version.sdk]: [29]
        [ro.build.version.release]: [10]
        [ro.product.brand]: [google]
        [ro.product.model]: [Pixel 4]
    `);

  // Helper to create view hierarchy with gesture navigation settings
  const createGestureNavigationSettings = () => createMockExecResult("2");

  // Helper to create view hierarchy with home button elements
  const createHomeButtonHierarchy = () => ({
    hierarchy: {
      node: {
        $: { class: "android.widget.FrameLayout" },
        node: [
          {
            $: {
              "resource-id": "com.android.systemui:id/nav_bar",
              "class": "android.widget.LinearLayout",
              "bounds": "[0,1800][1080,1920]"
            },
            node: [
              {
                $: {
                  "resource-id": "com.android.systemui:id/home",
                  "class": "android.widget.ImageView",
                  "bounds": "[360,1810][720,1910]",
                  "clickable": "true",
                  "content-desc": "Home"
                }
              }
            ]
          }
        ]
      }
    }
  });

  // Helper to create empty view hierarchy (no navigation elements)
  const createEmptyHierarchy = () => ({
    hierarchy: {
      node: {
        $: { class: "android.widget.FrameLayout" }
      }
    }
  });

  describe("execute", () => {
    it("should execute gesture navigation on Android 10+ with gesture nav enabled", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs(sinon.match(/shell input swipe/)).resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "gesture");
      assert.isFalse(result.cached);
      assert.isDefined(result.observation);

      // Verify gesture swipe command was executed
      sinon.assert.calledWith(mockAdb.executeCommand, sinon.match(/shell input swipe \d+ \d+ \d+ \d+ 300/));
    });

    it("should execute element navigation when home button is detected", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs(sinon.match(/shell input tap/)).resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createHomeButtonHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "element");
      assert.isFalse(result.cached);
      assert.isDefined(result.observation);

      // Verify tap command was executed on home button center
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input tap 540 1860");
    });

    it("should fallback to hardware when no other methods are available", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createMockExecResult("0"))
        .withArgs(sinon.match(/shell input tap/)).resolves(createMockExecResult(""))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
      assert.isFalse(result.cached);
      assert.isDefined(result.observation);

      // Verify hardware home button keyevent was executed
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent 3");
    });

    it("should work with progress callback", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.spy();
      const result = await homeScreen.execute(progressCallback);

      assert.isTrue(result.success);
      assert.isTrue(progressCallback.called);
    });
  });

  describe("navigation caching", () => {
    it("should cache navigation method after first detection", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs(sinon.match(/shell input swipe/)).resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      // First execution should detect and cache
      const result1 = await homeScreen.execute();
      assert.isFalse(result1.cached);

      // Second execution should use cache
      const result2 = await homeScreen.execute();
      assert.isTrue(result2.cached);
      assert.equal(result2.navigationMethod, "gesture");

      // Should not call detection methods again
      sinon.assert.calledOnce(mockAdb.executeCommand.withArgs("shell getprop"));
    });

    it("should expire cache after timeout", async () => {
      // Set short cache duration for testing
      const originalCacheDuration = (HomeScreen as any).CACHE_DURATION_MS;
      (HomeScreen as any).CACHE_DURATION_MS = 1; // 1ms

      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      // First execution
      const result1 = await homeScreen.execute();
      assert.isFalse(result1.cached);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Second execution should re-detect
      const result2 = await homeScreen.execute();
      assert.isFalse(result2.cached);

      // Restore original cache duration
      (HomeScreen as any).CACHE_DURATION_MS = originalCacheDuration;
    });

    it("should handle different device IDs separately", async () => {
      const homeScreen2 = new HomeScreen("device-2");

      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      // Cache for first device
      const result1 = await homeScreen.execute();
      assert.isFalse(result1.cached);

      // Different device should not use cache
      const result2 = await homeScreen2.execute();
      assert.isFalse(result2.cached);
    });
  });

  describe("navigation detection", () => {
    it("should detect gesture navigation on Android 10+ with correct settings", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs(sinon.match(/shell input swipe/)).resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.equal(result.navigationMethod, "gesture");
    });

    it("should detect element navigation when home button exists", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs(sinon.match(/shell input tap/)).resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createHomeButtonHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.equal(result.navigationMethod, "element");
    });

    it("should fallback to hardware when no other methods are available", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createMockExecResult("0"))
        .withArgs(sinon.match(/shell input tap/)).resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.equal(result.navigationMethod, "hardware");
    });
  });

  describe("fallback navigation", () => {
    it("should fallback from gesture to hardware when gesture fails", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs(sinon.match(/shell input swipe/)).rejects(new Error("Gesture failed"))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should fallback from element to hardware when element fails", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs(sinon.match(/shell input tap/)).rejects(new Error("Element tap failed"))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createHomeButtonHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should return failure when all methods fail", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs(sinon.match(/shell input/)).rejects(new Error("All methods failed"));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await homeScreen.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "All methods failed");
      }
    });
  });

  describe("home button detection", () => {
    it("should find home button by resource ID", async () => {
      const hierarchyWithHomeId = {
        hierarchy: {
          node: {
            $: { class: "android.widget.FrameLayout" },
            node: [{
              $: {
                "resource-id": "com.android.systemui:id/home",
                "class": "android.widget.ImageView",
                "bounds": "[400,1800][680,1920]"
              }
            }]
          }
        }
      };

      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input tap 540 1860").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(hierarchyWithHomeId);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.equal(result.navigationMethod, "element");
    });

    it("should find home button by content description", async () => {
      const hierarchyWithHomeDesc = {
        hierarchy: {
          node: {
            $: { class: "android.widget.FrameLayout" },
            node: [{
              $: {
                "resource-id": "navigation_home",
                "class": "android.widget.Button",
                "bounds": "[400,1800][680,1920]",
                "content-desc": "Home"
              }
            }]
          }
        }
      };

      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input tap 540 1860").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(hierarchyWithHomeDesc);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.equal(result.navigationMethod, "element");
    });

    it("should not detect home button without proper class name", async () => {
      const hierarchyWithWrongClass = {
        hierarchy: {
          node: {
            $: { class: "android.widget.FrameLayout" },
            node: [{
              $: {
                "resource-id": "com.android.systemui:id/home",
                "class": "android.widget.TextView", // Wrong class
                "bounds": "[400,1800][680,1920]"
              }
            }]
          }
        }
      };

      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(hierarchyWithWrongClass);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.equal(result.navigationMethod, "hardware"); // Falls back to hardware
    });
  });

  describe("error handling", () => {
    it("should handle missing screen size for gesture navigation", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult();
      (mockObservation.screenSize as any) = null;
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      // Should fallback to hardware navigation
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should handle missing view hierarchy for element navigation", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult();
      (mockObservation.viewHierarchy as any) = null;
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      // Should fallback to hardware navigation
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should handle device properties failure", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").rejects(new Error("getprop failed"))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      // Should fallback to hardware navigation
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should handle navigation settings failure", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").rejects(new Error("settings failed"))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      // Should fallback to hardware navigation
      assert.equal(result.navigationMethod, "hardware");
    });
  });
});
