import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { checkAccessibilityService } from "../../src/doctor/checks/automobile";
import { AndroidAccessibilityServiceManager } from "../../src/utils/AccessibilityServiceManager";
import { AdbClient } from "../../src/utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../src/models";

describe("AutoMobile doctor checks", () => {
  const device: BootedDevice = {
    name: "device-1",
    deviceId: "device-1",
    platform: "android"
  };

  let originalGetBootedDevices: typeof AdbClient.prototype.getBootedAndroidDevices;
  let originalEnsureCompatible: typeof AndroidAccessibilityServiceManager.prototype.ensureCompatibleVersion;
  let originalIsInstalled: typeof AndroidAccessibilityServiceManager.prototype.isInstalled;
  let originalIsEnabled: typeof AndroidAccessibilityServiceManager.prototype.isEnabled;

  beforeEach(() => {
    originalGetBootedDevices = AdbClient.prototype.getBootedAndroidDevices;
    AdbClient.prototype.getBootedAndroidDevices = async () => [device];

    originalEnsureCompatible = AndroidAccessibilityServiceManager.prototype.ensureCompatibleVersion;
    originalIsInstalled = AndroidAccessibilityServiceManager.prototype.isInstalled;
    originalIsEnabled = AndroidAccessibilityServiceManager.prototype.isEnabled;
  });

  afterEach(() => {
    AdbClient.prototype.getBootedAndroidDevices = originalGetBootedDevices;
    AndroidAccessibilityServiceManager.prototype.ensureCompatibleVersion = originalEnsureCompatible;
    AndroidAccessibilityServiceManager.prototype.isInstalled = originalIsInstalled;
    AndroidAccessibilityServiceManager.prototype.isEnabled = originalIsEnabled;
  });

  test("should warn when accessibility service APK is unavailable offline", async () => {
    AndroidAccessibilityServiceManager.prototype.ensureCompatibleVersion = async () => ({
      status: "failed",
      downloadUnavailable: true,
      expectedSha256: "expected"
    });
    AndroidAccessibilityServiceManager.prototype.isInstalled = async () => true;
    AndroidAccessibilityServiceManager.prototype.isEnabled = async () => true;

    const result = await checkAccessibilityService();

    expect(result.status).toBe("warn");
    expect(result.recommendation).toContain("offline");
  });
});
