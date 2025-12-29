import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { AdbClient } from "../../src/utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../src/models";

describe("AccessibilityServiceManager", function() {
  let accessibilityServiceClient: AndroidAccessibilityServiceManager;
  let fakeAdb: FakeAdbExecutor;
  let testDevice: BootedDevice;
  let adbClient: AdbClient;

  beforeEach(function() {
    // Create fake ADB instance
    fakeAdb = new FakeAdbExecutor();

    // Create test device
    testDevice = {
      deviceId: "test-device",
      platform: "android",
      isEmulator: true,
      name: "Test Device"
    };

    // Create a wrapper function that adapts FakeAdbExecutor to the execAsync signature
    const fakeExecAsync = async (command: string, maxBuffer?: number) => {
      // Strip the "adb -s test-device " prefix that AdbClient adds
      const prefix = "adb -s test-device ";
      const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
      return fakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
    };

    // Create AdbClient with fake executor function
    adbClient = new AdbClient(testDevice, fakeExecAsync);

    // Reset singleton instances
    AndroidAccessibilityServiceManager.resetInstances();

    accessibilityServiceClient = AndroidAccessibilityServiceManager.getInstance(testDevice, adbClient);
    accessibilityServiceClient.clearAvailabilityCache();
  });

  describe("isInstalled", function() {
    it("should return true when accessibility service package is installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).to.be.true;
    });

    it("should return false when accessibility service package is not installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).to.be.false;
    });

    it("should return false when ADB command fails", async function() {
      // FakeAdbExecutor doesn't throw by default, so we set it to return empty
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "",
        stderr: "Error"
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).to.be.false;
    });
  });

  describe("isEnabled", function() {
    it("should return true when accessibility service is enabled", async function() {
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService:other.service/SomeService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).to.be.true;
    });

    it("should return false when accessibility service is not enabled", async function() {
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: "other.service/SomeService",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).to.be.false;
    });

    it("should return false when ADB command fails", async function() {
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: "",
        stderr: "Error"
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).to.be.false;
    });
  });

  describe("isAvailable", function() {
    it("should return true when service is both installed and enabled", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).to.be.true;
      expect(fakeAdb.getExecutedCommands().length).to.be.greaterThanOrEqual(2);
    });

    it("should return false when service is installed but not enabled", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: "other.service/SomeService",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).to.be.false;
      expect(fakeAdb.getExecutedCommands().length).to.be.greaterThanOrEqual(2);
    });

    it("should return false when service is not installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).to.be.false;
      expect(fakeAdb.getExecutedCommands().length).to.be.greaterThanOrEqual(2);
    });
  });
});
