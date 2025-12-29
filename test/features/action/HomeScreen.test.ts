import { assert } from "chai";
import { HomeScreen } from "../../../src/features/action/HomeScreen";
import { ObserveResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";


// Helper function to create mock ObserveResult
// Each call creates a unique viewHierarchy object so change detection works
let hierarchyCounter = 0;
const createObserveResult = (): ObserveResult => ({
  timestamp: Date.now(),
  screenSize: { width: 1080, height: 1920 },
  systemInsets: { top: 48, bottom: 120, left: 0, right: 0 },
  viewHierarchy: { node: {}, id: hierarchyCounter++ }
});

describe("HomeScreen", () => {
  let homeScreen: HomeScreen;
  let fakeAdb: FakeAdbExecutor;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeAwaitIdle: FakeAwaitIdle;

  beforeEach(() => {
    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeAwaitIdle = new FakeAwaitIdle();

    // Set up default fake responses
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default observe screen responses with valid viewHierarchy
    // We need to set different results to simulate screen change
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    homeScreen = new HomeScreen("test-device", fakeAdb);

    // Replace the internal managers with our fakes
    (homeScreen as any).observeScreen = fakeObserveScreen;
    (homeScreen as any).window = fakeWindow;
    (homeScreen as any).awaitIdle = fakeAwaitIdle;
  });

  describe("execute", () => {
    it("should execute hardware navigation using keyevent 3", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const result = await homeScreen.execute();
      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
      assert.isDefined(result.observation);

      // Verify hardware home button keyevent was executed
      const executedCommands = fakeAdb.getExecutedCommands();
      assert.isTrue(executedCommands.some(cmd => cmd.includes("shell input keyevent 3")));
    });

    it("should work with progress callback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const progressCallback = async () => {
        // callback for progress tracking
      };
      const result = await homeScreen.execute(progressCallback);

      assert.isTrue(result.success);
      assert.equal(result.navigationMethod, "hardware");
    });

    it("should include observation in result", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const result = await homeScreen.execute();

      assert.isTrue(result.success);
      assert.isDefined(result.observation);
      assert.isDefined(result.observation?.screenSize);
    });
  });

  describe("error handling", () => {
    it("should propagate errors when hardware navigation fails", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "Hardware failed" });

      try {
        await homeScreen.execute();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.isDefined(error);
      }
    });
  });

  describe("multiple devices", () => {
    it("should work with different device IDs", async () => {
      const homeScreen2 = new HomeScreen("device-2", fakeAdb);

      // Set up fakes for the second HomeScreen instance
      const fakeWindow2 = new FakeWindow();
      const fakeObserveScreen2 = new FakeObserveScreen();
      const fakeAwaitIdle2 = new FakeAwaitIdle();

      fakeWindow2.setCachedActiveWindow(null);
      fakeWindow2.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
      fakeObserveScreen2.setObserveResult(() => createObserveResult());

      (homeScreen2 as any).observeScreen = fakeObserveScreen2;
      (homeScreen2 as any).window = fakeWindow2;
      (homeScreen2 as any).awaitIdle = fakeAwaitIdle2;

      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const result1 = await homeScreen.execute();
      const result2 = await homeScreen2.execute();

      assert.isTrue(result1.success);
      assert.isTrue(result2.success);
      assert.equal(result1.navigationMethod, "hardware");
      assert.equal(result2.navigationMethod, "hardware");
    });
  });
});
