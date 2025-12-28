import { assert } from "chai";
import { HomeScreen } from "../../../src/features/action/HomeScreen";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { Window } from "../../../src/features/observe/Window";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ExecResult, ObserveResult } from "../../../src/models";
import sinon from "sinon";

// Helper function to create mock ExecResult
const createMockExecResult = (stdout: string = ""): ExecResult => ({
  stdout,
  stderr: "",
  toString: () => stdout,
  trim: () => stdout.trim(),
  includes: (searchString: string) => stdout.includes(searchString)
});

// Helper function to create mock ObserveResult
// Each call creates a unique viewHierarchy object so change detection works
let hierarchyCounter = 0;
const createMockObserveResult = (): ObserveResult => ({
  timestamp: Date.now(),
  screenSize: { width: 1080, height: 1920 },
  systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
  viewHierarchy: { node: {}, id: hierarchyCounter++ }
});

describe("HomeScreen", () => {
  let homeScreen: HomeScreen;
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

    // Set up default mock responses
    mockWindow.getCachedActiveWindow.resolves(null);
    mockWindow.getActive.resolves({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
    mockAwaitIdle.initializeUiStabilityTracking.resolves();
    mockAwaitIdle.waitForUiStability.resolves();
    mockAwaitIdle.waitForUiStabilityWithState.resolves();

    // Set up default observe screen responses with valid viewHierarchy
    // Use callsFake to generate new objects each call so change detection works
    mockObserveScreen.getMostRecentCachedObserveResult.callsFake(() => Promise.resolve(createMockObserveResult()));
    mockObserveScreen.execute.callsFake(() => Promise.resolve(createMockObserveResult()));

    homeScreen = new HomeScreen("test-device");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("execute", () => {
    it("should execute hardware navigation using keyevent 3", async () => {
      mockAdb.executeCommand
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
      assert.isDefined(result.observation);

      // Verify hardware home button keyevent was executed
      sinon.assert.calledWith(mockAdb.executeCommand, "shell input keyevent 3");
    });

    it("should work with progress callback", async () => {
      mockAdb.executeCommand
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const progressCallback = sinon.spy();
      const result = await homeScreen.execute(progressCallback);

      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should include observation in result", async () => {
      mockAdb.executeCommand
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const result = await homeScreen.execute();

      assert.isTrue(result.success);
      assert.isDefined(result.observation);
      assert.isDefined(result.observation?.screenSize);
    });
  });

  describe("error handling", () => {
    it("should propagate errors when hardware navigation fails", async () => {
      mockAdb.executeCommand
        .withArgs("shell input keyevent 3").rejects(new Error("Hardware failed"));

      try {
        await homeScreen.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.include((error as Error).message, "Hardware failed");
      }
    });
  });

  describe("multiple devices", () => {
    it("should work with different device IDs", async () => {
      const homeScreen2 = new HomeScreen("device-2");

      mockAdb.executeCommand
        .withArgs("shell input keyevent 3").resolves(createMockExecResult(""));

      const result1 = await homeScreen.execute();
      const result2 = await homeScreen2.execute();

      assert.isTrue(result1.success);
      assert.isTrue(result2.success);
      assert.equal(result1.navigationMethod, "hardware");
      assert.equal(result2.navigationMethod, "hardware");
    });
  });
});
