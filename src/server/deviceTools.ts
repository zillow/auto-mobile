import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { MultiPlatformDeviceManager, PlatformDeviceManager } from "../utils/deviceUtils";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, BootedDevice, DeviceInfo, SomePlatform } from "../models";
import { BOOTED_DEVICE_RESOURCE_URIS, notifyBootedDeviceResourcesUpdated } from "./bootedDeviceResources";
import { DEVICE_IMAGE_RESOURCE_URIS } from "./deviceImageResources";
import { syncInstalledAppResources } from "./appResources";

// Schema definitions
export const listDeviceImagesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Platform")
});

export const listDevicesSchema = z.object({
  platform: z.enum(["android", "ios"]).optional().describe("Platform")
});

export const startDeviceSchema = z.object({
  device: z.object({
    name: z.string().describe("Device name"),
    platform: z.enum(["android", "ios"]).describe("Platform"),
    deviceId: z.string().optional().describe("Device ID"),
    isRunning: z.boolean().optional().describe("Running status"),
    source: z.string().optional().describe("Source (local/remote)")
  }).describe("Device to start"),
  timeoutMs: z.number().optional().describe("Readiness timeout ms")
});

export const killDeviceSchema = z.object({
  device: z.object({
    name: z.string().describe("Device image name"),
    deviceId: z.string().describe("Device ID"),
    platform: z.enum(["android", "ios"]).describe("Platform")
  })
});

// Export interfaces for type safety
export interface StartDeviceArgs {
  device: DeviceInfo;
  timeoutMs?: number;
}

export interface KillDeviceArgs {
  device: BootedDevice;
}

export interface ListDeviceImagesArgs {
  platform: SomePlatform;
}

export interface ListDevicesArgs {
  platform?: "android" | "ios";
}

export interface DeviceToolsDependencies {
  deviceManagerFactory: () => PlatformDeviceManager;
}

let moduleDependencies: DeviceToolsDependencies | null = null;

function getDeviceToolsDependencies(): DeviceToolsDependencies {
  if (!moduleDependencies) {
    moduleDependencies = {
      deviceManagerFactory: () => new MultiPlatformDeviceManager()
    };
  }
  return moduleDependencies;
}

export function setDeviceToolsDependencies(deps: Partial<DeviceToolsDependencies>): void {
  const currentDeps = getDeviceToolsDependencies();
  moduleDependencies = {
    deviceManagerFactory: deps.deviceManagerFactory ?? currentDeps.deviceManagerFactory
  };
}

export function resetDeviceToolsDependencies(): void {
  moduleDependencies = null;
}

export function registerDeviceTools() {
  // List AVDs handler
  const listDeviceImagesHandler = async (args: ListDeviceImagesArgs) => {
    try {

      const deviceUtils = getDeviceToolsDependencies().deviceManagerFactory();
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

  const listDevicesHandler = async (args: ListDevicesArgs) => {
    if (args.platform) {
      const bootedResource = `${BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED}/${args.platform}`;
      const imagesResource = `${DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES}/${args.platform}`;

      return createJSONToolResponse({
        message: `To list ${args.platform} devices, query the MCP resources '${bootedResource}' for running devices or '${imagesResource}' for available device images. For all devices, use '${BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED}' or '${DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES}'. Templates are also available: '${BOOTED_DEVICE_RESOURCE_URIS.PLATFORM_TEMPLATE}' and '${DEVICE_IMAGE_RESOURCE_URIS.PLATFORM_TEMPLATE}'.`,
        resources: [
          bootedResource,
          imagesResource,
          BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED,
          DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES,
          BOOTED_DEVICE_RESOURCE_URIS.PLATFORM_TEMPLATE,
          DEVICE_IMAGE_RESOURCE_URIS.PLATFORM_TEMPLATE
        ]
      });
    }

    return createJSONToolResponse({
      message: `To list devices, query the MCP resources '${BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED}' for running devices or '${DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES}' for available device images. For platform-specific queries, use '${BOOTED_DEVICE_RESOURCE_URIS.PLATFORM_TEMPLATE}' or '${DEVICE_IMAGE_RESOURCE_URIS.PLATFORM_TEMPLATE}'.`,
      resources: [
        BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED,
        DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES,
        BOOTED_DEVICE_RESOURCE_URIS.PLATFORM_TEMPLATE,
        DEVICE_IMAGE_RESOURCE_URIS.PLATFORM_TEMPLATE
      ]
    });
  };

  // Start emulator handler
  const startDeviceHandler = async (args: StartDeviceArgs, progress?: ProgressCallback) => {
    try {
      const deviceUtils = getDeviceToolsDependencies().deviceManagerFactory();
      const childProcess = await deviceUtils.startDevice(args.device);

      if (progress) {
        await progress(60, 100, "Device started, waiting for readiness...");
      }

      // Wait for device to be ready
      const readyDevice = await deviceUtils.waitForDeviceReady(args.device, args.timeoutMs);

      if (progress) {
        await progress(100, 100, "Device is ready for use");
      }

      // Notify that booted device resources have changed
      await notifyBootedDeviceResourcesUpdated();
      await syncInstalledAppResources();

      return createJSONToolResponse({
        message: `${args.device.platform} '${args.device.name}' started and is ready`,
        name: readyDevice.name,
        processId: childProcess.pid,
        isReady: true,
        deviceId: readyDevice.deviceId,
        source: args.device.source,
        platform: args.device.platform
      });
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to start ${args.device.platform} device: ${error}`);
    }
  };

  const killDeviceHandler = async (args: KillDeviceArgs) => {
    try {
      const deviceUtils = getDeviceToolsDependencies().deviceManagerFactory();
      await deviceUtils.killDevice(args.device);

      // Clear installed apps cache for this device session
      const { InstalledAppsRepository } = await import("../db/installedAppsRepository");
      const repo = new InstalledAppsRepository();
      await repo.clearDeviceSession(args.device.deviceId);

      // Notify that booted device resources have changed
      await notifyBootedDeviceResourcesUpdated();
      await syncInstalledAppResources();

      return createJSONToolResponse({
        message: `${args.device.platform} '${args.device.name}' shutdown successfully`,
        udid: args.device.name,
        name: args.device.name,
        platform: args.device.platform
      });
    } catch (error) {
      throw new ActionableError(`Failed to kill ${args.device.platform} device: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.register(
    "listDeviceImages",
    "List device images",
    listDeviceImagesSchema,
    listDeviceImagesHandler
  );

  ToolRegistry.register(
    "listDevices",
    "List devices (resource guidance)",
    listDevicesSchema,
    listDevicesHandler
  );

  ToolRegistry.register(
    "startDevice",
    "Start device",
    startDeviceSchema,
    startDeviceHandler,
    true // Supports progress notifications
  );

  ToolRegistry.register(
    "killDevice",
    "Kill device",
    killDeviceSchema,
    killDeviceHandler
  );
}
