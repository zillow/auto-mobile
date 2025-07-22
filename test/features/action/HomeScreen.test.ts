import { assert } from "chai";
import { HomeScreen } from "../../../src/features/action/HomeScreen";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { Window } from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("HomeScreen", () => {
  let homeScreen: HomeScreen;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockWindow: sinon.SinonStubbedInstance<Window>;
  let mockAwaitIdle: sinon.SinonStubbedInstance<AwaitIdle>;

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);
    mockWindow = sinon.createStubInstance(Window);
    mockAwaitIdle = sinon.createStubInstance(AwaitIdle);

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(ObserveScreen.prototype, "getMostRecentCachedObserveResult").callsFake(mockObserveScreen.getMostRecentCachedObserveResult);
    sinon.stub(Window.prototype, "getCachedActiveWindow").callsFake(mockWindow.getCachedActiveWindow);
    sinon.stub(Window.prototype, "getActive").callsFake(mockWindow.getActive);
    sinon.stub(AwaitIdle.prototype, "initializeUiStabilityTracking").callsFake(mockAwaitIdle.initializeUiStabilityTracking);
    sinon.stub(AwaitIdle.prototype, "waitForUiStability").callsFake(mockAwaitIdle.waitForUiStability);
    sinon.stub(AwaitIdle.prototype, "waitForUiStabilityWithState").callsFake(mockAwaitIdle.waitForUiStabilityWithState);

    // Set up default mock responses
    mockWindow.getCachedActiveWindow.resolves(null);
    mockWindow.getActive.resolves({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    mockAwaitIdle.initializeUiStabilityTracking.resolves();
    mockAwaitIdle.waitForUiStability.resolves();
    mockAwaitIdle.waitForUiStabilityWithState.resolves();

    // Set up default observe screen responses with valid viewHierarchy
    const defaultObserveResult = createMockObserveResult(createEmptyHierarchy());
    mockObserveScreen.getMostRecentCachedObserveResult.resolves(defaultObserveResult);
    mockObserveScreen.execute.resolves(defaultObserveResult);

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

  // Helper to create view hierarchy with home button elements, with @android:id/content
  const createHomeButtonHierarchy = () => ({
    hierarchy: {
      node: {
        $: { class: "android.widget.FrameLayout" },
        node: [
          {
            $: {
              "resource-id": "android:id/content",
              "class": "android.widget.FrameLayout"
            },
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
        ]
      }
    }
  });

  // Helper to create empty view hierarchy (no navigation elements), with @android:id/content
  const createEmptyHierarchy = () => ({
    hierarchy: {
      node: {
        $: { class: "android.widget.FrameLayout" },
        node: [
          {
            $: {
              "resource-id": "android:id/content",
              "class": "android.widget.FrameLayout"
            }
          }
        ]
      }
    }
  });

  describe("execute", () => {
    it("should execute gesture navigation on Android 10+ with gesture nav enabled", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs(sinon.match(/shell input swipe/)).resolves(createMockExecResult(""));

      // Ensure both cached and fresh observation contain correct hierarchy (without home button)
      const mockCachedObservation = createMockObserveResult(createEmptyHierarchy());
      const mockObservation = createMockObserveResult(createEmptyHierarchy());

      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockCachedObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "gesture");
      assert.isDefined(result.observation);

      // Verify gesture swipe command was executed
      sinon.assert.calledWith(mockAdb.executeCommand, sinon.match(/shell input swipe \d+ \d+ \d+ \d+ 300/));
    });

    it("should execute element navigation when home button is detected", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs(sinon.match(/shell input tap/)).resolves(createMockExecResult(""));

      // Ensure both cached and fresh observation contain the home button
      const mockCachedObservation = createMockObserveResult(createHomeButtonHierarchy());
      const mockObservation = createMockObserveResult(createHomeButtonHierarchy());

      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockCachedObservation);

      // The detectNavigationStyle method also calls observeScreen.execute, so make sure it returns the home button hierarchy
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "element");
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

      // Ensure both cached and fresh observation contain *no* navigation UI elements
      const mockCachedObservation = createMockObserveResult(createEmptyHierarchy());
      const mockObservation = createMockObserveResult(createEmptyHierarchy());

      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockCachedObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
      assert.isDefined(result.observation);

      // Verify hardware home button keyevent was executed
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent 3");
    });

    it("should work with progress callback", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      // Ensure both cached and fresh observation contain blank hierarchy (e.g. no home button)
      const mockCachedObservation = createMockObserveResult(createEmptyHierarchy());
      const mockObservation = createMockObserveResult(createEmptyHierarchy());

      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockCachedObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.spy();
      const result = await homeScreen.execute(progressCallback);

      assert.isTrue(result.success);
      assert.isTrue(progressCallback.called);
    });
  });

  describe("navigation caching", () => {

    it("should handle different device IDs separately", async () => {
      const homeScreen2 = new HomeScreen("device-2");

      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const mockCachedObservation = createMockObserveResult(createEmptyHierarchy());
      const mockObservation = createMockObserveResult(createEmptyHierarchy());

      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockCachedObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      // Cache for first device
      await homeScreen.execute();

      // Different device should not use cache
      await homeScreen2.execute();
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
      // Both the detection phase and execution phase need to see the home button
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
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
    it("should return failure when gesture navigation fails", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createAndroid10PropsResult())
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings())
        .withArgs(sinon.match(/shell input swipe/)).rejects(new Error("Gesture failed"));

      const mockObservation = createMockObserveResult();
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        await homeScreen.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include((error as Error).message, "Gesture failed");
      }
    });

    it("should return failure when element navigation fails", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs(sinon.match(/shell input tap/)).rejects(new Error("Element tap failed"));

      const mockObservation = createMockObserveResult(createHomeButtonHierarchy());
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        await homeScreen.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include((error as Error).message, "Element tap failed");
      }
    });

    it("should return failure when hardware navigation fails", async () => {
      mockAdb.executeCommand
        .withArgs("shell getprop").resolves(createMockExecResult(`[ro.build.version.sdk]: [28]`))
        .withArgs("shell input keyevent 3").rejects(new Error("Hardware failed"));

      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        await homeScreen.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include((error as Error).message, "Hardware failed");
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
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
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
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
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
        .withArgs("shell settings get secure navigation_mode").resolves(createGestureNavigationSettings());

      const mockObservation = createMockObserveResult();
      (mockObservation.screenSize as any) = null;
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockObservation);
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        await homeScreen.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include((error as Error).message, "Could not get screen size for gesture navigation");
      }
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
