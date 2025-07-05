import { assert } from "chai";
import { Rotate } from "../../../src/features/action/Rotate";
import { AdbUtils } from "../../../src/utils/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import {Window} from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

describe("Rotate", () => {
  let rotate: Rotate;
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

    // Stub the constructors
    sinon.stub(AdbUtils.prototype, "executeCommand").callsFake(mockAdb.executeCommand);
    sinon.stub(ObserveScreen.prototype, "execute").callsFake(mockObserveScreen.execute);
    sinon.stub(ObserveScreen.prototype, "getMostRecentCachedObserveResult").callsFake(mockObserveScreen.getMostRecentCachedObserveResult);
    sinon.stub(Window.prototype, "getCachedActiveWindow").callsFake(mockWindow.getCachedActiveWindow);
    sinon.stub(Window.prototype, "getActive").callsFake(mockWindow.getActive);
    sinon.stub(AwaitIdle.prototype, "initializeUiStabilityTracking").callsFake(mockAwaitIdle.initializeUiStabilityTracking);
    sinon.stub(AwaitIdle.prototype, "waitForUiStability").callsFake(mockAwaitIdle.waitForUiStability);
    sinon.stub(AwaitIdle.prototype, "waitForUiStabilityWithState").callsFake(mockAwaitIdle.waitForUiStabilityWithState);
    sinon.stub(AwaitIdle.prototype, "waitForRotation").callsFake(mockAwaitIdle.waitForRotation);

    // Set up default mock responses
    mockWindow.getCachedActiveWindow.resolves(null);
    mockWindow.getActive.resolves({appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123});
    mockAwaitIdle.initializeUiStabilityTracking.resolves();
    mockAwaitIdle.waitForUiStability.resolves();
    mockAwaitIdle.waitForUiStabilityWithState.resolves();
    mockAwaitIdle.waitForRotation.resolves();

    // Set up default observe screen responses with valid viewHierarchy
    const defaultObserveResult = createMockObserveResult();
    mockObserveScreen.getMostRecentCachedObserveResult.resolves(defaultObserveResult);
    mockObserveScreen.execute.resolves(defaultObserveResult);

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

    it("should perform rotation when orientation differs", async () => {
      // Mock getting current orientation as portrait initially
      mockAdb.executeCommand.withArgs("shell settings get system user_rotation")
        .onFirstCall().resolves(createMockExecResult("0"))
        .onSecondCall().resolves(createMockExecResult("1")); // After rotation, return landscape
      // Mock getting orientation lock status as unlocked
      mockAdb.executeCommand.withArgs("shell settings get system accelerometer_rotation").resolves(createMockExecResult("1"));
      // Mock successful unlock
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 0").resolves(createMockExecResult());
      // Mock successful rotation
      mockAdb.executeCommand.withArgs("shell settings put system user_rotation 1").resolves(createMockExecResult());
      // Mock successful restore lock
      mockAdb.executeCommand.withArgs("shell settings put system accelerometer_rotation 1").resolves(createMockExecResult());

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

      // The implementation should attempt the rotation and handle errors gracefully
      await rotate.execute("portrait");

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
    it("should work with non-null deviceId", () => {
      const rotateInstance = new Rotate("test-device");
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
