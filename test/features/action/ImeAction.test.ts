import { assert } from "chai";
import { ImeAction } from "../../../src/features/action/ImeAction";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { Window } from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { ExecResult, ObserveResult, BootedDevice } from "../../../src/models";
import sinon from "sinon";

describe("ImeAction", () => {
  let imeAction: ImeAction;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockWindow: sinon.SinonStubbedInstance<Window>;
  let mockAwaitIdle: sinon.SinonStubbedInstance<AwaitIdle>;
  let mockA11yClient: sinon.SinonStubbedInstance<AccessibilityServiceClient>;

  // Test device for Android platform
  const testDevice: BootedDevice = {
    deviceId: "test-device",
    platform: "android",
    name: "Test Device"
  };

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);
    mockWindow = sinon.createStubInstance(Window);
    mockAwaitIdle = sinon.createStubInstance(AwaitIdle);
    mockA11yClient = sinon.createStubInstance(AccessibilityServiceClient);

    // Stub the constructors and static calls
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(ObserveScreen.prototype, "getMostRecentCachedObserveResult").callsFake(mockObserveScreen.getMostRecentCachedObserveResult);
    sinon.stub(Window.prototype, "getCachedActiveWindow").callsFake(mockWindow.getCachedActiveWindow);
    sinon.stub(Window.prototype, "getActive").callsFake(mockWindow.getActive);
    sinon.stub(AwaitIdle.prototype, "initializeUiStabilityTracking").callsFake(mockAwaitIdle.initializeUiStabilityTracking);
    sinon.stub(AwaitIdle.prototype, "waitForUiStability").callsFake(mockAwaitIdle.waitForUiStability);
    sinon.stub(AwaitIdle.prototype, "waitForUiStabilityWithState").callsFake(mockAwaitIdle.waitForUiStabilityWithState);

    // Stub AccessibilityServiceClient.getInstance to return our mock
    getInstanceStub = sinon.stub(AccessibilityServiceClient, "getInstance").returns(mockA11yClient as unknown as AccessibilityServiceClient);

    // Set up default mock responses
    mockWindow.getCachedActiveWindow.resolves(null);
    mockWindow.getActive.resolves({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    mockAwaitIdle.initializeUiStabilityTracking.resolves();
    mockAwaitIdle.waitForUiStability.resolves();
    mockAwaitIdle.waitForUiStabilityWithState.resolves();

    // Set up default observe screen responses with valid viewHierarchy
    const defaultObserveResult = createMockObserveResult();
    mockObserveScreen.getMostRecentCachedObserveResult.resolves(defaultObserveResult);
    mockObserveScreen.execute.resolves(defaultObserveResult);

    // Set up default AccessibilityServiceClient response (success)
    mockA11yClient.requestImeAction.resolves({
      success: true,
      action: "done",
      totalTimeMs: 50
    });

    imeAction = new ImeAction(testDevice);
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
  const createMockObserveResult = (): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: { hierarchy: { node: { $: {} } } }
  });

  describe("execute", () => {
    it("should execute IME action 'done' via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "done",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      assert.equal(result.action, "done");
      assert.isDefined(result.observation);

      // Verify accessibility service was called with correct action
      sinon.assert.calledWith(mockA11yClient.requestImeAction, "done");
      // Should NOT call ADB when accessibility service succeeds
      sinon.assert.notCalled(mockAdb.executeCommand);
    });

    it("should execute IME action 'next' via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "next",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("next");

      assert.isTrue(result.success);
      assert.equal(result.action, "next");

      sinon.assert.calledWith(mockA11yClient.requestImeAction, "next");
    });

    it("should execute IME action 'search' via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "search",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("search");

      assert.isTrue(result.success);
      assert.equal(result.action, "search");

      sinon.assert.calledWith(mockA11yClient.requestImeAction, "search");
    });

    it("should execute IME action 'send' via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "send",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("send");

      assert.isTrue(result.success);
      assert.equal(result.action, "send");

      sinon.assert.calledWith(mockA11yClient.requestImeAction, "send");
    });

    it("should execute IME action 'go' via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "go",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("go");

      assert.isTrue(result.success);
      assert.equal(result.action, "go");

      sinon.assert.calledWith(mockA11yClient.requestImeAction, "go");
    });

    it("should execute IME action 'previous' via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "previous",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("previous");

      assert.isTrue(result.success);
      assert.equal(result.action, "previous");

      sinon.assert.calledWith(mockA11yClient.requestImeAction, "previous");
    });

    it("should handle empty action string", async () => {
      const result = await imeAction.execute("" as any);

      assert.isFalse(result.success);
      assert.equal(result.action, "");
      assert.equal(result.error, "No IME action provided");

      // Should not call accessibility service or ADB commands
      sinon.assert.notCalled(mockA11yClient.requestImeAction);
      sinon.assert.notCalled(mockAdb.executeCommand);
    });

    it("should work with progress callback", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "done",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.stub().resolves();
      const result = await imeAction.execute("done", progressCallback);

      assert.isTrue(result.success);
      // Progress callback should be called by BaseVisualChange
      assert.isTrue(progressCallback.called);
    });

    it("should fall back to ADB when accessibility service fails", async () => {
      // First call to accessibility service fails
      mockA11yClient.requestImeAction.resolves({
        success: false,
        action: "done",
        totalTimeMs: 50,
        error: "No focused element"
      });
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      assert.equal(result.action, "done");

      // Verify accessibility service was tried first
      sinon.assert.calledWith(mockA11yClient.requestImeAction, "done");
      // Then ADB fallback was used
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should fall back to ADB for multi-key actions when accessibility service fails", async () => {
      // Accessibility service fails
      mockA11yClient.requestImeAction.resolves({
        success: false,
        action: "previous",
        totalTimeMs: 50,
        error: "No focused element"
      });
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("previous");

      assert.isTrue(result.success);
      assert.equal(result.action, "previous");

      // Verify accessibility service was tried first
      sinon.assert.calledWith(mockA11yClient.requestImeAction, "previous");
      // Then ADB fallback was used with both key events for Shift+Tab
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SHIFT_LEFT");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
    });
  });

  describe("constructor", () => {
    it("should work with device object", () => {
      const imeActionInstance = new ImeAction(testDevice);
      assert.isDefined(imeActionInstance);
    });

    it("should work with custom AdbUtils", () => {
      const customAdb = new AdbUtils(testDevice);
      const imeActionInstance = new ImeAction(testDevice, customAdb);
      assert.isDefined(imeActionInstance);
    });
  });

  describe("timing", () => {
    it("should complete quickly via accessibility service", async () => {
      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "done",
        totalTimeMs: 50
      });
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const startTime = Date.now();
      const result = await imeAction.execute("done");
      const elapsedTime = Date.now() - startTime;

      assert.isTrue(result.success);
      // Accessibility service path should be fast (no 100ms delay)
      // Allow some margin for test execution
      assert.isBelow(elapsedTime, 500);
    });

    it("should include delay when falling back to ADB keyevent", async () => {
      // Make accessibility service fail to trigger ADB fallback
      mockA11yClient.requestImeAction.resolves({
        success: false,
        action: "done",
        totalTimeMs: 50,
        error: "No focused element"
      });
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const startTime = Date.now();
      const result = await imeAction.execute("done");
      const elapsedTime = Date.now() - startTime;

      assert.isTrue(result.success);
      // ADB fallback includes 100ms delay plus some execution time
      assert.isAtLeast(elapsedTime, 100);
    });
  });

  describe("error handling", () => {
    it("should handle missing view hierarchy gracefully", async () => {
      // Mock getMostRecentCachedObserveResult to reject with error
      mockObserveScreen.getMostRecentCachedObserveResult.rejects(new Error("Cannot perform action without view hierarchy"));
      // Also mock execute to fail since BaseVisualChange falls back to execute()
      mockObserveScreen.execute.rejects(new Error("Cannot perform action without view hierarchy"));

      try {
        await imeAction.execute("done");
        assert.fail("Expected an error to be thrown");
      } catch (caughtError) {
        assert.include((caughtError as Error).message, "Cannot perform action without view hierarchy");
      }
    });

    it("should handle observation failure", async () => {
      // Set up valid cached result but make execute fail
      const mockCachedObservation = createMockObserveResult();
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(mockCachedObservation);

      mockA11yClient.requestImeAction.resolves({
        success: true,
        action: "done",
        totalTimeMs: 50
      });
      const observationError = new Error("Failed to observe screen");
      mockObserveScreen.execute.rejects(observationError);

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
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const validActions: Array<"done" | "next" | "search" | "send" | "go" | "previous"> =
                ["done", "next", "search", "send", "go", "previous"];

      for (const action of validActions) {
        mockA11yClient.requestImeAction.resetHistory();
        mockA11yClient.requestImeAction.resolves({
          success: true,
          action,
          totalTimeMs: 50
        });
        const result = await imeAction.execute(action);

        assert.isTrue(result.success, `Action '${action}' should succeed`);
        assert.equal(result.action, action);
        sinon.assert.calledWith(mockA11yClient.requestImeAction, action);
      }
    });

    it("should handle rapid consecutive calls", async () => {
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      // Set up mock to return success for each action
      mockA11yClient.requestImeAction.callsFake(async (action: string) => ({
        success: true,
        action,
        totalTimeMs: 50
      }));

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
      assert.equal(mockA11yClient.requestImeAction.callCount, 3);
    });
  });

  describe("key mapping (ADB fallback)", () => {
    // These tests verify the ADB fallback behavior when accessibility service fails
    beforeEach(() => {
      // Make accessibility service fail to trigger ADB fallback
      mockA11yClient.requestImeAction.resolves({
        success: false,
        action: "",
        totalTimeMs: 50,
        error: "No focused element"
      });
    });

    it("should map done to KEYCODE_ENTER in ADB fallback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("done");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should map next to KEYCODE_TAB in ADB fallback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("next");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
    });

    it("should map search to KEYCODE_SEARCH in ADB fallback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("search");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SEARCH");
    });

    it("should map send to KEYCODE_ENTER in ADB fallback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("send");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should map go to KEYCODE_ENTER in ADB fallback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("go");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should map previous to SHIFT+TAB combination in ADB fallback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("previous");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SHIFT_LEFT");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
      // At least 2 calls for the key combination, but BaseVisualChange might make additional calls
      assert.isAtLeast(mockAdb.executeCommand.callCount, 2);
    });
  });
});
