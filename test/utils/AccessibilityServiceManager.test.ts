import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { AdbClient } from "../../src/utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../src/models";
import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";
import os from "os";

describe("AccessibilityServiceManager", function() {
  let accessibilityServiceClient: AndroidAccessibilityServiceManager;
  let fakeAdb: FakeAdbExecutor;
  let testDevice: BootedDevice;
  let adbClient: AdbClient;
  let originalApkPathEnv: string | undefined;
  let originalSkipChecksumEnv: string | undefined;
  let originalSkipDownloadEnv: string | undefined;
  let originalSkipShaEnv: string | undefined;

  beforeEach(function() {
    originalApkPathEnv = process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH;
    originalSkipChecksumEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM;
    originalSkipDownloadEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED;
    originalSkipShaEnv = process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK;
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
    if (originalApkPathEnv === undefined) {
      delete process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH;
    } else {
      process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH = originalApkPathEnv;
    }
    if (originalSkipChecksumEnv === undefined) {
      delete process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM;
    } else {
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM = originalSkipChecksumEnv;
    }
    if (originalSkipDownloadEnv === undefined) {
      delete process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED;
    } else {
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED = originalSkipDownloadEnv;
    }
    if (originalSkipShaEnv === undefined) {
      delete process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK;
    } else {
      process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK = originalSkipShaEnv;
    }
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
          const match = strippedCommand.match(/pull\s+(".*?"|\S+)\s+(".*?"|\S+)/);
          const localPathRaw = match?.[2]?.replace(/^"(.*)"$/, "$1");
          if (localPathRaw) {
            await fs.mkdir(path.dirname(localPathRaw), { recursive: true });
            await fs.writeFile(localPathRaw, apkContent);
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

    test("should skip version check when local APK override is set", async function() {
      process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH = "/tmp/local-accessibility.apk";

      const result = await accessibilityServiceClient.ensureCompatibleVersion();
      expect(result.status).toBe("skipped");
    });

    test("should skip version check when SHA skip flag is true", async function() {
      process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK = "true";

      const result = await accessibilityServiceClient.ensureCompatibleVersion();
      expect(result.status).toBe("skipped");
    });

    test("should skip download when preinstalled APK is allowed", async function() {
      AndroidAccessibilityServiceManager.setExpectedChecksumForTesting("expected-sha");
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED = "true";

      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
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
      (manager as any).downloadApk = async () => {
        throw new Error("download should not be called");
      };

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("skipped");
    });

    test("should reinstall when installed SHA cannot be determined", async function() {
      AndroidAccessibilityServiceManager.setExpectedChecksumForTesting("expected-sha");
      const executedCommands: string[] = [];
      const apkPath = "/data/app/dev.jasonpearson.automobile.accessibilityservice/base.apk";

      const localExecAsync = async (command: string) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        executedCommands.push(strippedCommand);

        if (strippedCommand.includes("shell pm list packages")) {
          return createExecResult(`package:${AndroidAccessibilityServiceManager.PACKAGE}\n`, "");
        }

        if (strippedCommand.includes("shell pm path")) {
          return createExecResult(`package:${apkPath}\n`, "");
        }

        if (strippedCommand.includes("shell sha256sum")) {
          throw new Error("sha256sum not available");
        }

        if (strippedCommand.includes("pull")) {
          throw new Error("pull failed");
        }

        if (strippedCommand.includes("shell pm uninstall")) {
          return createExecResult("Success", "");
        }

        if (strippedCommand.includes("install -r -d")) {
          throw new Error("Unexpected upgrade call");
        }

        return createExecResult("", "");
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
      expect(executedCommands.some(command => command.includes("install -r -d"))).toBe(false);
      expect(executedCommands.some(command => command.includes("shell pm uninstall"))).toBe(true);
    });

    test("should mark download unavailable when offline", async function() {
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

      const localExecAsync = async (command: string, maxBuffer?: number) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        return localFakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
      };

      const localAdbClient = new AdbClient(testDevice, localExecAsync);
      AndroidAccessibilityServiceManager.resetInstances();
      const manager = AndroidAccessibilityServiceManager.getInstance(testDevice, localAdbClient);
      (manager as any).downloadApk = async () => {
        throw new Error("Could not resolve host");
      };

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("failed");
      expect(result.downloadUnavailable).toBe(true);
      expect(result.error).toContain("offline");
    });
  });

  describe("downloadApk", () => {
    test("should copy from local APK override when provided", async function() {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-mobile-test-apk-"));
      const localApkPath = path.join(tempDir, "accessibility-service-debug.apk");
      const payload = Buffer.alloc(12000, 1);
      await fs.writeFile(localApkPath, payload);

      process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH = localApkPath;

      const apkPath = await accessibilityServiceClient.downloadApk();
      const stats = await fs.stat(apkPath);
      expect(stats.size).toBe(payload.length);
    });
  });

  describe("setup", function() {
    test("should allow repeated setup when service is already available", async function() {
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED = "true";
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
        stderr: ""
      });

      const firstResult = await accessibilityServiceClient.setup();
      expect(firstResult.success).toBe(true);

      const secondResult = await accessibilityServiceClient.setup();
      expect(secondResult.success).toBe(true);
    });
  });
});
