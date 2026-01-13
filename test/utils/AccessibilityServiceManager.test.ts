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

    test("should fall back to node checksum when sha tools are unavailable", async function() {
      const payload = Buffer.alloc(12000, 2);
      const expectedChecksum = crypto.createHash("sha256").update(payload).digest("hex");
      AndroidAccessibilityServiceManager.setExpectedChecksumForTesting(expectedChecksum);

      const executedCommands: string[] = [];
      let downloadedPath: string | null = null;
      (accessibilityServiceClient as any).execShell = async (command: string) => {
        executedCommands.push(command);
        if (command.startsWith("curl ")) {
          const match = command.match(/-o "([^"]+)"/);
          const outputPath = match?.[1];
          if (!outputPath) {
            throw new Error("Missing output path for APK download");
          }
          downloadedPath = outputPath;
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.writeFile(outputPath, payload);
          return { stdout: "", stderr: "" };
        }
        if (command.includes("sha256sum") || command.includes("shasum -a 256")) {
          throw new Error("command not found");
        }
        return { stdout: "", stderr: "" };
      };

      const apkPath = await accessibilityServiceClient.downloadApk();
      const stats = await fs.stat(apkPath);
      expect(stats.size).toBe(payload.length);
      expect(apkPath).toBe(downloadedPath);
      expect(executedCommands.some(command => command.includes("sha256sum"))).toBe(true);
      expect(executedCommands.some(command => command.includes("shasum -a 256"))).toBe(true);
      expect(executedCommands.some(command => command.includes("curl -L -o"))).toBe(true);
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

  describe("enableViaSettings", function() {
    test("should enable service when no services are currently enabled (null)", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: "null",
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${serviceComponent}"`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 1", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.enableViaSettings();

      expect(fakeAdb.wasCommandExecuted("shell settings get secure enabled_accessibility_services")).toBe(true);
      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${serviceComponent}"`)).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 1")).toBe(true);
    });

    test("should enable service when no services are currently enabled (empty string)", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${serviceComponent}"`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 1", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.enableViaSettings();

      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${serviceComponent}"`)).toBe(true);
    });

    test("should append service to existing services list", async function() {
      const existingServices = "com.example.other/com.example.other.Service";
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;
      const expectedServices = `${existingServices}:${serviceComponent}`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: existingServices,
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${expectedServices}"`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 1", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.enableViaSettings();

      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${expectedServices}"`)).toBe(true);
    });

    test("should not re-enable service if already enabled", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: serviceComponent,
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 1", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.enableViaSettings();

      // Should still enable accessibility globally but not modify the services list
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 1")).toBe(true);
      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services`)).toBe(false);
    });

    test("should preserve other services when enabling in middle of list", async function() {
      const existingServices = "com.example.first/com.example.First:com.example.second/com.example.Second";
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;
      const expectedServices = `${existingServices}:${serviceComponent}`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: existingServices,
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${expectedServices}"`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 1", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.enableViaSettings();

      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${expectedServices}"`)).toBe(true);
    });
  });

  describe("getToggleCapabilities", function() {
    test("should detect emulator and support settings toggle", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });

      const capabilities = await accessibilityServiceClient.getToggleCapabilities();

      expect(capabilities.supportsSettingsToggle).toBe(true);
      expect(capabilities.deviceType).toBe("emulator");
      expect(capabilities.apiLevel).toBe(29);
      expect(capabilities.reason).toBeUndefined();
    });

    test("should not cache capabilities when detection errors occur", async function() {
      let callCount = 0;
      const fakeExecAsync = async (command: string) => {
        callCount++;
        // First call fails, second call succeeds
        if (callCount <= 2) {
          throw new Error("ADB transient error");
        }

        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;

        if (strippedCommand.includes("ro.kernel.qemu")) {
          return { stdout: "1", stderr: "" };
        }
        if (strippedCommand.includes("ro.build.version.sdk")) {
          return { stdout: "29", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const testAdb = new AdbClient(testDevice, fakeExecAsync);
      AndroidAccessibilityServiceManager.resetInstances();
      const manager = AndroidAccessibilityServiceManager.getInstance(testDevice, testAdb);

      // First call - should fail with error and NOT cache
      const capabilities1 = await manager.getToggleCapabilities();
      expect(capabilities1.supportsSettingsToggle).toBe(false);
      expect(capabilities1.reason).toContain("transient error");

      // Second call - should retry and succeed
      const capabilities2 = await manager.getToggleCapabilities();
      expect(capabilities2.supportsSettingsToggle).toBe(true);
      expect(capabilities2.deviceType).toBe("emulator");
      expect(capabilities2.apiLevel).toBe(29);
    });

    test("should detect physical device and not support settings toggle", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.product.model", {
        stdout: "Pixel 6",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "33",
        stderr: ""
      });

      const capabilities = await accessibilityServiceClient.getToggleCapabilities();

      expect(capabilities.supportsSettingsToggle).toBe(false);
      expect(capabilities.deviceType).toBe("physical");
      expect(capabilities.apiLevel).toBe(33);
      expect(capabilities.reason).toContain("Physical devices may require");
    });

    test("should fallback to model detection when qemu prop is unavailable", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.product.model", {
        stdout: "sdk_gphone64_arm64",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "35",
        stderr: ""
      });

      const capabilities = await accessibilityServiceClient.getToggleCapabilities();

      expect(capabilities.supportsSettingsToggle).toBe(true);
      expect(capabilities.deviceType).toBe("emulator");
      expect(capabilities.apiLevel).toBe(35);
    });

    test("should reject devices with API level below 16", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "15",
        stderr: ""
      });

      const capabilities = await accessibilityServiceClient.getToggleCapabilities();

      expect(capabilities.supportsSettingsToggle).toBe(false);
      expect(capabilities.deviceType).toBe("emulator");
      expect(capabilities.apiLevel).toBe(15);
      expect(capabilities.reason).toContain("API level 15 is too old");
    });

    test("should handle API level parsing errors gracefully", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "invalid",
        stderr: ""
      });

      const capabilities = await accessibilityServiceClient.getToggleCapabilities();

      expect(capabilities.supportsSettingsToggle).toBe(true);
      expect(capabilities.deviceType).toBe("emulator");
      expect(capabilities.apiLevel).toBe(null);
    });

    test("should cache capabilities result", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });

      // First call
      const capabilities1 = await accessibilityServiceClient.getToggleCapabilities();
      const commandCount1 = fakeAdb.getExecutedCommands().length;

      // Second call should use cache
      const capabilities2 = await accessibilityServiceClient.getToggleCapabilities();
      const commandCount2 = fakeAdb.getExecutedCommands().length;

      expect(capabilities1).toEqual(capabilities2);
      expect(commandCount2).toBe(commandCount1); // No new commands executed
    });

    test("should clear cache when clearAvailabilityCache is called", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });

      // First call
      await accessibilityServiceClient.getToggleCapabilities();
      const commandCount1 = fakeAdb.getExecutedCommands().length;

      // Clear cache
      accessibilityServiceClient.clearAvailabilityCache();

      // Second call should execute commands again
      await accessibilityServiceClient.getToggleCapabilities();
      const commandCount2 = fakeAdb.getExecutedCommands().length;

      expect(commandCount2).toBeGreaterThan(commandCount1);
    });
  });

  describe("canUseSettingsToggle", function() {
    test("should return true for emulator", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });

      const canUse = await accessibilityServiceClient.canUseSettingsToggle();
      expect(canUse).toBe(true);
    });

    test("should return false for physical device", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.product.model", {
        stdout: "Pixel 6",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "33",
        stderr: ""
      });

      const canUse = await accessibilityServiceClient.canUseSettingsToggle();
      expect(canUse).toBe(false);
    });
  });

  describe("enableViaSettings with capability check", function() {
    test("should throw error when settings toggle is not supported", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.product.model", {
        stdout: "Pixel 6",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "33",
        stderr: ""
      });

      await expect(accessibilityServiceClient.enableViaSettings()).rejects.toThrow("Settings-based accessibility toggle is not supported");
    });

    test("should succeed when settings toggle is supported", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: "null",
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${serviceComponent}"`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 1", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.enableViaSettings();

      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 1")).toBe(true);
    });
  });

  describe("disableViaSettings with capability check", function() {
    test("should throw error when settings toggle is not supported", async function() {
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.product.model", {
        stdout: "Pixel 6",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "33",
        stderr: ""
      });

      await expect(accessibilityServiceClient.disableViaSettings()).rejects.toThrow("Settings-based accessibility toggle is not supported");
    });

    test("should succeed when settings toggle is supported", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: serviceComponent,
        stderr: ""
      });
      fakeAdb.setCommandResponse('shell settings put secure enabled_accessibility_services ""', {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 0", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(true);
    });
  });

  describe("disableViaSettings", function() {
    test("should handle null services gracefully", async function() {
      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: "null",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      // Should not execute any put commands
      expect(fakeAdb.wasCommandExecuted("shell settings put secure")).toBe(false);
    });

    test("should handle empty string gracefully", async function() {
      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      // Should not execute any put commands
      expect(fakeAdb.wasCommandExecuted("shell settings put secure")).toBe(false);
    });

    test("should remove service when it's the only enabled service", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: serviceComponent,
        stderr: ""
      });
      fakeAdb.setCommandResponse('shell settings put secure enabled_accessibility_services ""', {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 0", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      expect(fakeAdb.wasCommandExecuted('shell settings put secure enabled_accessibility_services ""')).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(true);
    });

    test("should remove service from start of list and preserve others", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;
      const otherService = "com.example.other/com.example.other.Service";
      const currentServices = `${serviceComponent}:${otherService}`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: currentServices,
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${otherService}"`, {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${otherService}"`)).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(false);
    });

    test("should remove service from middle of list and preserve others", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;
      const firstService = "com.example.first/com.example.First";
      const lastService = "com.example.last/com.example.Last";
      const currentServices = `${firstService}:${serviceComponent}:${lastService}`;
      const expectedServices = `${firstService}:${lastService}`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: currentServices,
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${expectedServices}"`, {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${expectedServices}"`)).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(false);
    });

    test("should remove service from end of list and preserve others", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;
      const otherService = "com.example.other/com.example.other.Service";
      const currentServices = `${otherService}:${serviceComponent}`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: currentServices,
        stderr: ""
      });
      fakeAdb.setCommandResponse(`shell settings put secure enabled_accessibility_services "${otherService}"`, {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      expect(fakeAdb.wasCommandExecuted(`shell settings put secure enabled_accessibility_services "${otherService}"`)).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(false);
    });

    test("should handle case when service is not in the list", async function() {
      const otherService = "com.example.other/com.example.other.Service";

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: otherService,
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      // Should not execute any put commands since service was not enabled
      expect(fakeAdb.wasCommandExecuted("shell settings put secure enabled_accessibility_services")).toBe(false);
      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled")).toBe(false);
    });

    test("should disable accessibility globally when removing last service", async function() {
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Mock emulator detection
      fakeAdb.setCommandResponse("shell getprop ro.kernel.qemu", {
        stdout: "1",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell getprop ro.build.version.sdk", {
        stdout: "29",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings get secure enabled_accessibility_services", {
        stdout: serviceComponent,
        stderr: ""
      });
      fakeAdb.setCommandResponse('shell settings put secure enabled_accessibility_services ""', {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell settings put secure accessibility_enabled 0", {
        stdout: "",
        stderr: ""
      });

      await accessibilityServiceClient.disableViaSettings();

      expect(fakeAdb.wasCommandExecuted("shell settings put secure accessibility_enabled 0")).toBe(true);
    });
  });
});
