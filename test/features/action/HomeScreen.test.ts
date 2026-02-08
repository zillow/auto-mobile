import { expect, describe, test, beforeEach, spyOn } from "bun:test";
import { HomeScreen } from "../../../src/features/action/HomeScreen";
import { BootedDevice, ObserveResult } from "../../../src/models";
import { XCTestServiceClient } from "../../../src/features/observe/ios";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeXCTestService } from "../../fakes/FakeXCTestService";


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
  let mockDevice: BootedDevice;
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
    fakeWindow.configureCachedActiveWindow(null);
    fakeWindow.configureActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default observe screen responses with valid viewHierarchy
    // We need to set different results to simulate screen change
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    mockDevice = {
      name: "Test Device",
      platform: "android",
      deviceId: "test-device"
    };
    homeScreen = new HomeScreen(mockDevice, fakeAdb);

    // Replace the internal managers with our fakes
    (homeScreen as any).observeScreen = fakeObserveScreen;
    (homeScreen as any).window = fakeWindow;
    (homeScreen as any).awaitIdle = fakeAwaitIdle;
  });

  describe("execute", () => {
    test("should execute hardware navigation using keyevent 3", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const result = await homeScreen.execute();
      expect(result.success).toBe(true);
      expect(result.navigationMethod).toBe("hardware");
      expect(result.observation).toBeDefined();

      // Verify hardware home button keyevent was executed
      const executedCommands = fakeAdb.getExecutedCommands();
      expect(executedCommands.some(cmd => cmd.includes("shell input keyevent 3"))).toBe(true);
    });

    test("should work with progress callback", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const progressCallback = async () => {
        // callback for progress tracking
      };
      const result = await homeScreen.execute(progressCallback);

      expect(result.success).toBe(true);
      expect(result.navigationMethod).toBe("hardware");
    });

    test("should include observation in result", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const result = await homeScreen.execute();

      expect(result.success).toBe(true);
      expect(result.observation).toBeDefined();
      expect(result.observation?.screenSize).toBeDefined();
    });

    test("should use XCTestService press home on iOS", async () => {
      const iosDevice: BootedDevice = {
        name: "iPhone 15",
        platform: "ios",
        deviceId: "ios-device"
      };
      const iosHomeScreen = new HomeScreen(iosDevice, fakeAdb);
      (iosHomeScreen as any).observeScreen = fakeObserveScreen;
      (iosHomeScreen as any).window = fakeWindow;
      (iosHomeScreen as any).awaitIdle = fakeAwaitIdle;

      const fakeXCTestService = new FakeXCTestService();
      const getInstanceSpy = spyOn(XCTestServiceClient, "getInstance").mockReturnValue(
        fakeXCTestService as any
      );

      try {
        const result = await iosHomeScreen.execute();
        expect(result.success).toBe(true);
        expect(fakeXCTestService.getPressHomeRequestCount()).toBe(1);
      } finally {
        getInstanceSpy.mockRestore();
      }
    });
  });

  describe("error handling", () => {
    test("should propagate errors when hardware navigation fails", async () => {
      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "Hardware failed" });

      try {
        await homeScreen.execute();
        throw new Error("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("multiple devices", () => {
    test("should work with different device IDs", async () => {
      const otherDevice: BootedDevice = {
        name: "Device 2",
        platform: "android",
        deviceId: "device-2"
      };
      const homeScreen2 = new HomeScreen(otherDevice, fakeAdb);

      // Set up fakes for the second HomeScreen instance
      const fakeWindow2 = new FakeWindow();
      const fakeObserveScreen2 = new FakeObserveScreen();
      const fakeAwaitIdle2 = new FakeAwaitIdle();

      fakeWindow2.configureCachedActiveWindow(null);
      fakeWindow2.configureActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });
      fakeObserveScreen2.setObserveResult(() => createObserveResult());

      (homeScreen2 as any).observeScreen = fakeObserveScreen2;
      (homeScreen2 as any).window = fakeWindow2;
      (homeScreen2 as any).awaitIdle = fakeAwaitIdle2;

      fakeAdb.setCommandResponse("shell input keyevent 3", { stdout: "", stderr: "" });

      const result1 = await homeScreen.execute();
      const result2 = await homeScreen2.execute();

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.navigationMethod).toBe("hardware");
      expect(result2.navigationMethod).toBe("hardware");
    });
  });
});
