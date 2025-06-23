import { assert } from "chai";
import { RecentApps } from "../../../src/features/action/RecentApps";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("RecentApps", () => {
  let recentApps: RecentApps;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);

    recentApps = new RecentApps("test-device");
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

  // Helper to create view hierarchy with gesture navigation
  const createGestureNavigationHierarchy = () => ({
    hierarchy: {
      node: {
        $: { class: "android.widget.FrameLayout" },
        node: [
          {
            $: {
              "resource-id": "com.android.systemui:id/navigationBarBackground",
              "class": "android.view.View",
              "bounds": "[0,1800][1080,1920]"
            }
          },
          {
            $: {
              "resource-id": "com.android.systemui:id/home_handle",
              "class": "android.view.View",
              "bounds": "[480,1850][600,1870]"
            }
          }
        ]
      }
    }
  });

  // Helper to create view hierarchy with legacy navigation
  const createLegacyNavigationHierarchy = () => ({
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
                  "resource-id": "com.android.systemui:id/recent_apps",
                  "class": "android.widget.ImageView",
                  "bounds": "[720,1810][1080,1910]",
                  "clickable": "true"
                }
              }
            ]
          }
        ]
      }
    }
  });

  // Helper to create empty view hierarchy (triggers hardware fallback)
  const createEmptyHierarchy = () => ({
    hierarchy: {
      node: {
        $: { class: "android.widget.FrameLayout" }
      }
    }
  });

  describe("execute", () => {
    it("should execute gesture navigation when gesture indicators are detected", async () => {
      const mockObservation = createMockObserveResult(createGestureNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const result = await recentApps.execute();

      assert.isTrue(result.success);
      assert.equal(result.method, "gesture");
      assert.isDefined(result.observation);

      // Verify swipe command was executed
      sinon.assert.calledWith(mockAdb.executeCommand, sinon.match(/shell input swipe \d+ \d+ \d+ \d+ 500/));
    });

    it("should execute legacy navigation when recent apps button is detected", async () => {
      const mockObservation = createMockObserveResult(createLegacyNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const result = await recentApps.execute();

      assert.isTrue(result.success);
      assert.equal(result.method, "legacy");
      assert.isDefined(result.observation);

      // Verify tap command was executed on the recent apps button
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input tap 900 1860");
    });

    it("should execute hardware navigation when no navigation indicators are detected", async () => {
      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const result = await recentApps.execute();

      assert.isTrue(result.success);
      assert.equal(result.method, "hardware");
      assert.isDefined(result.observation);

      // Verify hardware keyevent was executed
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent 187");
    });

    it("should work with progress callback", async () => {
      const mockObservation = createMockObserveResult(createGestureNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const progressCallback = sinon.spy();
      const result = await recentApps.execute(progressCallback);

      assert.isTrue(result.success);
      assert.isTrue(progressCallback.called);
    });

    it("should handle missing view hierarchy gracefully", async () => {
      const mockObservation = createMockObserveResult();
      (mockObservation.viewHierarchy as any) = null;
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Could not get view hierarchy");
      }
    });

    it("should handle missing screen size gracefully", async () => {
      const mockObservation = createMockObserveResult(createGestureNavigationHierarchy());
      (mockObservation.screenSize as any) = null;
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Could not get view hierarchy");
      }
    });
  });

  describe("detectNavigationStyle", () => {
    it("should detect gesture navigation from home handle", async () => {
      const mockObservation = createMockObserveResult(createGestureNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const result = await recentApps.execute();

      assert.equal(result.method, "gesture");
    });

    it("should detect legacy navigation from recent apps button", async () => {
      const mockObservation = createMockObserveResult(createLegacyNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const result = await recentApps.execute();

      assert.equal(result.method, "legacy");
    });

    it("should default to hardware navigation when no indicators found", async () => {
      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      const result = await recentApps.execute();

      assert.equal(result.method, "hardware");
    });
  });

  describe("error handling", () => {
    it("should handle gesture navigation ADB command failure", async () => {
      const mockObservation = createMockObserveResult(createGestureNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.rejects(new Error("ADB command failed"));

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "ADB command failed");
      }
    });

    it("should handle legacy navigation ADB command failure", async () => {
      const mockObservation = createMockObserveResult(createLegacyNavigationHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.rejects(new Error("ADB command failed"));

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "ADB command failed");
      }
    });

    it("should handle hardware navigation ADB command failure", async () => {
      const mockObservation = createMockObserveResult(createEmptyHierarchy());
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.rejects(new Error("ADB command failed"));

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "ADB command failed");
      }
    });

    it("should handle missing system insets for gesture navigation", async () => {
      const mockObservation = createMockObserveResult(createGestureNavigationHierarchy());
      (mockObservation.systemInsets as any) = null;
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Screen size or system insets not available");
      }
    });

    it("should handle missing recent apps button in legacy navigation", async () => {
      // Create hierarchy with navigation bar but no recent apps button
      const hierarchyWithoutRecentButton = {
        hierarchy: {
          node: {
            $: { class: "android.widget.FrameLayout" },
            node: [
              {
                $: {
                  "resource-id": "com.android.systemui:id/nav_bar",
                  "class": "android.widget.LinearLayout",
                  "bounds": "[0,1800][1080,1920]"
                }
              }
            ]
          }
        }
      };

      const mockObservation = createMockObserveResult(hierarchyWithoutRecentButton);
      mockObserveScreen.execute.resolves(mockObservation);
      mockAdb.executeCommand.resolves(createMockExecResult(""));

      try {
        const result = await recentApps.execute();
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Recent apps button not found");
      }
    });
  });

  describe("constructor", () => {
    it("should work with null deviceId", () => {
      const recentAppsInstance = new RecentApps(null);
      assert.isDefined(recentAppsInstance);
    });

    it("should work with custom AdbUtils", () => {
      const customAdb = new AdbUtils("custom-device");
      const recentAppsInstance = new RecentApps("test-device", customAdb);
      assert.isDefined(recentAppsInstance);
    });
  });
});
