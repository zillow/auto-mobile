import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { DeviceUtils } from "../utils/deviceUtils";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, BootedDevice, DeviceInfo, SomePlatform } from "../models";
import {
  listSystemImages,
  installSystemImage,
  createAvd,
  COMMON_SYSTEM_IMAGES,
  COMMON_DEVICES,
  CreateAvdParams
} from "../utils/android-cmdline-tools/avdmanager";
import { logger } from "../utils/logger";

// Schema definitions
export const listDeviceImagesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const listDevicesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const startDeviceSchema = z.object({
  localDevice: z.object({
    name: z.string().describe("The device name to start"),
    deviceId: z.string().optional().describe("The device ID")
  }),
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const killDeviceSchema = z.object({
  device: z.object({
    name: z.string().describe("The device image name to kill"),
    deviceId: z.string().describe("The device unique ID"),
    platform: z.enum(["android", "ios"]).describe("Target platform")
  })
});

// Export interfaces for type safety
export interface startDeviceArgs {
  device: DeviceInfo;
  timeoutMs?: number;
}

export interface KillDeviceArgs {
  device: BootedDevice;
}

export interface ListDevicesArgs {
  platform: SomePlatform;
}

export interface listDeviceImagesArgs {
  platform: SomePlatform;
}

export function registerDeviceTools() {
  // List all connected devices (physical and emulators) handler
  const listBootedDevicesHandler = async (args: ListDevicesArgs) => {
    try {
      const deviceUtils = new DeviceUtils();
      const bootedDevices = await deviceUtils.getBootedDevices(args.platform);

      // Categorize devices by type
      const devices = bootedDevices.map(device => {
        // For Android: emulator devices have deviceId starting with "emulator-"
        // For iOS: simulator devices typically have deviceId as UUID format or contain "simulator"
        const isVirtual = args.platform === "android"
          ? device.deviceId.startsWith("emulator-")
          : device.deviceId.includes("-") && device.deviceId.length > 30; // iOS simulators typically have long UUID-like IDs

        return {
          ...device,
          isVirtual
        };
      });

      const virtualCount = devices.filter(d => d.isVirtual).length;
      const physicalCount = devices.filter(d => !d.isVirtual).length;

      return createJSONToolResponse({
        message: `Found ${devices.length} connected ${args.platform} devices`,
        devices: devices,
        totalCount: devices.length,
        virtualCount: virtualCount,
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

      if (progress) {
        await progress(60, 100, "Device started, waiting for readiness...");
      }

      // Wait for device to be ready
      const readyDevice = await deviceUtils.waitForDeviceReady(args.device, args.timeoutMs);

      if (progress) {
        await progress(100, 100, "Device is ready for use");
      }

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
      throw new ActionableError(`Failed to start ${args.device.platform} device: ${error}`);
    }
  };

  const killDeviceHandler = async (args: KillDeviceArgs) => {
    try {
      const deviceUtils = new DeviceUtils();
      await deviceUtils.killDevice(args.device);
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
    "listDevices",
    "List all connected devices (both physical and virtual devices)",
    listDevicesSchema,
    listBootedDevicesHandler
  );

  ToolRegistry.register(
    "listDeviceImages",
    "List all available device images for the specified platform",
    listDeviceImagesSchema,
    listDeviceImagesHandler
  );

  ToolRegistry.register(
    "startDevice",
    "Start a device with the specified device image",
    startDeviceSchema,
    startDeviceHandler,
    true // Supports progress notifications
  );

  ToolRegistry.register(
    "killDevice",
    "Kill a running device",
    killDeviceSchema,
    killDeviceHandler
  );
}

/**
 * Create an AVD with automatic system image downloading
 */
async function createAvdWithSystemImageDownload(
  avdName: string,
  progress?: ProgressCallback
): Promise<{ success: boolean; message: string }> {
  try {
    if (progress) {
      await progress(20, 100, "Checking available system images...");
    }

    // List available system images
    const availableImages = await listSystemImages();
    logger.info(`Found ${availableImages.length} available system images`);

    // Try to find a suitable system image (prefer latest API with Google APIs)
    const preferredImages = [
      COMMON_SYSTEM_IMAGES.API_35.GOOGLE_APIS_ARM64, // For Apple Silicon Macs
      COMMON_SYSTEM_IMAGES.API_35.GOOGLE_APIS_X86_64, // For Intel Macs
      COMMON_SYSTEM_IMAGES.API_34.GOOGLE_APIS_ARM64,
      COMMON_SYSTEM_IMAGES.API_34.GOOGLE_APIS_X86_64,
    ];

    let selectedImage: string | null = null;
    let isImageAvailable = false;

    // Check if any preferred image is already available
    for (const imagePackage of preferredImages) {
      const isAvailable = availableImages.some(img => img.packageName === imagePackage);
      if (isAvailable) {
        selectedImage = imagePackage;
        isImageAvailable = true;
        logger.info(`Found available system image: ${imagePackage}`);
        break;
      }
    }

    // If no preferred image is available, download the first one
    if (!isImageAvailable && selectedImage === null) {
      selectedImage = preferredImages[0]; // Default to ARM64 API 35

      if (progress) {
        await progress(30, 100, `Downloading system image: ${selectedImage}...`);
      }

      logger.info(`Downloading system image: ${selectedImage}`);
      const downloadResult = await installSystemImage(selectedImage, true);

      if (!downloadResult.success) {
        // Try the next preferred image
        selectedImage = preferredImages[1]; // Try x86_64

        if (progress) {
          await progress(35, 100, `Downloading alternative system image: ${selectedImage}...`);
        }

        logger.info(`First download failed, trying alternative: ${selectedImage}`);
        const altDownloadResult = await installSystemImage(selectedImage, true);

        if (!altDownloadResult.success) {
          return {
            success: false,
            message: `Failed to download any suitable system image. Last error: ${altDownloadResult.message}`
          };
        }
      }

      if (progress) {
        await progress(70, 100, "System image downloaded successfully");
      }
    }

    if (!selectedImage) {
      return {
        success: false,
        message: "No suitable system image found or could be downloaded"
      };
    }

    if (progress) {
      await progress(80, 100, `Creating AVD '${avdName}' with system image...`);
    }

    // Create the AVD with the selected system image
    const createParams: CreateAvdParams = {
      name: avdName,
      package: selectedImage,
      device: COMMON_DEVICES.PIXEL_7, // Use a modern device profile
      force: true // Overwrite if exists
    };

    const createResult = await createAvd(createParams);

    if (progress) {
      await progress(95, 100, "AVD creation completed");
    }

    if (createResult.success) {
      logger.info(`Successfully created AVD '${avdName}' with system image '${selectedImage}'`);
      return {
        success: true,
        message: `AVD '${avdName}' created with system image '${selectedImage}'`
      };
    } else {
      return {
        success: false,
        message: `Failed to create AVD: ${createResult.message}`
      };
    }

  } catch (error) {
    logger.error(`Failed to create AVD with system image download: ${error}`);
    return {
      success: false,
      message: `Failed to create AVD with system image download: ${error}`
    };
  }
}
