import { expect, describe, test, beforeEach } from "bun:test";
import { ImeAction } from "../../../src/features/action/ImeAction";
import { ExecResult, ObserveResult, BootedDevice } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeAccessibilityService } from "../../fakes/FakeAccessibilityService";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("ImeAction", () => {
  let imeAction: ImeAction;
  let fakeAdb: FakeAdbExecutor;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeA11yService: FakeAccessibilityService;
  let fakeTimer: FakeTimer;

  // Test device for Android platform
  const testDevice: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  beforeEach(() => {
    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();
    fakeObserveScreen = new FakeObserveScreen();
    fakeObserveScreen.enableAutoVaryHierarchy();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeA11yService = new FakeAccessibilityService();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    // Set up default fake responses
    fakeWindow.configureCachedActiveWindow(null);
    fakeWindow.configureActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default observe screen responses with valid viewHierarchy
    // Use factory to generate new results on each call for change detection
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    // Set up default accessibility service response (success)
    fakeA11yService.setHierarchyData({
      packageName: "com.test.app",
      updatedAt: Date.now()
    });

    // Pass fake accessibility service and timer to constructor
    imeAction = new ImeAction(testDevice, fakeAdb, fakeA11yService, fakeTimer);

    // Replace the internal managers with our fakes
    (imeAction as any).observeScreen = fakeObserveScreen;
    (imeAction as any).window = fakeWindow;
    (imeAction as any).awaitIdle = fakeAwaitIdle;
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
  const createObserveResult = (): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: { hierarchy: { node: { $: {} } } }
  });

  describe("execute", () => {
    test("should execute IME action 'done' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("done");

      expect(result.success).toBe(true);
      expect(result.action).toBe("done");
      expect(result.observation).toBeDefined();

      // Verify accessibility service was called with correct action
      expect(fakeA11yService.wasImeActionCalled("done")).toBe(true);
      // Should NOT call ADB when accessibility service succeeds
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.length).toBe(0);
    });

    test("should execute IME action 'next' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("next");

      expect(result.success).toBe(true);
      expect(result.action).toBe("next");

      expect(fakeA11yService.wasImeActionCalled("next")).toBe(true);
    });

    test("should execute IME action 'search' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("search");

      expect(result.success).toBe(true);
      expect(result.action).toBe("search");

      expect(fakeA11yService.wasImeActionCalled("search")).toBe(true);
    });

    test("should execute IME action 'send' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("send");

      expect(result.success).toBe(true);
      expect(result.action).toBe("send");

      expect(fakeA11yService.wasImeActionCalled("send")).toBe(true);
    });

    test("should execute IME action 'go' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("go");

      expect(result.success).toBe(true);
      expect(result.action).toBe("go");

      expect(fakeA11yService.wasImeActionCalled("go")).toBe(true);
    });

    test("should execute IME action 'previous' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("previous");

      expect(result.success).toBe(true);
      expect(result.action).toBe("previous");

      expect(fakeA11yService.wasImeActionCalled("previous")).toBe(true);
    });

    test("should handle empty action string", async () => {
      const result = await imeAction.execute("" as any);

      expect(result.success).toBe(false);
      expect(result.action).toBe("");
      expect(result.error).toBe("No IME action provided");

      // Should not call accessibility service or ADB commands
      expect(fakeA11yService.getImeActionHistory().length).toBe(0);
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.length).toBe(0);
    });

    test("should work with progress callback", async () => {
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      let callbackCalled = false;
      const progressCallback = async () => {
        callbackCalled = true;
      };
      const result = await imeAction.execute("done", progressCallback);

      expect(result.success).toBe(true);
      // Progress callback should be called by BaseVisualChange
      expect(callbackCalled).toBe(true);
    });

    test("should fall back to ADB when accessibility service fails", async () => {
      // Accessibility service fails
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      expect(result.success).toBe(true);
      expect(result.action).toBe("done");

      // Verify timer was called with 100ms delay
      expect(fakeTimer.wasCalledWithDuration(100)).toBe(true);

      // Then ADB fallback was used
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("shell input keyevent KEYCODE_ENTER"))).toBe(true);
    });

    test("should fall back to ADB for multi-key actions when accessibility service fails", async () => {
      // Accessibility service fails
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_SHIFT_LEFT", createExecResult());
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_TAB", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("previous");

      expect(result.success).toBe(true);
      expect(result.action).toBe("previous");

      // Verify timer was called with 100ms delay
      expect(fakeTimer.wasCalledWithDuration(100)).toBe(true);

      // Then ADB fallback was used with both key events for Shift+Tab
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("shell input keyevent KEYCODE_SHIFT_LEFT"))).toBe(true);
      expect(executedCommands.some(cmd => cmd.includes("shell input keyevent KEYCODE_TAB"))).toBe(true);
    });
  });

  describe("constructor", () => {
    test("should work with device object", () => {
      const imeActionInstance = new ImeAction(testDevice);
      expect(imeActionInstance).toBeDefined();
    });

    test("should work with custom FakeAdbExecutor", () => {
      const customAdb = new FakeAdbExecutor();
      const imeActionInstance = new ImeAction(testDevice, customAdb);
      expect(imeActionInstance).toBeDefined();
    });
  });

  describe("timing", () => {
    test("should complete quickly via accessibility service", async () => {
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      expect(result.success).toBe(true);
      // Accessibility service path should not fall back to ADB
      expect(fakeAdb.getExecutedCommands().length).toBe(0);
    });

    test("should include delay when falling back to ADB keyevent", async () => {
      // Make accessibility service fail to trigger ADB fallback
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      expect(result.success).toBe(true);
      // Verify that timer.sleep(100) was called in ADB fallback path
      expect(fakeTimer.wasCalledWithDuration(100)).toBe(true);
    });
  });

  describe("error handling", () => {
    test("should handle missing view hierarchy gracefully", async () => {
      // Set observe screen to fail
      fakeObserveScreen.setFailureMode("getMostRecentCachedObserveResult", new Error("Cannot perform action without view hierarchy"));
      fakeObserveScreen.setFailureMode("execute", new Error("Cannot perform action without view hierarchy"));

      try {
        await imeAction.execute("done");
        throw new Error("Expected an error to be thrown");
      } catch (caughtError) {
        expect((caughtError as Error).message).toContain("Cannot perform action without view hierarchy");
      }
    });

    test("should handle observation failure", async () => {
      // Set up valid initial result but make execute fail
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      const observationError = new Error("Failed to observe screen");
      fakeObserveScreen.setFailureMode("execute", observationError);

      try {
        const result = await imeAction.execute("done");
        // If we get here, BaseVisualChange handled the observation error
        expect(result.action).toBe("done");
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        expect((caughtError as Error).message).toContain("Failed to observe screen");
      }
    });

    test("should handle null action gracefully", async () => {
      const result = await imeAction.execute(null as any);

      expect(result.success).toBe(false);
      expect(result.action).toBe("");
      expect(result.error).toBe("No IME action provided");
    });

    test("should handle undefined action gracefully", async () => {
      const result = await imeAction.execute(undefined as any);

      expect(result.success).toBe(false);
      expect(result.action).toBe("");
      expect(result.error).toBe("No IME action provided");
    });
  });

  describe("edge cases", () => {
    test("should handle all valid IME actions via accessibility service", async () => {
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const validActions: Array<"done" | "next" | "search" | "send" | "go" | "previous"> =
                ["done", "next", "search", "send", "go", "previous"];

      for (const action of validActions) {
        fakeA11yService.clearHistory();
        fakeA11yService.setHierarchyData({
          packageName: "com.test.app",
          updatedAt: Date.now()
        });
        fakeAdb.clearHistory();
        const result = await imeAction.execute(action);

        expect(result.success, `Action '${action}' should succeed`).toBe(true);
        expect(result.action).toBe(action);
        expect(fakeA11yService.wasImeActionCalled(action)).toBe(true);
      }
    });

    test("should handle rapid consecutive calls", async () => {
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeA11yService.clearHistory();
      fakeAdb.clearHistory();

      // Set up fake to return success for each action
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });

      const promises = [
        imeAction.execute("done"),
        imeAction.execute("next"),
        imeAction.execute("search")
      ];

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.success, `Call ${index} should succeed`).toBe(true);
      });

      // Should have called accessibility service for each action
      expect(fakeA11yService.getImeActionHistory().length).toBe(3);
    });
  });

  describe("key mapping (ADB fallback)", () => {
    // These tests verify the ADB fallback behavior when accessibility service fails

    beforeEach(() => {
      // Make accessibility service fail to trigger ADB fallback
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
    });

    test("should map done to KEYCODE_ENTER in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      expect(result.success).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_ENTER")).toBe(true);
    });

    test("should map next to KEYCODE_TAB in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_TAB", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("next");

      expect(result.success).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_TAB")).toBe(true);
    });

    test("should map search to KEYCODE_SEARCH in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_SEARCH", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("search");

      expect(result.success).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_SEARCH")).toBe(true);
    });

    test("should map send to KEYCODE_ENTER in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("send");

      expect(result.success).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_ENTER")).toBe(true);
    });

    test("should map go to KEYCODE_ENTER in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("go");

      expect(result.success).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_ENTER")).toBe(true);
    });

    test("should map previous to SHIFT+TAB combination in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_SHIFT_LEFT", createExecResult());
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_TAB", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("previous");

      expect(result.success).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_SHIFT_LEFT")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_TAB")).toBe(true);
      // At least 2 calls for the key combination, but BaseVisualChange might make additional calls
      expect(fakeAdb.getExecutedCommands().length).toBeGreaterThanOrEqual(2);
    });
  });
});
