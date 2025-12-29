import { assert } from "chai";
import { Rotate } from "../../../src/features/action/Rotate";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeAwaitIdle } from "../../fakes/FakeAwaitIdle";
import { ExecResult, BootedDevice } from "../../../src/models";

describe("Rotate", () => {
  let rotate: Rotate;
  let fakeAdb: FakeAdbExecutor;
  let fakeAwaitIdle: FakeAwaitIdle;
  let mockDevice: BootedDevice;

  // Helper function to create mock ExecResult
  const createExecResult = (stdout: string = ""): ExecResult => ({
    stdout,
    stderr: "",
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (searchString: string) => stdout.includes(searchString)
  });


  beforeEach(() => {
    // Create mock BootedDevice
    mockDevice = {
      name: "Test Device",
      platform: "android",
      deviceId: "test-device",
      source: "local"
    };

    // Create fake for ADB
    fakeAdb = new FakeAdbExecutor();

    // Create fake for AwaitIdle
    fakeAwaitIdle = new FakeAwaitIdle();

    // Set default responses for common commands
    fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));
    fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));

    // Instantiate Rotate with fake ADB
    rotate = new Rotate(mockDevice, fakeAdb);

    // Inject the fake AwaitIdle to avoid real delays
    (rotate as any).awaitIdle = fakeAwaitIdle;
  });

  describe("getCurrentOrientation", () => {
    it("should return portrait for user_rotation 0", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait");
      assert.isTrue(fakeAdb.wasCommandExecuted("shell settings get system user_rotation"));
    });

    it("should return landscape for user_rotation 1", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("1"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "landscape");
    });

    it("should return portrait for user_rotation 2", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("2"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait");
    });

    it("should return landscape for user_rotation 3", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("3"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "landscape");
    });

    it("should return portrait as default when ADB command fails", async () => {
      fakeAdb.setDefaultResponse({
        stdout: "",
        stderr: "Error",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(s: string) { return this.stderr.includes(s); }
      });

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait");
    });
  });

  describe("isOrientationLocked", () => {
    it("should return true when accelerometer_rotation is 0", async () => {
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("0"));

      const isLocked = await rotate.isOrientationLocked();

      assert.isTrue(isLocked);
      assert.isTrue(fakeAdb.wasCommandExecuted("shell settings get system accelerometer_rotation"));
    });

    it("should return false when accelerometer_rotation is 1", async () => {
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));

      const isLocked = await rotate.isOrientationLocked();

      assert.isFalse(isLocked);
    });

    it("should return false as default when ADB command fails", async () => {
      fakeAdb.setDefaultResponse({
        stdout: "",
        stderr: "Error",
        toString() { return this.stderr; },
        trim() { return this.stderr.trim(); },
        includes(s: string) { return this.stderr.includes(s); }
      });

      const isLocked = await rotate.isOrientationLocked();

      assert.isFalse(isLocked);
    });
  });

  describe("execute", () => {
    it("should skip rotation when already in desired orientation", async () => {
      // Setup: device is already in portrait orientation
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));

      const result = await rotate.execute("portrait");

      assert.isTrue(result.success);
      assert.equal(result.orientation, "portrait");
      assert.isFalse(result.rotationPerformed);
      assert.include(result.message || "", "already in portrait orientation");

      // Verify that we got the current orientation
      assert.isTrue(fakeAdb.wasCommandExecuted("shell settings get system user_rotation"));
      // Should not have tried to set rotation since already in desired orientation
      assert.isFalse(fakeAdb.wasCommandExecuted("shell settings put system user_rotation 0"));
    });

    it("should get current orientation and lock status before rotation", async () => {
      // Setup: device starts in portrait, needs to rotate to landscape
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));
      fakeAdb.setCommandResponse("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 1\"", createExecResult());

      await rotate.execute("landscape");

      // Verify ADB calls were made to check orientation state
      assert.isTrue(fakeAdb.wasCommandExecuted("shell settings get system user_rotation"));
      assert.isTrue(fakeAdb.wasCommandExecuted("shell settings get system accelerometer_rotation"));
    });

    it("should attempt rotation command when orientation differs", async () => {
      // Setup: device is in portrait, rotating to landscape
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("0"));
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("1"));
      fakeAdb.setCommandResponse("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 1\"", createExecResult());

      await rotate.execute("landscape");

      // Verify the combined rotation command was executed
      assert.isTrue(fakeAdb.wasCommandExecuted("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 1\""));
    });

    it("should unlock orientation if locked before rotation", async () => {
      // Setup: device is landscape with orientation locked
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("1"));
      fakeAdb.setCommandResponse("shell settings get system accelerometer_rotation", createExecResult("0")); // Locked
      fakeAdb.setCommandResponse("shell settings put system accelerometer_rotation 1", createExecResult()); // Unlock
      fakeAdb.setCommandResponse("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 0\"", createExecResult());

      const result = await rotate.execute("portrait");

      assert.isTrue(result.success);
      // Verify that the unlock command was executed
      assert.isTrue(fakeAdb.wasCommandExecuted("shell settings put system accelerometer_rotation 1"));
      // Verify the rotation command was executed
      assert.isTrue(fakeAdb.wasCommandExecuted("shell \"settings put system accelerometer_rotation 0; settings put system user_rotation 0\""));
    });
  });

  describe("constructor", () => {
    it("should work with non-null deviceId", () => {
      const device: BootedDevice = {
        name: "Test Device",
        platform: "android",
        deviceId: "test-device",
        source: "local"
      };
      const rotateInstance = new Rotate(device);
      assert.isDefined(rotateInstance);
    });

    it("should work with custom ADB executor", () => {
      const device: BootedDevice = {
        name: "Test Device",
        platform: "android",
        deviceId: "test-device",
        source: "local"
      };
      const customAdb = new FakeAdbExecutor();
      const rotateInstance = new Rotate(device, customAdb);
      assert.isDefined(rotateInstance);
    });
  });

  describe("edge cases", () => {
    it("should handle whitespace in ADB output", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("  1  \n"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "landscape");
    });

    it("should handle non-numeric ADB output", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult("not-a-number"));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait"); // Should default to portrait
    });

    it("should handle empty ADB output", async () => {
      fakeAdb.setCommandResponse("shell settings get system user_rotation", createExecResult(""));

      const orientation = await rotate.getCurrentOrientation();

      assert.equal(orientation, "portrait"); // Should default to portrait
    });
  });
});
