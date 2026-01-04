import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { AdbClient } from "../../src/utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../src/models";
import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";

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

  afterEach(function() {
    AndroidAccessibilityServiceManager.setExpectedChecksumForTesting(null);
  });
  describe("isInstalled", function() {
    test("should return true when accessibility service package is installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).toBe(true);
    });

    test("should return false when accessibility service package is not installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).toBe(false);
    });

    test("should return false when ADB command fails", async function() {
      // FakeAdbExecutor doesn't throw by default, so we set it to return empty
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "",
        stderr: "Error"
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).toBe(false);
    });
  });

  describe("isEnabled", function() {
    test("should return true when accessibility service is enabled", async function() {
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService:other.service/SomeService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).toBe(true);
    });

    test("should return false when accessibility service is not enabled", async function() {
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: "other.service/SomeService",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).toBe(false);
    });

    test("should return false when ADB command fails", async function() {
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: "",
        stderr: "Error"
      });

      const result = await accessibilityServiceClient.isEnabled();
      expect(result).toBe(false);
    });
  });

  describe("isAvailable", function() {
    test("should return true when service is both installed and enabled", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).toBe(true);
      expect(fakeAdb.getExecutedCommands().length).toBeGreaterThanOrEqual(2);
    });

    test("should return false when service is installed but not enabled", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: "other.service/SomeService",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).toBe(false);
      expect(fakeAdb.getExecutedCommands().length).toBeGreaterThanOrEqual(2);
    });

    test("should return false when service is not installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).toBe(false);
      expect(fakeAdb.getExecutedCommands().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getInstalledApkSha256", function() {
    test("should return SHA256 from device when sha256sum is available", async function() {
      fakeAdb.setCommandResponse(`shell pm path ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "abc123 /data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });

      const result = await accessibilityServiceClient.getInstalledApkSha256();
      expect(result).toBe("abc123");
    });

    test("should fall back to host hashing when sha256sum fails", async function() {
      const expectedApkPath = "/data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk";
      const apkContent = Buffer.from("fake-apk-content");
      const expectedSha = crypto.createHash("sha256").update(apkContent).digest("hex");

      const createExecResult = (stdout: string, stderr: string) => ({
        stdout,
        stderr,
        toString: () => stdout,
        trim: () => stdout.trim(),
        includes: (searchString: string) => stdout.includes(searchString)
      });

      const fakeExecAsync = async (command: string) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;

        if (strippedCommand.includes("shell pm path")) {
          return createExecResult(`package:${expectedApkPath}\n`, "");
        }

        if (strippedCommand.includes("shell sha256sum")) {
          throw new Error("sha256sum not available");
        }

        if (strippedCommand.includes("pull")) {
          const match = strippedCommand.match(/pull\s+"[^"]+"\s+"([^"]+)"/);
          if (match?.[1]) {
            await fs.mkdir(path.dirname(match[1]), { recursive: true });
            await fs.writeFile(match[1], apkContent);
          }
          return createExecResult("", "");
        }

        return createExecResult("", "");
      };

      const fallbackAdb = new AdbClient(testDevice, fakeExecAsync);
      AndroidAccessibilityServiceManager.resetInstances();
      const fallbackClient = AndroidAccessibilityServiceManager.getInstance(testDevice, fallbackAdb);

      const result = await fallbackClient.getInstalledApkSha256();
      expect(result).toBe(expectedSha);
    });
  });

  describe("ensureCompatibleVersion", function() {
    const createExecResult = (stdout: string, stderr: string) => ({
      stdout,
      stderr,
      toString: () => stdout,
      trim: () => stdout.trim(),
      includes: (searchString: string) => stdout.includes(searchString)
    });

    test("should report compatible when installed SHA matches expected", async function() {
      AndroidAccessibilityServiceManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "expected-sha /data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });

      const localExecAsync = async (command: string, maxBuffer?: number) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        return localFakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
      };

      const localAdbClient = new AdbClient(testDevice, localExecAsync);
      AndroidAccessibilityServiceManager.resetInstances();
      const manager = AndroidAccessibilityServiceManager.getInstance(testDevice, localAdbClient);

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("compatible");
      expect(localFakeAdb.wasCommandExecuted("install -r -d")).toBe(false);
    });

    test("should upgrade when installed SHA mismatches expected", async function() {
      AndroidAccessibilityServiceManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "different-sha /data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("install -r -d", createExecResult("Success", ""));

      const localExecAsync = async (command: string, maxBuffer?: number) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        return localFakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
      };

      const localAdbClient = new AdbClient(testDevice, localExecAsync);
      AndroidAccessibilityServiceManager.resetInstances();
      const manager = AndroidAccessibilityServiceManager.getInstance(testDevice, localAdbClient);
      (manager as any).downloadApk = async () => "/tmp/fake-accessibility.apk";
      (manager as any).cleanupApk = async () => undefined;

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("upgraded");
      expect(localFakeAdb.wasCommandExecuted("install -r -d")).toBe(true);
    });

    test("should reinstall when upgrade install fails", async function() {
      AndroidAccessibilityServiceManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "different-sha /data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm uninstall ${AndroidAccessibilityServiceManager.PACKAGE}`, createExecResult("Success", ""));

      const localExecAsync = async (command: string, maxBuffer?: number) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        if (strippedCommand.includes("install -r -d")) {
          throw new Error("INSTALL_FAILED");
        }
        return localFakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
      };

      const localAdbClient = new AdbClient(testDevice, localExecAsync);
      AndroidAccessibilityServiceManager.resetInstances();
      const manager = AndroidAccessibilityServiceManager.getInstance(testDevice, localAdbClient);
      (manager as any).downloadApk = async () => "/tmp/fake-accessibility.apk";
      (manager as any).cleanupApk = async () => undefined;
      (manager as any).install = async () => undefined;
      (manager as any).enable = async () => undefined;

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("reinstalled");
      expect(localFakeAdb.wasCommandExecuted("shell pm uninstall")).toBe(true);
    });
  });
});
