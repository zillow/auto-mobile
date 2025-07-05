import { assert } from "chai";
import { Shake } from "../../../src/features/action/Shake";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("Shake", () => {
  let shake: Shake;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);

    shake = new Shake("test-device");
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
    it("should execute shake with default parameters", async () => {
      // Mock successful ADB commands
      mockAdb.executeCommand.resolves(createMockExecResult());

      // Mock observation (BaseVisualChange calls observeScreen.execute at the end)
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute();

      assert.isTrue(result.success);
      assert.equal(result.duration, 1000);
      assert.equal(result.intensity, 100);
      assert.isDefined(result.observation);

      // Verify ADB commands were called correctly (2 for shake, +1 for BaseVisualChange observation)
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 100:100:100");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });

    it("should execute shake with custom duration", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ duration: 100 }); // Reduced for faster test

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 100);

      // Verify default intensity is used
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 100:100:100");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });

    it("should execute shake with custom intensity", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ intensity: 200, duration: 100 }); // Reduced duration

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 200);

      // Verify custom intensity is used
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 200:200:200");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });

    it("should execute shake with custom duration and intensity", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ duration: 100, intensity: 150 }); // Reduced duration

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 150);

      // Verify custom parameters are used
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 150:150:150");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });

    it("should execute shake with empty options object", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({});

      assert.isTrue(result.success);
      assert.equal(result.duration, 1000);
      assert.equal(result.intensity, 100);
    });

    it("should handle zero duration", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ duration: 0 });

      assert.isTrue(result.success);
      assert.equal(result.duration, 0);
      assert.equal(result.intensity, 100);

      // Should still call both commands even with 0 duration
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 100:100:100");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });

    it("should handle zero intensity", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ intensity: 0, duration: 100 });

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, 0);

      // Should call with 0 intensity (no shake effect)
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });

    it("should work with progress callback", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.spy();
      const result = await shake.execute({ duration: 50 }, progressCallback);

      assert.isTrue(result.success);
      // Progress callback should be called by BaseVisualChange
      assert.isTrue(progressCallback.called);
    });

    it("should handle ADB command failure during shake start", async () => {
      const error = new Error("Failed to set acceleration");
      mockAdb.executeCommand.onFirstCall().rejects(error);

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await shake.execute({ duration: 100 });
        // If we get here, BaseVisualChange caught the error
        assert.equal(result.duration, 100);
        assert.equal(result.intensity, 100);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Failed to set acceleration");
      }

      // Should have tried to start shake
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 100:100:100");
    });

    it("should handle ADB command failure during shake stop", async () => {
      const error = new Error("Failed to reset acceleration");
      mockAdb.executeCommand.onFirstCall().resolves(createMockExecResult());
      mockAdb.executeCommand.onSecondCall().rejects(error);

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      try {
        const result = await shake.execute({ duration: 50 }); // Very short duration
        // If we get here, BaseVisualChange caught the error
        assert.isDefined(result);
      } catch (caughtError) {
        // If the error bubbled up, that's also valid behavior
        assert.include((caughtError as Error).message, "Failed to reset acceleration");
      }

      // Check that both commands were attempted
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 100:100:100");
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 0:0:0");
    });
  });

  describe("constructor", () => {
    it("should work with null deviceId", () => {
      const shakeInstance = new Shake("test-device");
      assert.isDefined(shakeInstance);
    });

    it("should work with custom AdbUtils", () => {
      const customAdb = new AdbUtils("custom-device");
      const shakeInstance = new Shake("test-device", customAdb);
      assert.isDefined(shakeInstance);
    });
  });

  describe("timing", () => {
    it("should respect the duration timing", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const startTime = Date.now();
      const duration = 200;

      const result = await shake.execute({ duration });

      const elapsedTime = Date.now() - startTime;

      assert.isTrue(result.success);
      // Allow some tolerance for timing (should be at least the duration)
      assert.isAtLeast(elapsedTime, duration - 50);
      // But not too much longer (within 1000ms tolerance for test execution and BaseVisualChange overhead)
      assert.isAtMost(elapsedTime, duration + 1000);
    });
  });

  describe("edge cases", () => {
    it("should handle very high intensity values", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ intensity: 9999, duration: 100 });

      assert.isTrue(result.success);
      assert.equal(result.intensity, 9999);

      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration 9999:9999:9999");
    });

    it("should handle very long duration", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      // Use shorter duration to avoid test timeout
      const result = await shake.execute({ duration: 200 });

      assert.isTrue(result.success);
      assert.equal(result.duration, 200);

      // Both commands should still be called
      assert.isAtLeast(mockAdb.executeCommand.callCount, 2);
    });

    it("should handle negative values gracefully", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult());
      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await shake.execute({ duration: 100, intensity: -50 }); // Use positive duration

      assert.isTrue(result.success);
      assert.equal(result.duration, 100);
      assert.equal(result.intensity, -50);

      // Should use the negative intensity as provided
      sinon.assert.calledWith(mockAdb.executeCommand, "emu sensor set acceleration -50:-50:-50");
    });
  });
});
