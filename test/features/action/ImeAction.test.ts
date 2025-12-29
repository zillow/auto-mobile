import { assert } from "chai";
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
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeA11yService = new FakeAccessibilityService();
    fakeTimer = new FakeTimer();

    // Set up default fake responses
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default observe screen responses with valid viewHierarchy
    // Use factory to generate new results on each call for change detection
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    // Set up default accessibility service response (success)
    fakeA11yService.setHierarchyData({
      packageName: "com.test.app",
      updatedAt: Date.now()
    });

    // Pass fake accessibility service and timer to constructor
    imeAction = new ImeAction(testDevice, fakeAdb, undefined, fakeA11yService, fakeTimer);

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
    it("should execute IME action 'done' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      assert.equal(result.action, "done");
      assert.isDefined(result.observation);

      // Verify accessibility service was called with correct action
      assert.isTrue(fakeA11yService.wasImeActionCalled("done"), "Accessibility service should have been called with 'done' action");
      // Should NOT call ADB when accessibility service succeeds
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isEmpty(executedCommands, "ADB should not be called when accessibility service succeeds");
    });

    it("should execute IME action 'next' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("next");

      assert.isTrue(result.success);
      assert.equal(result.action, "next");

      assert.isTrue(fakeA11yService.wasImeActionCalled("next"));
    });

    it("should execute IME action 'search' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("search");

      assert.isTrue(result.success);
      assert.equal(result.action, "search");

      assert.isTrue(fakeA11yService.wasImeActionCalled("search"));
    });

    it("should execute IME action 'send' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("send");

      assert.isTrue(result.success);
      assert.equal(result.action, "send");

      assert.isTrue(fakeA11yService.wasImeActionCalled("send"));
    });

    it("should execute IME action 'go' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("go");

      assert.isTrue(result.success);
      assert.equal(result.action, "go");

      assert.isTrue(fakeA11yService.wasImeActionCalled("go"));
    });

    it("should execute IME action 'previous' via accessibility service", async () => {
      fakeA11yService.clearHistory();
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());
      fakeAdb.clearHistory();

      const result = await imeAction.execute("previous");

      assert.isTrue(result.success);
      assert.equal(result.action, "previous");

      assert.isTrue(fakeA11yService.wasImeActionCalled("previous"));
    });

    it("should handle empty action string", async () => {
      const result = await imeAction.execute("" as any);

      assert.isFalse(result.success);
      assert.equal(result.action, "");
      assert.equal(result.error, "No IME action provided");

      // Should not call accessibility service or ADB commands
      assert.isEmpty(fakeA11yService.getImeActionHistory(), "Accessibility service should not have been called for empty action");
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isEmpty(executedCommands, "ADB should not be called for empty action");
    });

    it("should work with progress callback", async () => {
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

      assert.isTrue(result.success);
      // Progress callback should be called by BaseVisualChange
      assert.isTrue(callbackCalled);
    });

    it("should fall back to ADB when accessibility service fails", async () => {
      // Accessibility service fails
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      assert.equal(result.action, "done");

      // Verify timer was called with 100ms delay
      assert.isTrue(fakeTimer.wasCalledWithDuration(100), "Timer should have been called with 100ms");

      // Then ADB fallback was used
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isTrue(executedCommands.some(cmd => cmd.includes("shell input keyevent KEYCODE_ENTER")), "ADB should have executed KEYCODE_ENTER command");
    });

    it("should fall back to ADB for multi-key actions when accessibility service fails", async () => {
      // Accessibility service fails
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_SHIFT_LEFT", createExecResult());
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_TAB", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("previous");

      assert.isTrue(result.success);
      assert.equal(result.action, "previous");

      // Verify timer was called with 100ms delay
      assert.isTrue(fakeTimer.wasCalledWithDuration(100), "Timer should have been called with 100ms");

      // Then ADB fallback was used with both key events for Shift+Tab
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isTrue(executedCommands.some(cmd => cmd.includes("shell input keyevent KEYCODE_SHIFT_LEFT")), "ADB should have executed KEYCODE_SHIFT_LEFT command");
      assert.isTrue(executedCommands.some(cmd => cmd.includes("shell input keyevent KEYCODE_TAB")), "ADB should have executed KEYCODE_TAB command");
    });
  });

  describe("constructor", () => {
    it("should work with device object", () => {
      const imeActionInstance = new ImeAction(testDevice);
      assert.isDefined(imeActionInstance);
    });

    it("should work with custom FakeAdbExecutor", () => {
      const customAdb = new FakeAdbExecutor();
      const imeActionInstance = new ImeAction(testDevice, customAdb);
      assert.isDefined(imeActionInstance);
    });
  });

  describe("timing", () => {
    it("should complete quickly via accessibility service", async () => {
      fakeA11yService.setHierarchyData({
        packageName: "com.test.app",
        updatedAt: Date.now()
      });
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      // Accessibility service path should not call timer (no delay)
      assert.equal(fakeTimer.getSleepCallCount(), 0, "Timer should not be called when using accessibility service");
    });

    it("should include delay when falling back to ADB keyevent", async () => {
      // Make accessibility service fail to trigger ADB fallback
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      // Verify that timer.sleep(100) was called in ADB fallback path
      assert.isTrue(fakeTimer.wasCalledWithDuration(100), "Timer should have been called with 100ms delay");
    });
  });

  describe("error handling", () => {
    it("should handle missing view hierarchy gracefully", async () => {
      // Set observe screen to fail
      fakeObserveScreen.setFailureMode("getMostRecentCachedObserveResult", new Error("Cannot perform action without view hierarchy"));
      fakeObserveScreen.setFailureMode("execute", new Error("Cannot perform action without view hierarchy"));

      try {
        await imeAction.execute("done");
        assert.fail("Expected an error to be thrown");
      } catch (caughtError) {
        assert.include((caughtError as Error).message, "Cannot perform action without view hierarchy");
      }
    });

    it("should handle observation failure", async () => {
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
        assert.equal(result.action, "done");
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Failed to observe screen");
      }
    });

    it("should handle null action gracefully", async () => {
      const result = await imeAction.execute(null as any);

      assert.isFalse(result.success);
      assert.equal(result.action, "");
      assert.equal(result.error, "No IME action provided");
    });

    it("should handle undefined action gracefully", async () => {
      const result = await imeAction.execute(undefined as any);

      assert.isFalse(result.success);
      assert.equal(result.action, "");
      assert.equal(result.error, "No IME action provided");
    });
  });

  describe("edge cases", () => {
    it("should handle all valid IME actions via accessibility service", async () => {
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

        assert.isTrue(result.success, `Action '${action}' should succeed`);
        assert.equal(result.action, action);
        assert.isTrue(fakeA11yService.wasImeActionCalled(action), `Accessibility service should have been called with '${action}'`);
      }
    });

    it("should handle rapid consecutive calls", async () => {
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
        assert.isTrue(result.success, `Call ${index} should succeed`);
      });

      // Should have called accessibility service for each action
      assert.equal(fakeA11yService.getImeActionHistory().length, 3);
    });
  });

  describe("key mapping (ADB fallback)", () => {
    // These tests verify the ADB fallback behavior when accessibility service fails

    beforeEach(() => {
      // Make accessibility service fail to trigger ADB fallback
      fakeA11yService.setFailureMode("imeAction", new Error("No focused element"));
    });

    it("should map done to KEYCODE_ENTER in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_ENTER"));
    });

    it("should map next to KEYCODE_TAB in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_TAB", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("next");

      assert.isTrue(result.success);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_TAB"));
    });

    it("should map search to KEYCODE_SEARCH in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_SEARCH", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("search");

      assert.isTrue(result.success);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_SEARCH"));
    });

    it("should map send to KEYCODE_ENTER in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("send");

      assert.isTrue(result.success);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_ENTER"));
    });

    it("should map go to KEYCODE_ENTER in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_ENTER", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("go");

      assert.isTrue(result.success);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_ENTER"));
    });

    it("should map previous to SHIFT+TAB combination in ADB fallback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_SHIFT_LEFT", createExecResult());
      fakeAdb.setCommandResponse("shell input keyevent KEYCODE_TAB", createExecResult());
      fakeObserveScreen.setObserveResult(() => createObserveResult());

      const result = await imeAction.execute("previous");

      assert.isTrue(result.success);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_SHIFT_LEFT"));
      assert.isTrue(fakeAdb.wasCommandExecuted("shell input keyevent KEYCODE_TAB"));
      // At least 2 calls for the key combination, but BaseVisualChange might make additional calls
      assert.isAtLeast(fakeAdb.getExecutedCommands().length, 2);
    });
  });
});
