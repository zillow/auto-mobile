import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AndroidCtrlProxyManager } from "../../src/utils/CtrlProxyManager";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { AdbClient } from "../../src/utils/android-cmdline-tools/AdbClient";
import type { AdbClientFactory } from "../../src/utils/android-cmdline-tools/AdbClientFactory";
import { BootedDevice } from "../../src/models";
import * as fs from "fs/promises";
import * as path from "path";
import crypto from "crypto";
import os from "os";
import AdmZip from "adm-zip";

import { FakeAccessibilityDetector } from "../fakes/FakeAccessibilityDetector";

describe("CtrlProxyManager", function() {
  let accessibilityServiceClient: AndroidCtrlProxyManager;
  let fakeAdb: FakeAdbExecutor;
  let fakeAdbFactory: AdbClientFactory;
  let testDevice: BootedDevice;
  let originalApkPathEnv: string | undefined;
  let originalSkipChecksumEnv: string | undefined;
  let originalSkipDownloadEnv: string | undefined;
  let originalSkipShaEnv: string | undefined;

  beforeEach(function() {
    originalApkPathEnv = process.env.AUTOMOBILE_CTRL_PROXY_APK_PATH;
    originalSkipChecksumEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM;
    originalSkipDownloadEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED;
    originalSkipShaEnv = process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK;
    // Create fake ADB instance
    fakeAdb = new FakeAdbExecutor();
    fakeAdbFactory = { create: () => fakeAdb };

    // Create test device
    testDevice = {
      deviceId: "test-device",
      platform: "android",
      isEmulator: true,
      name: "Test Device"
    };

    // Reset singleton instances
    AndroidCtrlProxyManager.resetInstances();

    accessibilityServiceClient = AndroidCtrlProxyManager.getInstance(testDevice, fakeAdbFactory);
    accessibilityServiceClient.clearAvailabilityCache();
  });

  afterEach(function() {
    AndroidCtrlProxyManager.setExpectedChecksumForTesting(null);
    AndroidCtrlProxyManager.setAccessibilityDetectorForTesting(null);
    if (originalApkPathEnv === undefined) {
      delete process.env.AUTOMOBILE_CTRL_PROXY_APK_PATH;
    } else {
      process.env.AUTOMOBILE_CTRL_PROXY_APK_PATH = originalApkPathEnv;
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
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).toBe(true);
    });

    test("should return false when accessibility service package is not installed", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "",
        stderr: ""
      });

      const result = await accessibilityServiceClient.isInstalled();
      expect(result).toBe(false);
    });

    test("should return false when ADB command fails", async function() {
      // FakeAdbExecutor doesn't throw by default, so we set it to return empty
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
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
        stdout: `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.AutomobileAccessibilityService:other.service/SomeService`,
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
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).toBe(true);
      expect(fakeAdb.getExecutedCommands().length).toBeGreaterThanOrEqual(2);
    });

    test("should return false when service is installed but not enabled", async function() {
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
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
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`,
        stderr: ""
      });

      const result = await accessibilityServiceClient.isAvailable();
      expect(result).toBe(false);
      expect(fakeAdb.getExecutedCommands().length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getInstalledApkSha256", function() {
    test("should return SHA256 from device when sha256sum is available", async function() {
      fakeAdb.setCommandResponse(`shell pm path ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "abc123 /data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });

      const result = await accessibilityServiceClient.getInstalledApkSha256();
      expect(result).toBe("abc123");
    });

    test("should fall back to host hashing when sha256sum fails", async function() {
      const expectedApkPath = "/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk";
      const apkContent = Buffer.from("fake-apk-content");
      const expectedSha = crypto.createHash("sha256").update(apkContent).digest("hex");

      const createExecResult = (stdout: string, stderr: string) => ({
        stdout,
        stderr,
        toString: () => stdout,
        trim: () => stdout.trim(),
        includes: (searchString: string) => stdout.includes(searchString)
      });

      const localFakeAdb: any = {
        executeCommand: async (command: string) => {
          if (command.includes("shell pm path")) {
            return createExecResult(`package:${expectedApkPath}\n`, "");
          }

          if (command.includes("shell sha256sum")) {
            throw new Error("sha256sum not available");
          }

          if (command.includes("pull")) {
            const match = command.match(/pull\s+(".*?"|\S+)\s+(".*?"|\S+)/);
            const localPathRaw = match?.[2]?.replace(/^"(.*)"$/, "$1");
            if (localPathRaw) {
              await fs.mkdir(path.dirname(localPathRaw), { recursive: true });
              await fs.writeFile(localPathRaw, apkContent);
            }
            return createExecResult("", "");
          }

          return createExecResult("", "");
        }
      };

      AndroidCtrlProxyManager.resetInstances();
      const fallbackClient = AndroidCtrlProxyManager.getInstance(testDevice, { create: () => localFakeAdb });

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
      AndroidCtrlProxyManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "expected-sha /data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, { create: () => localFakeAdb });

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("compatible");
      expect(localFakeAdb.wasCommandExecuted("install -r -d")).toBe(false);
    });

    test("should upgrade when installed SHA mismatches expected", async function() {
      AndroidCtrlProxyManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "different-sha /data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("install -r -d", createExecResult("Success", ""));

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, { create: () => localFakeAdb });
      (manager as any).downloadApk = async () => "/tmp/fake-accessibility.apk";
      (manager as any).cleanupApk = async () => undefined;

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("upgraded");
      expect(localFakeAdb.wasCommandExecuted("install -r -d")).toBe(true);
    });

    test("should reinstall when upgrade install fails", async function() {
      AndroidCtrlProxyManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "different-sha /data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm uninstall ${AndroidCtrlProxyManager.PACKAGE}`, createExecResult("Success", ""));

      const localExecAsync = async (command: string, maxBuffer?: number) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        if (strippedCommand.includes("install -r -d")) {
          throw new Error("INSTALL_FAILED");
        }
        return localFakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
      };

      // Create AdbClient with custom executor that throws on install, wrap in factory
      const localAdbClient = new AdbClient(testDevice, localExecAsync);
      const localFactory: AdbClientFactory = { create: () => localAdbClient };

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, localFactory);
      (manager as any).downloadApk = async () => "/tmp/fake-accessibility.apk";
      (manager as any).cleanupApk = async () => undefined;
      (manager as any).install = async () => undefined;
      (manager as any).enable = async () => undefined;

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("reinstalled");
      expect(localFakeAdb.wasCommandExecuted("shell pm uninstall")).toBe(true);
    });

    test("should skip version check when local APK override is set", async function() {
      process.env.AUTOMOBILE_CTRL_PROXY_APK_PATH = "/tmp/local-accessibility.apk";

      const result = await accessibilityServiceClient.ensureCompatibleVersion();
      expect(result.status).toBe("skipped");
    });

    test("should skip version check when SHA skip flag is true", async function() {
      process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK = "true";

      const result = await accessibilityServiceClient.ensureCompatibleVersion();
      expect(result.status).toBe("skipped");
    });

    test("should skip download when preinstalled APK is allowed", async function() {
      AndroidCtrlProxyManager.setExpectedChecksumForTesting("expected-sha");
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED = "true";

      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, { create: () => localFakeAdb });
      (manager as any).downloadApk = async () => {
        throw new Error("download should not be called");
      };

      const result = await manager.ensureCompatibleVersion();
      expect(result.status).toBe("skipped");
    });

    test("should reinstall when installed SHA cannot be determined", async function() {
      AndroidCtrlProxyManager.setExpectedChecksumForTesting("expected-sha");
      const executedCommands: string[] = [];
      const apkPath = "/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk";

      const localExecAsync = async (command: string) => {
        const prefix = "adb -s test-device ";
        const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
        executedCommands.push(strippedCommand);

        if (strippedCommand.includes("shell pm list packages")) {
          return createExecResult(`package:${AndroidCtrlProxyManager.PACKAGE}\n`, "");
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

      // Create AdbClient with custom executor, wrap in factory
      const localAdbClient = new AdbClient(testDevice, localExecAsync);
      const localFactory: AdbClientFactory = { create: () => localAdbClient };

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, localFactory);
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
      AndroidCtrlProxyManager.setExpectedChecksumForTesting("expected-sha");
      const localFakeAdb = new FakeAdbExecutor();
      localFakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });
      localFakeAdb.setCommandResponse(`shell pm path ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: "package:/data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });
      localFakeAdb.setCommandResponse("shell sha256sum", {
        stdout: "different-sha /data/app/dev.jasonpearson.automobile.ctrlproxy/base.apk\n",
        stderr: ""
      });

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, { create: () => localFakeAdb });
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
      const localApkPath = path.join(tempDir, "control-proxy-debug.apk");

      // Create a valid APK structure (ZIP with AndroidManifest.xml)
      const zip = new AdmZip();
      const manifestContent = '<?xml version="1.0" encoding="utf-8"?><manifest></manifest>';
      zip.addFile("AndroidManifest.xml", Buffer.from(manifestContent, "utf8"));
      // Add padding to ensure size > 10KB
      // Using random data to prevent compression from reducing size too much
      const paddingData = crypto.randomBytes(15000);
      zip.addFile("classes.dex", paddingData);
      zip.writeZip(localApkPath);

      process.env.AUTOMOBILE_CTRL_PROXY_APK_PATH = localApkPath;
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM = "true";

      const apkPath = await accessibilityServiceClient.downloadApk();
      const stats = await fs.stat(apkPath);
      expect(stats.size).toBeGreaterThan(10000);
    });

    test("should download remote APK and verify checksum via injected utilities", async function() {
      // Create a valid APK structure (ZIP with AndroidManifest.xml)
      const zip = new AdmZip();
      const manifestContent = '<?xml version="1.0" encoding="utf-8"?><manifest></manifest>';
      zip.addFile("AndroidManifest.xml", Buffer.from(manifestContent, "utf8"));
      const paddingData = crypto.randomBytes(15000);
      zip.addFile("classes.dex", paddingData);
      const payload = zip.toBuffer();
      const expectedChecksum = crypto.createHash("sha256").update(payload).digest("hex");
      AndroidCtrlProxyManager.setExpectedChecksumForTesting(expectedChecksum);

      // Inject fake FileDownloader that writes the APK payload
      let downloadedPath: string | null = null;
      (accessibilityServiceClient as any).fileDownloader = {
        download: async (_url: string, destination: string) => {
          downloadedPath = destination;
          await fs.mkdir(path.dirname(destination), { recursive: true });
          await fs.writeFile(destination, payload);
        }
      };

      // Inject fake ChecksumCalculator that returns the expected checksum
      (accessibilityServiceClient as any).checksumCalculator = {
        computeFileSha256: async () => ({
          checksum: expectedChecksum,
          source: "node" as const
        })
      };

      const apkPath = await accessibilityServiceClient.downloadApk();
      const stats = await fs.stat(apkPath);
      expect(stats.size).toBe(payload.length);
      expect(apkPath).toBe(downloadedPath);
      await accessibilityServiceClient.cleanupApk(apkPath);
    });

    test("should fail when checksum does not match", async function() {
      // Create a valid APK structure (ZIP with AndroidManifest.xml)
      const zip = new AdmZip();
      const manifestContent = '<?xml version="1.0" encoding="utf-8"?><manifest></manifest>';
      zip.addFile("AndroidManifest.xml", Buffer.from(manifestContent, "utf8"));
      const paddingData = crypto.randomBytes(15000);
      zip.addFile("classes.dex", paddingData);
      const payload = zip.toBuffer();
      const expectedChecksum = crypto.createHash("sha256").update(payload).digest("hex");
      AndroidCtrlProxyManager.setExpectedChecksumForTesting(expectedChecksum);

      // Inject fake FileDownloader that writes the APK payload
      (accessibilityServiceClient as any).fileDownloader = {
        download: async (_url: string, destination: string) => {
          await fs.mkdir(path.dirname(destination), { recursive: true });
          await fs.writeFile(destination, payload);
        }
      };

      // Inject fake ChecksumCalculator that returns a mismatched checksum
      (accessibilityServiceClient as any).checksumCalculator = {
        computeFileSha256: async () => ({
          checksum: "mismatched-checksum",
          source: "node" as const
        })
      };

      await expect(accessibilityServiceClient.downloadApk()).rejects.toThrow(
        "APK checksum verification failed"
      );
    });

    test("should fail when downloaded APK is too small", async function() {
      const payload = Buffer.alloc(250, 5);

      // Inject fake FileDownloader that writes a tiny payload
      (accessibilityServiceClient as any).fileDownloader = {
        download: async (_url: string, destination: string) => {
          await fs.mkdir(path.dirname(destination), { recursive: true });
          await fs.writeFile(destination, payload);
        }
      };

      await expect(accessibilityServiceClient.downloadApk()).rejects.toThrow(
        "Downloaded APK is too small"
      );
    });

    test("should fail when download errors", async function() {
      // Inject fake FileDownloader that throws
      (accessibilityServiceClient as any).fileDownloader = {
        download: async () => {
          throw new Error("download failed");
        }
      };

      await expect(accessibilityServiceClient.downloadApk()).rejects.toThrow(
        "Failed to download APK: download failed"
      );
    });
  });

  describe("setup", function() {
    test("should allow repeated setup when service is already available", async function() {
      process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED = "true";
      fakeAdb.setCommandResponse(`shell pm list packages | grep ${AndroidCtrlProxyManager.PACKAGE}`, {
        stdout: `package:${AndroidCtrlProxyManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`,
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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
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

    test("should invalidate accessibility detector cache after enabling service", async function() {
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
      const fakeDetector = new FakeAccessibilityDetector();
      AndroidCtrlProxyManager.setAccessibilityDetectorForTesting(fakeDetector);

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

      // Verify cache is empty before
      expect(fakeDetector.getInvalidatedDevices()).toEqual([]);

      await accessibilityServiceClient.enableViaSettings();

      // Verify cache was invalidated for our device
      expect(fakeDetector.getInvalidatedDevices()).toEqual(["test-device"]);
    });

    test("should invalidate accessibility detector cache with correct device ID when appending to existing services", async function() {
      const existingServices = "com.example.other/com.example.other.Service";
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
      const expectedServices = `${existingServices}:${serviceComponent}`;
      const fakeDetector = new FakeAccessibilityDetector();
      AndroidCtrlProxyManager.setAccessibilityDetectorForTesting(fakeDetector);

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

      // Verify cache was invalidated for our device
      expect(fakeDetector.getInvalidatedDevices()).toEqual(["test-device"]);
    });

    test("should invalidate accessibility detector cache even when service already enabled", async function() {
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
      const fakeDetector = new FakeAccessibilityDetector();
      AndroidCtrlProxyManager.setAccessibilityDetectorForTesting(fakeDetector);

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

      // Verify cache was still invalidated (even though service was already in list)
      expect(fakeDetector.getInvalidatedDevices()).toEqual(["test-device"]);
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
      const transientFakeAdb: any = {
        executeCommand: async (command: string) => {
          callCount++;
          // First call fails, second call succeeds
          if (callCount <= 2) {
            throw new Error("ADB transient error");
          }

          if (command.includes("ro.kernel.qemu")) {
            return { stdout: "1", stderr: "" };
          }
          if (command.includes("ro.build.version.sdk")) {
            return { stdout: "29", stderr: "" };
          }
          return { stdout: "", stderr: "" };
        }
      };

      AndroidCtrlProxyManager.resetInstances();
      const manager = AndroidCtrlProxyManager.getInstance(testDevice, { create: () => transientFakeAdb });

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;
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
      const serviceComponent = `${AndroidCtrlProxyManager.PACKAGE}/${AndroidCtrlProxyManager.PACKAGE}.CtrlProxy`;

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
