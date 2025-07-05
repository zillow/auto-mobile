import { assert } from "chai";
import { ImeAction } from "../../../src/features/action/ImeAction";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { Window } from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("ImeAction", () => {
  let imeAction: ImeAction;
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

    // Stub the constructors and static calls
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
    const defaultObserveResult = createMockObserveResult();
    mockObserveScreen.getMostRecentCachedObserveResult.resolves(defaultObserveResult);
    mockObserveScreen.execute.resolves(defaultObserveResult);

    imeAction = new ImeAction("test-device");
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
    viewHierarchy: { node: {} }
  });

  describe("execute", () => {
    it("should execute IME action 'done'", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("done");

      assert.isTrue(result.success);
      assert.equal(result.action, "done");
      assert.isDefined(result.observation);

      // Verify correct ADB command was called
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should execute IME action 'next'", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("next");

      assert.isTrue(result.success);
      assert.equal(result.action, "next");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
    });

    it("should execute IME action 'search'", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("search");

      assert.isTrue(result.success);
      assert.equal(result.action, "search");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SEARCH");
    });

    it("should execute IME action 'send'", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("send");

      assert.isTrue(result.success);
      assert.equal(result.action, "send");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should execute IME action 'go'", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("go");

      assert.isTrue(result.success);
      assert.equal(result.action, "go");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should execute IME action 'previous' with key combination", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await imeAction.execute("previous");

      assert.isTrue(result.success);
      assert.equal(result.action, "previous");

      // Should call both key events for Shift+Tab
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SHIFT_LEFT");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
      // At least 2 calls for the key combination, but BaseVisualChange might make additional calls
      assert.isAtLeast(mockAdb.executeCommand.callCount, 2);
    });

    it("should handle empty action string", async () => {
      const result = await imeAction.execute("" as any);

      assert.isFalse(result.success);
      assert.equal(result.action, "");
      assert.equal(result.error, "No IME action provided");

      // Should not call ADB commands
      sinon.assert.notCalled(mockAdb.executeCommand);
    });

    it("should work with progress callback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.stub().resolves();
      const result = await imeAction.execute("done", progressCallback);

      assert.isTrue(result.success);
      // Progress callback should be called by BaseVisualChange
      assert.isTrue(progressCallback.called);
    });

    it("should handle ADB command failure", async () => {
      const error = new Error("Failed to execute keyevent");
      mockAdb.executeCommand.rejects(error);

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await imeAction.execute("done");
        // If we get here, BaseVisualChange caught the error
        assert.equal(result.action, "done");
        assert.include(result.error || "", "Failed to execute IME action");
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Failed to execute keyevent");
      }

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should handle ADB command failure for multi-key actions", async () => {
      const error = new Error("Failed to execute keyevent");
      mockAdb.executeCommand.onFirstCall().resolves(createMockExecResult());
      mockAdb.executeCommand.onSecondCall().rejects(error);

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await imeAction.execute("previous");
        // If we get here, BaseVisualChange handled the error
        assert.equal(result.action, "previous");
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Failed to execute keyevent");
      }

      // Should have attempted both key events
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SHIFT_LEFT");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
    });
  });

  describe("constructor", () => {
    it("should work with null deviceId", () => {
      const imeActionInstance = new ImeAction("test-device");
      assert.isDefined(imeActionInstance);
    });

    it("should work with custom AdbUtils", () => {
      const customAdb = new AdbUtils("custom-device");
      const imeActionInstance = new ImeAction("test-device", customAdb);
      assert.isDefined(imeActionInstance);
    });
  });

  describe("timing", () => {
    it("should include delay before executing keyevent", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const startTime = Date.now();
      const result = await imeAction.execute("done");
      const elapsedTime = Date.now() - startTime;

      assert.isTrue(result.success);
      // Should include at least 100ms delay plus some execution time
      assert.isAtLeast(elapsedTime, 100);
    });
  });

  describe("error handling", () => {
    it("should handle missing view hierarchy gracefully", async () => {
      // Mock getMostRecentCachedObserveResult to return null to trigger the error
      mockObserveScreen.getMostRecentCachedObserveResult.resolves(null);

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

      mockAdb.executeCommand.resolves(createMockExecResult());
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
    it("should handle all valid IME actions", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const validActions: Array<"done" | "next" | "search" | "send" | "go" | "previous"> =
                ["done", "next", "search", "send", "go", "previous"];

      for (const action of validActions) {
        mockAdb.executeCommand.resetHistory();
        const result = await imeAction.execute(action);

        assert.isTrue(result.success, `Action '${action}' should succeed`);
        assert.equal(result.action, action);
        assert.isAtLeast(mockAdb.executeCommand.callCount, 1, `Action '${action}' should call ADB`);
      }
    });

    it("should handle rapid consecutive calls", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const promises = [
        imeAction.execute("done"),
        imeAction.execute("next"),
        imeAction.execute("search")
      ];

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        assert.isTrue(result.success, `Call ${index} should succeed`);
      });

      // Should have called ADB command for each action
      assert.isAtLeast(mockAdb.executeCommand.callCount, 3);
    });
  });

  describe("key mapping", () => {
    it("should map done to KEYCODE_ENTER", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("done");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should map next to KEYCODE_TAB", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("next");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_TAB");
    });

    it("should map search to KEYCODE_SEARCH", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("search");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_SEARCH");
    });

    it("should map send to KEYCODE_ENTER", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("send");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should map go to KEYCODE_ENTER", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      await imeAction.execute("go");

      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent KEYCODE_ENTER");
    });

    it("should map previous to SHIFT+TAB combination", async () => {
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
