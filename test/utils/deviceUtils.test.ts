import { describe, expect, test } from "bun:test";
import { MultiPlatformDeviceManager } from "../../src/utils/deviceUtils";
import type { DeviceInfo } from "../../src/models";
import { SimCtlClient } from "../../src/utils/ios-cmdline-tools/SimCtlClient";
import { FakeAdbClient } from "../fakes/FakeAdbClient";
import { AdbClient } from "../../src/utils/android-cmdline-tools/AdbClient";

describe("MultiPlatformDeviceManager", () => {
  test("isDeviceImageRunning uses UDID when present for iOS", async () => {
    const fakeSimctl = {
      getBootedSimulators: async () => [{ name: "iPhone 15", platform: "ios", deviceId: "booted-1" }],
      isSimulatorRunning: async () => {
        throw new Error("should not use name-based check when deviceId is present");
      }
    } as unknown as SimCtlClient;

    // Use FakeAdbClient to avoid starting real adb daemon
    const manager = new MultiPlatformDeviceManager(new FakeAdbClient() as unknown as AdbClient, fakeSimctl, null);
    const device: DeviceInfo = {
      name: "iPhone 15",
      platform: "ios",
      isRunning: false,
      deviceId: "booted-1"
    };

    const isRunning = await manager.isDeviceImageRunning(device);

    expect(isRunning).toBe(true);
  });

  test("isDeviceImageRunning falls back to name-based check for iOS without UDID", async () => {
    const fakeSimctl = {
      getBootedSimulators: async () => [],
      isSimulatorRunning: async (name: string) => name === "iPhone 15"
    } as unknown as SimCtlClient;

    // Use FakeAdbClient to avoid starting real adb daemon
    const manager = new MultiPlatformDeviceManager(new FakeAdbClient() as unknown as AdbClient, fakeSimctl, null);
    const device: DeviceInfo = {
      name: "iPhone 15",
      platform: "ios",
      isRunning: false
    };

    const isRunning = await manager.isDeviceImageRunning(device);

    expect(isRunning).toBe(true);
  });
});
