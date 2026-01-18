import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FakeDeviceUtils } from "../../fakes/FakeDeviceUtils";
import { FakeAvdManager } from "../../fakes/FakeAvdManager";
import {
  createDeviceImageResourcesHandler,
  setDeviceImageResourcesDependencies,
  resetDeviceImageResourcesDependencies,
  DeviceImagesResourceContent
} from "../../../src/server/deviceImageResources";
import { DeviceInfo } from "../../../src/models";
import { AvdInfo } from "../../../src/utils/android-cmdline-tools/avdmanager";

describe("Device Image Resources with Fakes", () => {
  let fakeDeviceUtils: FakeDeviceUtils;
  let fakeAvdManager: FakeAvdManager;

  beforeEach(() => {
    fakeDeviceUtils = new FakeDeviceUtils();
    fakeAvdManager = new FakeAvdManager();
    setDeviceImageResourcesDependencies({
      deviceManager: fakeDeviceUtils,
      avdManager: fakeAvdManager
    });
  });

  afterEach(() => {
    resetDeviceImageResourcesDependencies();
  });

  describe("createDeviceImageResourcesHandler", () => {
    test("should return correct image counts when there are images", async () => {
      // Set up mock Android devices
      const androidDevices: DeviceInfo[] = [
        { name: "Pixel_6_API_33", platform: "android", deviceId: "avd-1", source: "local" },
        { name: "Pixel_7_API_34", platform: "android", deviceId: "avd-2", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);

      // Set up mock iOS devices
      const iosDevices: DeviceInfo[] = [
        { name: "iPhone 14", platform: "ios", deviceId: "sim-1", source: "local" },
        { name: "iPhone 15 Pro", platform: "ios", deviceId: "sim-2", source: "local" },
        { name: "iPad Pro", platform: "ios", deviceId: "sim-3", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);

      // Set up mock AVD info (no extended info for simplicity)
      fakeAvdManager.setListDeviceImagesResponse([]);

      // Create handler with fakes
      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      // Get all device images
      const result = await handler.getDeviceImagesForPlatforms(["android", "ios"]);

      // Verify counts
      expect(result.totalCount).toBe(5);
      expect(result.androidCount).toBe(2);
      expect(result.iosCount).toBe(3);
      expect(result.images).toHaveLength(5);

      // Verify lastUpdated is a valid ISO date
      expect(() => new Date(result.lastUpdated)).not.toThrow();
      expect(new Date(result.lastUpdated).toISOString()).toBe(result.lastUpdated);
    });

    test("should return empty counts when there are no images", async () => {
      // Set up empty device lists
      fakeDeviceUtils.setDeviceImages("android", []);
      fakeDeviceUtils.setDeviceImages("ios", []);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesForPlatforms(["android", "ios"]);

      expect(result.totalCount).toBe(0);
      expect(result.androidCount).toBe(0);
      expect(result.iosCount).toBe(0);
      expect(result.images).toHaveLength(0);
    });

    test("should filter to android platform only", async () => {
      // Set up mock devices for both platforms
      const androidDevices: DeviceInfo[] = [
        { name: "Pixel_6_API_33", platform: "android", deviceId: "avd-1", source: "local" }
      ];
      const iosDevices: DeviceInfo[] = [
        { name: "iPhone 14", platform: "ios", deviceId: "sim-1", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      // Request only Android
      const result = await handler.getDeviceImagesForPlatforms(["android"]);

      expect(result.totalCount).toBe(1);
      expect(result.androidCount).toBe(1);
      expect(result.iosCount).toBe(0);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].platform).toBe("android");
      expect(result.images[0].name).toBe("Pixel_6_API_33");
    });

    test("should filter to ios platform only", async () => {
      // Set up mock devices for both platforms
      const androidDevices: DeviceInfo[] = [
        { name: "Pixel_6_API_33", platform: "android", deviceId: "avd-1", source: "local" }
      ];
      const iosDevices: DeviceInfo[] = [
        { name: "iPhone 14", platform: "ios", deviceId: "sim-1", source: "local" },
        { name: "iPhone 15", platform: "ios", deviceId: "sim-2", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      // Request only iOS
      const result = await handler.getDeviceImagesForPlatforms(["ios"]);

      expect(result.totalCount).toBe(2);
      expect(result.androidCount).toBe(0);
      expect(result.iosCount).toBe(2);
      expect(result.images).toHaveLength(2);
      for (const image of result.images) {
        expect(image.platform).toBe("ios");
      }
    });

    test("should pass through iOS simulator metadata", async () => {
      const iosDevices: DeviceInfo[] = [
        {
          name: "iPhone 15 Pro",
          platform: "ios",
          deviceId: "sim-15-pro",
          source: "local",
          state: "Booted",
          iosVersion: "17.4",
          deviceType: "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro"
        }
      ];
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesForPlatforms(["ios"]);
      expect(result.totalCount).toBe(1);
      expect(result.images[0].state).toBe("Booted");
      expect(result.images[0].iosVersion).toBe("17.4");
      expect(result.images[0].deviceType).toBe("com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro");
    });

    test("should include extended AVD metadata for Android images", async () => {
      // Set up mock Android devices
      const androidDevices: DeviceInfo[] = [
        { name: "Pixel_6_API_33", platform: "android", deviceId: "avd-1", source: "local" },
        { name: "Pixel_7_API_34", platform: "android", deviceId: "avd-2", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);

      // Set up extended AVD info
      const avdInfoList: AvdInfo[] = [
        {
          name: "Pixel_6_API_33",
          path: "/Users/test/.android/avd/Pixel_6_API_33.avd",
          target: "Google APIs (Google Inc.)",
          basedOn: "Android 13.0 (API 33)"
        },
        {
          name: "Pixel_7_API_34",
          path: "/Users/test/.android/avd/Pixel_7_API_34.avd",
          target: "Google Play (Google Inc.)",
          basedOn: "Android 14 (API 34)",
          error: undefined
        }
      ];
      fakeAvdManager.setListDeviceImagesResponse(avdInfoList);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesForPlatforms(["android"]);

      expect(result.totalCount).toBe(2);
      expect(result.androidCount).toBe(2);

      // Verify extended metadata for first device
      const pixel6 = result.images.find(img => img.name === "Pixel_6_API_33");
      expect(pixel6).toBeDefined();
      expect(pixel6?.path).toBe("/Users/test/.android/avd/Pixel_6_API_33.avd");
      expect(pixel6?.target).toBe("Google APIs (Google Inc.)");
      expect(pixel6?.basedOn).toBe("Android 13.0 (API 33)");

      // Verify extended metadata for second device
      const pixel7 = result.images.find(img => img.name === "Pixel_7_API_34");
      expect(pixel7).toBeDefined();
      expect(pixel7?.path).toBe("/Users/test/.android/avd/Pixel_7_API_34.avd");
      expect(pixel7?.target).toBe("Google Play (Google Inc.)");
      expect(pixel7?.basedOn).toBe("Android 14 (API 34)");
    });

    test("should handle AVD info with errors", async () => {
      // Set up mock Android device
      const androidDevices: DeviceInfo[] = [
        { name: "Corrupted_AVD", platform: "android", deviceId: "avd-err", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);

      // Set up AVD info with an error
      const avdInfoList: AvdInfo[] = [
        {
          name: "Corrupted_AVD",
          path: "/Users/test/.android/avd/Corrupted_AVD.avd",
          error: "Error: config.ini is missing"
        }
      ];
      fakeAvdManager.setListDeviceImagesResponse(avdInfoList);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesForPlatforms(["android"]);

      expect(result.totalCount).toBe(1);
      const corruptedAvd = result.images[0];
      expect(corruptedAvd.name).toBe("Corrupted_AVD");
      expect(corruptedAvd.error).toBe("Error: config.ini is missing");
    });

    test("should handle missing AVD info gracefully", async () => {
      // Set up mock Android devices
      const androidDevices: DeviceInfo[] = [
        { name: "Device_Without_AVD_Info", platform: "android", deviceId: "avd-1", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);

      // No matching AVD info
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesForPlatforms(["android"]);

      expect(result.totalCount).toBe(1);
      const device = result.images[0];
      expect(device.name).toBe("Device_Without_AVD_Info");
      expect(device.platform).toBe("android");
      // Extended fields should be undefined when no AVD info match
      expect(device.path).toBeUndefined();
      expect(device.target).toBeUndefined();
      expect(device.basedOn).toBeUndefined();
    });

    test("should not include extended AVD metadata for iOS images", async () => {
      // Set up mock iOS devices
      const iosDevices: DeviceInfo[] = [
        { name: "iPhone 14", platform: "ios", deviceId: "sim-1", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);

      // AVD info should not be used for iOS
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesForPlatforms(["ios"]);

      expect(result.totalCount).toBe(1);
      const iosDevice = result.images[0];
      expect(iosDevice.platform).toBe("ios");
      // Extended AVD fields should be undefined for iOS
      expect(iosDevice.path).toBeUndefined();
      expect(iosDevice.target).toBeUndefined();
      expect(iosDevice.basedOn).toBeUndefined();
    });
  });

  describe("getAllDeviceImages", () => {
    test("should return ResourceContent with all device images", async () => {
      const androidDevices: DeviceInfo[] = [
        { name: "Pixel_6", platform: "android", deviceId: "avd-1", source: "local" }
      ];
      const iosDevices: DeviceInfo[] = [
        { name: "iPhone 14", platform: "ios", deviceId: "sim-1", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getAllDeviceImages();

      expect(result.uri).toBe("automobile:devices/images");
      expect(result.mimeType).toBe("application/json");
      expect(result.text).toBeDefined();

      const data: DeviceImagesResourceContent = JSON.parse(result.text!);
      expect(data.totalCount).toBe(2);
      expect(data.androidCount).toBe(1);
      expect(data.iosCount).toBe(1);
    });
  });

  describe("getDeviceImagesByPlatform", () => {
    test("should return android-specific images via platform param", async () => {
      const androidDevices: DeviceInfo[] = [
        { name: "Pixel_6", platform: "android", deviceId: "avd-1", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);
      fakeDeviceUtils.setDeviceImages("ios", []);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesByPlatform({ platform: "android" });

      expect(result.uri).toBe("automobile:devices/images/android");
      expect(result.mimeType).toBe("application/json");

      const data: DeviceImagesResourceContent = JSON.parse(result.text!);
      expect(data.androidCount).toBe(1);
      expect(data.iosCount).toBe(0);
    });

    test("should return ios-specific images via platform param", async () => {
      const iosDevices: DeviceInfo[] = [
        { name: "iPhone 14", platform: "ios", deviceId: "sim-1", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", []);
      fakeDeviceUtils.setDeviceImages("ios", iosDevices);
      fakeAvdManager.setListDeviceImagesResponse([]);

      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesByPlatform({ platform: "ios" });

      expect(result.uri).toBe("automobile:devices/images/ios");
      expect(result.mimeType).toBe("application/json");

      const data: DeviceImagesResourceContent = JSON.parse(result.text!);
      expect(data.androidCount).toBe(0);
      expect(data.iosCount).toBe(1);
    });

    test("should return error for invalid platform", async () => {
      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils,
        avdManager: fakeAvdManager
      });

      const result = await handler.getDeviceImagesByPlatform({ platform: "windows" });

      expect(result.uri).toBe("automobile:devices/images/windows");
      expect(result.mimeType).toBe("application/json");

      const data = JSON.parse(result.text!);
      expect(data.error).toBeDefined();
      expect(data.error).toContain("Invalid platform");
      expect(data.error).toContain("windows");
    });
  });

  describe("Partial dependency injection", () => {
    test("should allow providing only deviceManager", async () => {
      const androidDevices: DeviceInfo[] = [
        { name: "Test_AVD", platform: "android", deviceId: "avd-test", source: "local" }
      ];
      fakeDeviceUtils.setDeviceImages("android", androidDevices);

      // Only provide deviceManager, avdManager will be defaulted
      const handler = createDeviceImageResourcesHandler({
        deviceManager: fakeDeviceUtils
      });

      const result = await handler.getDeviceImagesForPlatforms(["android"]);

      expect(result.totalCount).toBe(1);
      expect(result.images[0].name).toBe("Test_AVD");
    });

    test("should allow providing only avdManager", async () => {
      const avdInfoList: AvdInfo[] = [
        {
          name: "Pixel_Test",
          path: "/path/to/avd",
          target: "Google APIs"
        }
      ];
      fakeAvdManager.setListDeviceImagesResponse(avdInfoList);

      // Only provide avdManager - deviceManager will be defaulted
      // Note: This test verifies partial DI works but won't produce faked device data
      // since we're using the real device manager
      const handler = createDeviceImageResourcesHandler({
        avdManager: fakeAvdManager
      });

      // The handler was created successfully with partial deps
      expect(handler).toBeDefined();
      expect(handler.getAllDeviceImages).toBeDefined();
      expect(handler.getDeviceImagesByPlatform).toBeDefined();
      expect(handler.getDeviceImagesForPlatforms).toBeDefined();
    });
  });
});
