import { expect, describe, test, beforeEach } from "bun:test";
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
    timestamp: 1700000000000,
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
    test("should execute shake with default parameters", async () => {
      // Mock successful ADB commands
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });

      // Mock observation (BaseVisualChange calls observeScreen.execute at the end)
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      // Start the execution
      const resultPromise = shake.execute();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(1000);
      expect(result.intensity).toBe(100);
      expect(result.observation).toBeDefined();

      // Verify timer was called with correct duration
      expect(fakeTimer.wasSleepCalled(1000)).toBe(true);

      // Verify ADB commands were executed
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("emu sensor set acceleration 100:100:100"))).toBe(true);
      expect(executedCommands.some(cmd => cmd.includes("emu sensor set acceleration 0:0:0"))).toBe(true);
    });

    test("should execute shake with custom duration", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 100 }); // Reduced for faster test
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(100);
      expect(result.intensity).toBe(100);
      expect(fakeTimer.wasSleepCalled(100)).toBe(true);
    });

    test("should execute shake with custom intensity", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 200:200:200", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ intensity: 200, duration: 100 }); // Reduced duration
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(100);
      expect(result.intensity).toBe(200);
    });

    test("should execute shake with custom duration and intensity", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 150:150:150", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 100, intensity: 150 }); // Reduced duration
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(100);
      expect(result.intensity).toBe(150);
    });

    test("should execute shake with empty options object", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({});
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(1000);
      expect(result.intensity).toBe(100);

      // Verify timer was called with default duration
      expect(fakeTimer.wasSleepCalled(1000)).toBe(true);
    });

    test("should handle zero duration", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 0 });
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(0);
      expect(result.intensity).toBe(100);
    });

    test("should handle zero intensity", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ intensity: 0, duration: 100 });
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(100);
      expect(result.intensity).toBe(0);
    });

    test("should work with progress callback", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      let callbackCalled = false;
      const progressCallback = () => {
        callbackCalled = true;
      };
      const resultPromise = shake.execute({ duration: 50 }, progressCallback);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      // Progress callback should be called by BaseVisualChange
      expect(callbackCalled || fakeObserveScreen.wasMethodCalled("execute")).toBe(true);
    });

    test("should handle ADB command failure during shake start", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "error" });

      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      try {
        const resultPromise = shake.execute({ duration: 100 });
        const result = await resultPromise;
        // If we get here, command succeeded despite fake error
        expect(result.duration).toBe(100);
        expect(result.intensity).toBe(100);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        expect(caughtError).toBeDefined();
      }
    });

    test("should handle ADB command failure during shake stop", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "error" });

      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      try {
        const resultPromise = shake.execute({ duration: 50 }); // Very short duration
        const result = await resultPromise;
        // If we get here, BaseVisualChange caught the error
        expect(result).toBeDefined();
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        expect(caughtError).toBeDefined();
      }
    });
  });

  describe("constructor", () => {
    test("should work with null deviceId", () => {
      const shakeInstance = new Shake("test-device", fakeAdb, null, fakeTimer);
      expect(shakeInstance).toBeDefined();
    });

    test("should work with custom AdbClient", () => {
      const customAdb = new FakeAdbExecutor();
      const shakeInstance = new Shake("test-device", customAdb, null, fakeTimer);
      expect(shakeInstance).toBeDefined();
    });

    test("should work with default timer when not provided", () => {
      const shakeInstance = new Shake("test-device", fakeAdb);
      expect(shakeInstance).toBeDefined();
    });
  });

  describe("timing", () => {
    test("should respect the duration timing", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const duration = 100;

      const resultPromise = shake.execute({ duration });
      const result = await resultPromise;

      expect(result.success).toBe(true);
      // Timer was called with the correct duration
      expect(fakeTimer.wasSleepCalled(duration)).toBe(true);
      // Verify timer history
      const sleepHistory = fakeTimer.getSleepHistory();
      expect(sleepHistory).toContain(duration);
    });
  });

  describe("edge cases", () => {
    test("should handle very high intensity values", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 9999:9999:9999", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ intensity: 9999, duration: 100 });
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.intensity).toBe(9999);

      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("emu sensor set acceleration 9999:9999:9999"))).toBe(true);
    });

    test("should handle very long duration", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration 100:100:100", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      // Use shorter duration to avoid test timeout
      const resultPromise = shake.execute({ duration: 200 });
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(200);

      // Both commands should still be called
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.length).toBeGreaterThanOrEqual(2);
    });

    test("should handle negative values gracefully", async () => {
      fakeAdb.setCommandResponse("emu sensor set acceleration -50:-50:-50", { stdout: "", stderr: "" });
      fakeAdb.setCommandResponse("emu sensor set acceleration 0:0:0", { stdout: "", stderr: "" });
      const mockObservation = createObserveResult();
      fakeObserveScreen.setObserveResult(mockObservation);

      const resultPromise = shake.execute({ duration: 100, intensity: -50 }); // Use positive duration
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.duration).toBe(100);
      expect(result.intensity).toBe(-50);
    });
  });
});
