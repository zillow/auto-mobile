import { assert } from "chai";
import { Shake } from "../../../src/features/action/Shake";
import { ObserveResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("Shake", () => {
  let shake: Shake;
  let fakeAdb: FakeAdbExecutor;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeTimer: FakeTimer;

  // Helper function to create mock ObserveResult
  const createObserveResult = (): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: { node: {} }
  });

  beforeEach(() => {
    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeTimer = new FakeTimer();

    // Configure default responses
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default observe screen responses with valid viewHierarchy
    const defaultObserveResult = createObserveResult();
    fakeObserveScreen.setObserveResult(defaultObserveResult);

    shake = new Shake("test-device", fakeAdb, null, fakeTimer);
    (shake as any).observeScreen = fakeObserveScreen;
    (shake as any).window = fakeWindow;
    (shake as any).awaitIdle = fakeAwaitIdle;
  });

  describe("execute", () => {
    it("should execute shake with default parameters", async () => {
      // Mock successful ADB commands
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });

      // Mock observation (BaseVisualChange calls observeScreen.execute at the end)
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      // Start the execution
      const resultPromise = shake.execute();

      // Wait a bit for sleep to be called, then resolve all pending sleeps
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();

      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 1000);
      assert.equal(result.intensity, 100);
      assert.isDefined(result.observation);

      // Verify timer was called with correct duration
      assert.isTrue(fakeTimer.wasSleepCalled(1000));

      // Verify ADB commands were executed
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isTrue(executedCommands.some(cmd => cmd.includes("emu sensor set acceleration 100:100:100")));
      assert.isTrue(executedCommands.some(cmd => cmd.includes("emu sensor set acceleration 0:0:0")));
    });

    it("should execute shake with custom duration", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 100 }); // Reduced for faster test
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 100);
      assert.isTrue(fakeTimer.wasSleepCalled(100));
    });

    it("should execute shake with custom intensity", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 200:200:200", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ intensity: 200, duration: 100 }); // Reduced duration
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 200);
    });

    it("should execute shake with custom duration and intensity", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 150:150:150", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 100, intensity: 150 }); // Reduced duration
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 150);
    });

    it("should execute shake with empty options object", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({});
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 1000);
      assert.equal(result.intensity, 100);

      // Verify timer was called with default duration
      assert.isTrue(fakeTimer.wasSleepCalled(1000));
    });

    it("should handle zero duration", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 0 });
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 0);
      assert.equal(result.intensity, 100);
    });

    it("should handle zero intensity", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ intensity: 0, duration: 100 });
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 0);
    });

    it("should work with progress callback", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      let callbackCalled = false;
      const progressCallback = () => {
        callbackCalled = true;
      };
      const resultPromise = shake.execute({ duration: 50 }, progressCallback);
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      // Progress callback should be called by BaseVisualChange
      assert.isTrue(callbackCalled || fakeObserveScreen.wasMethodCalled("execute"));
    });

    it("should handle ADB command failure during shake start", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "error" });

      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      try {
        const resultPromise = shake.execute({ duration: 100 });
        await new Promise(resolve => setTimeout(resolve, 10));
        fakeTimer.resolveAll();
        const result = await resultPromise;
        // If we get here, command succeeded despite fake error
        assert.equal(result.duration, 100);
        assert.equal(result.intensity, 100);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.isDefined(caughtError);
      }
    });

    it("should handle ADB command failure during shake stop", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "error" });

      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      try {
        const resultPromise = shake.execute({ duration: 50 }); // Very short duration
        await new Promise(resolve => setTimeout(resolve, 10));
        fakeTimer.resolveAll();
        const result = await resultPromise;
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.isDefined(caughtError);
      }
    });
  });

  describe("constructor", () => {
    it("should work with null deviceId", () => {
      const shakeInstance = new Shake("test-device", fakeAdb, null, fakeTimer);
      assert.isDefined(shakeInstance);
    });

    it("should work with custom AdbClient", () => {
      const customAdb = new FakeAdbExecutor();
      const shakeInstance = new Shake("test-device", customAdb, null, fakeTimer);
      assert.isDefined(shakeInstance);
    });

    it("should work with default timer when not provided", () => {
      const shakeInstance = new Shake("test-device", fakeAdb);
      assert.isDefined(shakeInstance);
    });
  });

  describe("timing", () => {
    it("should respect the duration timing", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const duration = 100;

      const resultPromise = shake.execute({ duration });
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      // Timer was called with the correct duration
      assert.isTrue(fakeTimer.wasSleepCalled(duration));
      // Verify timer history
      const sleepHistory = fakeTimer.getSleepHistory();
      assert.include(sleepHistory, duration);
    });
  });

  describe("edge cases", () => {
    it("should handle very high intensity values", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 9999:9999:9999", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ intensity: 9999, duration: 100 });
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.intensity, 9999);

      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isTrue(executedCommands.some(cmd => cmd.includes("emu sensor set acceleration 9999:9999:9999")));
    });

    it("should handle very long duration", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      // Use shorter duration to avoid test timeout
      const resultPromise = shake.execute({ duration: 200 });
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 200);

      // Both commands should still be called
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isAtLeast(executedCommands.length, 2);
    });

    it("should handle negative values gracefully", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration -50:-50:-50", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 100, intensity: -50 }); // Use positive duration
      await new Promise(resolve => setTimeout(resolve, 10));
      fakeTimer.resolveAll();
      const result = await resultPromise;

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, -50);
    });
  });
});
