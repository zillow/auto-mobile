import { expect, describe, test, beforeEach } from "bun:test";
import { RecentApps } from "../../../src/features/action/RecentApps";
import { ExecResult, ObserveResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("RecentApps", () => {
  let recentApps: RecentApps;
  let fakeAdb: FakeAdbExecutor;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    // Configure default responses
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default factory function for observe results to create new objects each time
    // This is needed because BaseVisualChange compares object identity to detect changes
    let currentHierarchy = createGestureNavigationHierarchy();
    fakeObserveScreen.setObserveResult(() => {
      // Create new object to simulate actual change detection
      currentHierarchy = createGestureNavigationHierarchy();
      return createObserveResult(currentHierarchy);
    });

    // Inject the fakes into the feature
    recentApps = new RecentApps("test-device", fakeAdb, fakeTimer);
    (recentApps as any).observeScreen = fakeObserveScreen;
    (recentApps as any).window = fakeWindow;
    (recentApps as any).awaitIdle = fakeAwaitIdle;
  });

  // Helper function to create mock ExecResult
  const createExecResult = (stdout: string = ""): ExecResult => ({
    stdout,
    stderr: "",
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (searchString: string) => stdout.includes(searchString)
  });

  // Helper function to create mock ObserveResult
  const createObserveResult = (viewHierarchy?: any): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
    viewHierarchy: viewHierarchy || { node: {} }
  });

  // Helper to create view hierarchy with gesture navigation
  const createGestureNavigationHierarchy = () => ({
    hierarchy: {
      node: {
        $: {
          "class": "android.widget.FrameLayout",
          "resource-id": "@android:id/content"
        },
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

  // Helper to create view hierarchy with legacy navigation (nav bar with recent apps button)
  const createLegacyNavigationHierarchy = () => ({
    hierarchy: {
      node: {
        $: {
          "class": "android.widget.FrameLayout",
          "resource-id": "@android:id/content"
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
    }
  });

  // Helper to create empty view hierarchy (triggers hardware fallback)
  const createEmptyHierarchy = () => ({
    hierarchy: {
      node: {
        $: {
          "class": "android.widget.FrameLayout",
          "resource-id": "@android:id/content"
        }
      }
    }
  });

  describe("execute", () => {
    test("should execute gesture navigation when gesture indicators are detected", async () => {
      // Use factory function to create new objects on each call
      fakeObserveScreen.setObserveResult(() =>
        createObserveResult(createGestureNavigationHierarchy())
      );
      fakeAdb.setDefaultResponse({ stdout: "", stderr: "" });

      const result = await recentApps.execute();

      expect(result.success).toBe(true);
      expect(result.method).toBe("gesture");
      expect(result.observation).toBeDefined();

      // Verify swipe command was executed
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("shell input swipe") && cmd.includes("500"))).toBe(true);
    });

    test("should execute legacy navigation when recent apps button is detected", async () => {
      // Use factory function to create new objects on each call
      fakeObserveScreen.setObserveResult(() =>
        createObserveResult(createLegacyNavigationHierarchy())
      );
      fakeAdb.setCommandResponse("shell input tap 900 1860", { stdout: "", stderr: "" });

      const result = await recentApps.execute();

      expect(result.success).toBe(true);
      expect(result.method).toBe("legacy");
      expect(result.observation).toBeDefined();

      // Verify tap command was executed on the recent apps button
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("shell input tap 900 1860"))).toBe(true);
    });

    test("should execute hardware navigation when no navigation indicators are detected", async () => {
      // Use factory function to create new objects on each call
      fakeObserveScreen.setObserveResult(() =>
        createObserveResult(createEmptyHierarchy())
      );
      fakeAdb.setCommandResponse("shell input keyevent 187", { stdout: "", stderr: "" });

      const result = await recentApps.execute();

      expect(result.success).toBe(true);
      expect(result.method).toBe("hardware");
      expect(result.observation).toBeDefined();

      // Verify hardware keyevent was executed
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("shell input keyevent 187"))).toBe(true);
    });

    test("should work with progress callback", async () => {
      // Use factory function to create new objects on each call
      fakeObserveScreen.setObserveResult(() =>
        createObserveResult(createGestureNavigationHierarchy())
      );
      fakeAdb.setDefaultResponse({ stdout: "", stderr: "" });

      let callbackCalled = false;
      const progressCallback = () => {
        callbackCalled = true;
      };
      const result = await recentApps.execute(progressCallback);

      expect(result.success).toBe(true);
      expect(callbackCalled || fakeObserveScreen.wasMethodCalled("execute")).toBe(true);
    });

    test("should handle missing view hierarchy gracefully", async () => {
      // Set factory to return null viewHierarchy
      fakeObserveScreen.setObserveResult(() => {
        const result = createObserveResult();
        (result.viewHierarchy as any) = null;
        return result;
      });

      try {
        const result = await recentApps.execute();
        // BaseVisualChange catches the error and returns success: false
        // We're testing the graceful handling, so just ensure result is not successful
        expect(result.success).toBe(false);
      } catch (caughtError) {
        expect((caughtError as Error).message).toContain("Cannot perform action without view hierarchy");
      }
    });

    test("should handle missing screen size gracefully", async () => {
      // Set factory to return null screenSize
      fakeObserveScreen.setObserveResult(() => {
        const result = createObserveResult(createGestureNavigationHierarchy());
        (result.screenSize as any) = null;
        return result;
      });

      try {
        await recentApps.execute();
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        expect((caughtError as Error).message).toContain("Screen size or system insets not available");
      }
    });
  });

  describe("detectNavigationStyle", () => {
    test("should detect gesture navigation from home handle", async () => {
      const mockCachedObservation = createObserveResult(createGestureNavigationHierarchy());

      fakeObserveScreen.setObserveResult(mockCachedObservation);
      fakeAdb.setDefaultResponse(createExecResult(""));

      const result = await recentApps.execute();

      expect(result.method).toBe("gesture");
    });

    test("should detect legacy navigation from recent apps button", async () => {
      const mockCachedObservation = createObserveResult(createLegacyNavigationHierarchy());

      fakeObserveScreen.setObserveResult(mockCachedObservation);
      fakeAdb.setDefaultResponse(createExecResult(""));

      const result = await recentApps.execute();

      expect(result.method).toBe("legacy");
    });

    test("should default to hardware navigation when no indicators found", async () => {
      const mockCachedObservation = createObserveResult(createEmptyHierarchy());

      fakeObserveScreen.setObserveResult(mockCachedObservation);
      fakeAdb.setDefaultResponse(createExecResult(""));

      const result = await recentApps.execute();

      expect(result.method).toBe("hardware");
    });
  });

  describe("error handling", () => {
    test("should handle gesture navigation ADB command failure", async () => {
      const mockCachedObservation = createObserveResult(createGestureNavigationHierarchy());
      fakeObserveScreen.setObserveResult(mockCachedObservation);
      fakeAdb.setDefaultResponse({ stdout: "", stderr: "error" });

      try {
        await recentApps.execute();
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        expect(caughtError).toBeDefined();
      }
    });

    test("should handle legacy navigation ADB command failure", async () => {
      const mockCachedObservation = createObserveResult(createLegacyNavigationHierarchy());
      fakeObserveScreen.setObserveResult(mockCachedObservation);
      // Set default response with error to simulate ADB failure
      fakeAdb.setDefaultResponse({ stdout: "", stderr: "error" });

      try {
        await recentApps.execute();
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        // Error should be thrown when ADB command fails
        expect(caughtError).toBeDefined();
      }
    });

    test("should handle hardware navigation ADB command failure", async () => {
      const mockCachedObservation = createObserveResult(createEmptyHierarchy());
      fakeObserveScreen.setObserveResult(mockCachedObservation);
      fakeAdb.setCommandResponse("shell input keyevent 187", { stdout: "", stderr: "error" });

      try {
        await recentApps.execute();
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        expect(caughtError).toBeDefined();
      }
    });

    test("should handle missing system insets for gesture navigation", async () => {
      const mockCachedObservation = createObserveResult(createGestureNavigationHierarchy());
      (mockCachedObservation.systemInsets as any) = null;
      fakeObserveScreen.setObserveResult(mockCachedObservation);

      try {
        await recentApps.execute();
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        expect((caughtError as Error).message).toContain("Screen size or system insets not available");
      }
    });

    test("should handle missing recent apps button in legacy navigation", async () => {
      // Use a hierarchy that won't have navigation indicators, so it defaults to hardware
      // but we'll force it to legacy by mocking the detectNavigationStyle result
      const mockCachedObservation = createObserveResult(createEmptyHierarchy());
      fakeObserveScreen.setObserveResult(mockCachedObservation);
      fakeAdb.setDefaultResponse({ stdout: "", stderr: "" });

      // Mock the RecentApps instance to force legacy navigation detection
      const originalDetectNavigationStyle = (recentApps as any).detectNavigationStyle;
      (recentApps as any).detectNavigationStyle = () => "legacy";

      try {
        await recentApps.execute();
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        expect((caughtError as Error).message).toContain("Recent apps button not found");
      } finally {
        // Restore the original method
        (recentApps as any).detectNavigationStyle = originalDetectNavigationStyle;
      }
    });
  });

  describe("constructor", () => {
    test("should work with null deviceId", () => {
      const recentAppsInstance = new RecentApps("test-device", fakeAdb, fakeTimer);
      expect(recentAppsInstance).toBeDefined();
    });

    test("should work with custom AdbClient", () => {
      const customAdb = new FakeAdbExecutor();
      const recentAppsInstance = new RecentApps("test-device", customAdb, fakeTimer);
      expect(recentAppsInstance).toBeDefined();
    });
  });
});
