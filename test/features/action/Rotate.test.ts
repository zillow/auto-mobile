import { expect, describe, test, beforeEach } from "bun:test";
import { Rotate } from "../../../src/features/action/Rotate";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { FakeObserveScreen } from "../../fakes/FakeObserveScreen";
import { FakeWindow } from "../../fakes/FakeWindow";
import { ExecResult, BootedDevice, ObserveResult } from "../../../src/models";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("Rotate", () => {
  let rotate: Rotate;
  let fakeAdb: FakeAdbExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let fakeObserveScreen: FakeObserveScreen;
  let fakeWindow: FakeWindow;
  let fakeTimer: FakeTimer;
  let mockDevice: BootedDevice;

  // Helper function to create mock ExecResult
  const createExecResult = (stdout: string = ""): ExecResult => ({
    stdout,
    stderr: "",
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (searchString: string) => stdout.includes(searchString)
  });

  // Helper function to create mock ObserveResult
  const createObserveResult = (): ObserveResult => ({
    timestamp: Date.now(),
    screenSize: { width: 1080, height: 1920 },
    systemInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    viewHierarchy: { node: {} }
  });


  beforeEach(() => {
    // Create mock BootedDevice
    mockDevice = {
      name: "Test Device",
      platform: "android",
      deviceId: "test-device",
      source: "local"
    };

    // Create fakes for testing
    fakeAdb = new FakeAdbExecutor();
    fakeAwaitIdle = new FakeAwaitIdle();
    fakeObserveScreen = new FakeObserveScreen();
    fakeWindow = new FakeWindow();
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    // Configure default responses
    fakeWindow.setCachedActiveWindow(null);
    fakeWindow.setActiveWindow({ appId: "com.test.app", activityName: "MainActivity", layoutSeqSum: 123 });

    // Set up default observe screen responses with valid viewHierarchy
    // Use a factory to create different objects on each call (avoids BaseVisualChange
    // comparing same object references and overriding success to false)
    fakeObserveScreen.setObserveResult(() => createObserveResult());

    // Set default responses for common ADB commands
    fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));
    fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));

    // Instantiate Rotate with fake ADB
    rotate = new Rotate(mockDevice, fakeAdb, fakeTimer);

    // Inject all fakes to avoid real device operations
    (rotate as any).awaitIdle = fakeAwaitIdle;
    (rotate as any).observeScreen = fakeObserveScreen;
    (rotate as any).window = fakeWindow;
  });

  describe("getCurrentOrientation", () => {
    test("should return portrait for user_rotation 0", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("portrait");
      expect(fakeAdb.wasCommandExecuted("shell settings get system user_rotation")).toBe(true);
    });

    test("should return landscape for user_rotation 1", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("1"));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("landscape");
    });

    test("should return portrait for user_rotation 2", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("2"));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("portrait");
    });

    test("should return landscape for user_rotation 3", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("3"));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("landscape");
    });

    test("should return portrait as default when ADB command fails", async () => {
      fakeAdb.setDefaultResponse({
        stdout: "",
        stderr: "Error",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(s: string) { return this.stderr.includes(s); }
      });

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("portrait");
    });
  });

  describe("isOrientationLocked", () => {
    test("should return true when accelerometer_rotation is 0", async () => {
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("0"));

      const isLocked = await rotate.isOrientationLocked();

      expect(isLocked).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings get system accelerometer_rotation")).toBe(true);
    });

    test("should return false when accelerometer_rotation is 1", async () => {
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));

      const isLocked = await rotate.isOrientationLocked();

      expect(isLocked).toBe(false);
    });

    test("should return false as default when ADB command fails", async () => {
      fakeAdb.setDefaultResponse({
        stdout: "",
        stderr: "Error",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(s: string) { return this.stderr.includes(s); }
      });

      const isLocked = await rotate.isOrientationLocked();

      expect(isLocked).toBe(false);
    });
  });

  describe("execute", () => {
    test("should skip rotation when already in desired orientation", async () => {
      // Setup: device is already in portrait orientation
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));

      const result = await rotate.execute("portrait");

      expect(result.success).toBe(true);
      expect(result.orientation).toBe("portrait");
      expect(result.rotationPerformed).toBe(false);
      expect(result.message || "").toContain("already in portrait orientation");

      // Verify that we got the current orientation
      expect(fakeAdb.wasCommandExecuted("shell settings get system user_rotation")).toBe(true);
      // Should not have tried to set rotation since already in desired orientation
      expect(fakeAdb.wasCommandExecuted("shell settings put system user_rotation 0")).toBe(false);
    });

    test("should get current orientation and lock status before rotation", async () => {
      // Setup: device starts in portrait, needs to rotate to landscape
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));
      fakeAdb.setCommandResponse("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 1\"", createExecResult());

      await rotate.execute("landscape");

      // Verify ADB calls were made to check orientation state
      expect(fakeAdb.wasCommandExecuted("shell settings get system user_rotation")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings get system accelerometer_rotation")).toBe(true);
    });

    test("should attempt rotation command when orientation differs", async () => {
      // Setup: device is in portrait, rotating to landscape
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));
      fakeAdb.setCommandResponse("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 1\"", createExecResult());

      await rotate.execute("landscape");

      // Verify the combined rotation command was executed
      expect(fakeAdb.wasCommandExecuted("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 1\"")).toBe(true);
    });

    test("should unlock orientation if locked before rotation", async () => {
      // Setup: device is landscape with orientation locked
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("1"));
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("0")); // Locked
      fakeAdb.setCommandResponse("shell settings put system accelerometer_rotation 1", createExecResult()); // Unlock
      fakeAdb.setCommandResponse("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 0\"", createExecResult());

      const result = await rotate.execute("portrait");

      expect(result.success).toBe(true);
      // Verify that the unlock command was executed
      expect(fakeAdb.wasCommandExecuted("shell settings put system accelerometer_rotation 1")).toBe(true);
      // Verify the rotation command was executed
      expect(fakeAdb.wasCommandExecuted("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 0\"")).toBe(true);
    });
  });

  describe("constructor", () => {
    test("should work with non-null deviceId", () => {
      const device: BootedDevice = {
        name: "Test Device",
        platform: "android",
        deviceId: "test-device",
        source: "local"
      };
      const rotateInstance = new Rotate(device, null, fakeTimer);
      expect(rotateInstance).toBeDefined();
    });

    test("should work with custom ADB executor", () => {
      const device: BootedDevice = {
        name: "Test Device",
        platform: "android",
        deviceId: "test-device",
        source: "local"
      };
      const customAdb = new FakeAdbExecutor();
      const rotateInstance = new Rotate(device, customAdb, fakeTimer);
      expect(rotateInstance).toBeDefined();
    });
  });

  describe("edge cases", () => {
    test("should handle whitespace in ADB output", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("  1  \n"));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("landscape");
    });

    test("should handle non-numeric ADB output", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("not-a-number"));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("portrait"); // Should default to portrait
    });

    test("should handle empty ADB output", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult(""));

      const orientation = await rotate.getCurrentOrientation();

      expect(orientation).toBe("portrait"); // Should default to portrait
    });
  });
});
