import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { DeviceUtils } from "../utils/deviceUtils";
import { createJSONToolResponse } from "../utils/toolUtils";
import { BootedDevice, DeviceInfo, SomePlatform } from "../models";

// Schema definitions
export const listDeviceImagesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const listDevicesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const startDeviceSchema = z.object({
  device: z.object({
    name: z.string().describe("The device name to start"),
    deviceId: z.string().optional().describe("The device ID"),
    source: z.string().describe("The source of the device (e.g., 'local', 'remote', etc.')"),
    platform: z.enum(["android", "ios"]).describe("Target platform")
  }),
  timeoutMs: z.number().optional().default(120000).describe("Maximum time to wait for emulator to be ready in milliseconds"),
});

export const killEmulatorSchema = z.object({
  device: z.object({
    name: z.string().describe("The device name to kill"),
    deviceId: z.string().describe("The device ID"),
    platform: z.enum(["android", "ios"]).describe("Target platform")
  })
});

// Export interfaces for type safety
export interface startDeviceArgs {
  device: DeviceInfo;
  timeoutMs?: number;
}

export interface KillEmulatorArgs {
  device: BootedDevice;
}

export interface ListDevicesArgs {
  platform: SomePlatform;
}

export interface listDeviceImagesArgs {
  platform: SomePlatform;
}

// Register emulator tools
export function registerEmulatorTools() {
  // List all connected devices (physical and emulators) handler
  const listBootedDevicesHandler = async (args: ListDevicesArgs) => {
    try {
      const deviceUtils = new DeviceUtils();
      const bootedDevices = await deviceUtils.getBootedDevices(args.platform);

      // Categorize devices by type
      const devices = bootedDevices.map(device => {
        // For Android: emulator devices have deviceId starting with "emulator-"
        // For iOS: simulator devices typically have deviceId as UUID format or contain "simulator"
        const isEmulator = args.platform === "android"
          ? device.deviceId.startsWith("emulator-")
          : device.deviceId.includes("-") && device.deviceId.length > 30; // iOS simulators typically have long UUID-like IDs

        return {
          ...device,
          isEmulator
        };
      });

      const emulatorCount = devices.filter(d => d.isEmulator).length;
      const physicalCount = devices.filter(d => !d.isEmulator).length;

      return createJSONToolResponse({
        message: `Found ${devices.length} connected ${args.platform} devices`,
        devices: devices,
        totalCount: devices.length,
        emulatorCount: emulatorCount,
        physicalCount: physicalCount,
        platform: args.platform
      });
    } catch (error) {
      throw new ActionableError(`Failed to list ${args.platform} devices: ${error}`);
    }
  };

  // List AVDs handler
  const listDeviceImagesHandler = async (args: listDeviceImagesArgs) => {
    try {

      const deviceUtils = new DeviceUtils();
      const imageList = await deviceUtils.listDeviceImages(args.platform);

      return createJSONToolResponse({
        message: `Found ${imageList.length} available ${args.platform} AVDs`,
        images: imageList,
        count: imageList.length,
        platform: args.platform
      });
    } catch (error) {
      throw new ActionableError(`Failed to list ${args.platform} AVDs: ${error}`);
    }
  };

  // Start emulator handler
  const startDeviceHandler = async (args: startDeviceArgs, progress?: ProgressCallback) => {
    try {
      const deviceUtils = new DeviceUtils();
      const childProcess = await deviceUtils.startDevice(args.device);

      return createJSONToolResponse({
        message: `${args.device.platform} '${args.device.name}' started and is ready`,
        name: args.device.name,
        processId: childProcess.pid,
        isReady: true,
        deviceId: args.device.deviceId,
        source: args.device.source,
        platform: args.device.platform
      });
    } catch (error) {
      throw new ActionableError(`Failed to start ${args.device.platform} device: ${error}`);
    }
  };

  // Kill emulator handler
  const killEmulatorHandler = async (device: BootedDevice, args: KillEmulatorArgs) => {
    try {
      const deviceUtils = new DeviceUtils();
      await deviceUtils.killDevice(device);
      return createJSONToolResponse({
        message: `${device.platform} '${device.name}' shutdown successfully`,
        udid: device.name,
        name: device.name,
        platform: device.platform
      });
    } catch (error) {
      throw new ActionableError(`Failed to kill ${device.platform} emulator: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.register(
    "listDevices",
    "List all connected devices (both physical devices and emulators)",
    listDevicesSchema,
    listBootedDevicesHandler
  );

  ToolRegistry.register(
    "listDeviceImages",
    "List all available Android Virtual Devices (AVDs)",
    listDeviceImagesSchema,
    listDeviceImagesHandler
  );

  ToolRegistry.register(
    "startDevice",
    "Start an Android emulator with the specified AVD",
    startDeviceSchema,
    startDeviceHandler,
    true // Supports progress notifications
  );

  ToolRegistry.registerDeviceAware(
    "killEmulator",
    "Kill a running Android emulator",
    killEmulatorSchema,
    killEmulatorHandler
  );
}
