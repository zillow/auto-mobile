import { assert } from "chai";
import { Rotate } from "../../../src/features/action/Rotate";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("Rotate", () => {
  let rotate: Rotate;
  let mockAdb: sinon.SinonStubbedInstance<AdbUtils>;
  let mockObserveScreen: sinon.SinonStubbedInstance<ObserveScreen>;
  let mockAwaitIdle: sinon.SinonStubbedInstance<AwaitIdle>;

  beforeEach(() => {
    // Create stubs for dependencies
    mockAdb = sinon.createStubInstance(AdbUtils);
    mockObserveScreen = sinon.createStubInstance(ObserveScreen);
    mockAwaitIdle = sinon.createStubInstance(AwaitIdle);

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(AwaitIdle.prototype, "waitForRotation").callsFake(mockAwaitIdle.waitForRotation);
    sinon.stub(AwaitIdle.prototype, "waitForIdleTouchEvents").callsFake(mockAwaitIdle.waitForIdleTouchEvents);
    sinon.stub(AwaitIdle.prototype, "waitForUiStability").callsFake(mockAwaitIdle.waitForUiStability);

    // Set up default mock implementations
    mockAwaitIdle.waitForRotation.resolves();
    mockAwaitIdle.waitForIdleTouchEvents.resolves();
    mockAwaitIdle.waitForUiStability.resolves();

    rotate = new Rotate("test-device");
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

  describe("getCurrentOrientation", () => {
    it("should return portrait for user_rotation 0", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult("0"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings get system user_rotation");
    });

    it("should return landscape for user_rotation 1", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult("1"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "landscape");
    });

    it("should return portrait for user_rotation 2", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult("2"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait");
    });

    it("should return landscape for user_rotation 3", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult("3"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "landscape");
    });

    it("should return portrait as default when ADB command fails", async () => {
      mockAdb.executeCommand.rejects(new Error("ADB command failed"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait");
    });
  });

  describe("isOrientationLocked", () => {
    it("should return true when accelerometer_rotation is 0", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult("0"));

      const isLocked = await rotate.isOrientationLocked();

      assert.isTrue(isLocked);
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings get system accelerometer_rotation");
    });

    it("should return false when accelerometer_rotation is 1", async () => {
      mockAdb.executeCommand.resolves(createMockExecResult("1"));

      const isLocked = await rotate.isOrientationLocked();

      assert.isFalse(isLocked);
    });

    it("should return false as default when ADB command fails", async () => {
      mockAdb.executeCommand.rejects(new Error("ADB command failed"));

      const isLocked = await rotate.isOrientationLocked();

      assert.isFalse(isLocked);
    });
  });

  describe("execute", () => {
    it("should reject invalid orientation", async () => {
      const result = await rotate.execute("invalid" as any);

      assert.isFalse(result.success);
      assert.equal(result.orientation, "invalid");
      assert.equal(result.value, -1);
      assert.include(result.error || "", 'must be "portrait" or "landscape"');
    });

    it("should skip rotation when already in desired orientation", async () => {
      // Mock getting current orientation as portrait
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation").resolves(createMockExecResult("0"));

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await rotate.execute("portrait");

      assert.isTrue(result.success);
      assert.equal(result.orientation, "portrait");
      assert.isFalse(result.rotationPerformed);
      assert.include(result.message || "", "already in portrait orientation");
      assert.isDefined(result.observation);

      // Should only call to get current orientation, not to set it
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings get system user_rotation");
      sinon.assert.neverCalledWith(mockAdb.executeCommand, "shell settings put system user_rotation 0");
    });

    it("should work with progress callback", async () => {
      // Mock different orientations
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation")
        .onFirstCall().resolves(createMockExecResult("0"))
        .onSecondCall().resolves(createMockExecResult("1")); // After rotation
      mockAdb.executeCommand.withArgs("shell settings get system accelerometer_rotation").resolves(createMockExecResult("1"));
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 1").resolves(createMockExecResult());
      mockAdb.executeCommand.withArgs("shell settings put system user_rotation 1").resolves(createMockExecResult());

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const progressCallback = sinon.spy();
      const result = await rotate.execute("landscape", progressCallback);

      assert.isTrue(result.success);
      assert.isTrue(progressCallback.called);

      // Check that progress was called with expected stages
      const progressCalls = progressCallback.getCalls();
      assert.isTrue(progressCalls.some(call => call.args[2]?.includes("Checking current device orientation")));
      assert.isTrue(progressCalls.some(call => call.args[2]?.includes("Rotating from portrait to landscape")));
    });

    it("should perform rotation when orientation differs", async () => {
      // Mock getting current orientation as portrait initially
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation")
        .onFirstCall().resolves(createMockExecResult("0"))
        .onSecondCall().resolves(createMockExecResult("1")); // After rotation, return landscape
      // Mock getting orientation lock status as unlocked
      mockAdb.executeCommand.withArgs("shell settings get system accelerometer_rotation").resolves(createMockExecResult("1"));
      // Mock successful rotation commands
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 0").resolves(createMockExecResult());
      mockAdb.executeCommand.withArgs("shell settings put system user_rotation 1").resolves(createMockExecResult());

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await rotate.execute("landscape");

      assert.isTrue(result.success);
      assert.equal(result.orientation, "landscape");
      assert.equal(result.currentOrientation, "portrait");
      assert.equal(result.previousOrientation, "portrait");
      assert.isTrue(result.rotationPerformed);
      assert.include(result.message || "", "Successfully rotated from portrait to landscape");

      // Verify rotation commands were called
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings put system accelerometer_rotation 0");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings put system user_rotation 1");
    });

    it("should handle locked orientation by temporarily unlocking", async () => {
      // Mock getting current orientation as landscape initially
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation")
        .onFirstCall().resolves(createMockExecResult("1"))
        .onSecondCall().resolves(createMockExecResult("0")); // After rotation, return portrait
      // Mock getting orientation lock status as locked
      mockAdb.executeCommand.withArgs("shell settings get system accelerometer_rotation").resolves(createMockExecResult("0"));
      // Mock successful unlock
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 1").resolves(createMockExecResult());
      // Mock successful rotation
      mockAdb.executeCommand.withArgs("shell settings put system user_rotation 0").resolves(createMockExecResult());
      // Mock successful restore lock
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 0").resolves(createMockExecResult());

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      const result = await rotate.execute("portrait");

      assert.isTrue(result.success);
      assert.equal(result.orientation, "portrait");
      assert.isTrue(result.rotationPerformed);
      assert.isTrue(result.orientationLockHandled);

      // Verify unlock, rotation, and re-lock commands were called
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings put system accelerometer_rotation 1");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings put system user_rotation 0");
      sinon.assert.calledWith(mockAdb.executeCommand, "shell settings put system accelerometer_rotation 0");
    });

    it("should restore orientation lock after error", async () => {
      // Mock getting current orientation as landscape
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation").resolves(createMockExecResult("1"));
      // Mock getting orientation lock status as locked
      mockAdb.executeCommand.withArgs("shell settings get system accelerometer_rotation").resolves(createMockExecResult("0"));
      // Mock successful unlock
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 1").resolves(createMockExecResult());
      // Mock failure during rotation
      mockAdb.executeCommand.withArgs("shell settings put system user_rotation 0").rejects(new Error("Failed to set rotation"));
      // Mock successful restore lock
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 0").resolves(createMockExecResult());

      const mockObservation = createMockObserveResult();
      mockObserveScreen.execute.resolves(mockObservation);

      // The implementation should attempt the rotation and handle errors gracefully
      const result = await rotate.execute("portrait");

      // Verify that unlock and restore lock commands were called even if rotation failed
      const unlockCalls = mockAdb.executeCommand.getCalls().filter(call =>
        call.args[0] === "shell settings put system accelerometer_rotation 1"
      );
      const restoreLockCalls = mockAdb.executeCommand.getCalls().filter(call =>
        call.args[0] === "shell settings put system accelerometer_rotation 0"
      );

      assert.isAtLeast(unlockCalls.length, 1);
      assert.isAtLeast(restoreLockCalls.length, 1);
    });
  });

  describe("constructor", () => {
    it("should work with null deviceId", () => {
      const rotateInstance = new Rotate(null);
      assert.isDefined(rotateInstance);
    });

    it("should work with custom AdbUtils", () => {
      const customAdb = new AdbUtils("custom-device");
      const rotateInstance = new Rotate("test-device", customAdb);
      assert.isDefined(rotateInstance);
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace in ADB output", async () => {
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation").resolves(createMockExecResult("  1  \n"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "landscape");
    });

    it("should handle non-numeric ADB output", async () => {
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation").resolves(createMockExecResult("not-a-number"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait"); // Should default to portrait
    });

    it("should handle empty ADB output", async () => {
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation").resolves(createMockExecResult(""));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait"); // Should default to portrait
    });
  });
});
