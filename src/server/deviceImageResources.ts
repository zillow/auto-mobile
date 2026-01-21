import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { MultiPlatformDeviceManager, PlatformDeviceManager } from "../utils/deviceUtils";
import { AvdManagerService } from "../utils/android-cmdline-tools/AvdManagerService";
import { AvdManager } from "../utils/android-cmdline-tools/interfaces/AvdManager";
import { logger } from "../utils/logger";
import { DeviceInfo, Platform } from "../models";
import { AvdInfo } from "../utils/android-cmdline-tools/avdmanager";

// Resource URIs
export const DEVICE_IMAGE_RESOURCE_URIS = {
  ALL_IMAGES: "automobile:devices/images",
  PLATFORM_TEMPLATE: "automobile:devices/images/{platform}"
} as const;

// Device image info for resource response
export interface DeviceImageInfo {
  name: string;
  platform: Platform;
  deviceId?: string;
  source: "local";
  // Extended info from AVD Manager (Android only)
  path?: string;
  target?: string;
  basedOn?: string;
  error?: string;
  // iOS simulator metadata (iOS only)
  state?: string;
  isAvailable?: boolean;
  availabilityError?: string;
  iosVersion?: string;
  deviceType?: string;
  runtime?: string;
  model?: string;
  architecture?: string;
}

// Resource content schema
export interface DeviceImagesResourceContent {
  totalCount: number;
  androidCount: number;
  iosCount: number;
  lastUpdated: string;  // ISO 8601
  images: DeviceImageInfo[];
}

// Dependencies interface for dependency injection
export interface DeviceImageResourcesDependencies {
  deviceManager: PlatformDeviceManager;
  avdManager: AvdManager;
}

// Module-level dependencies with lazy initialization to real implementations
let moduleDependencies: DeviceImageResourcesDependencies | null = null;

/**
 * Get the current dependencies, creating defaults if not set
 */
function getDependencies(): DeviceImageResourcesDependencies {
  if (!moduleDependencies) {
    moduleDependencies = {
      deviceManager: new MultiPlatformDeviceManager(),
      avdManager: new AvdManagerService()
    };
  }
  return moduleDependencies;
}

/**
 * Set dependencies for testing
 * @param deps - The dependencies to use (partial, will use defaults for missing)
 */
export function setDeviceImageResourcesDependencies(
  deps: Partial<DeviceImageResourcesDependencies>
): void {
  const currentDeps = getDependencies();
  moduleDependencies = {
    deviceManager: deps.deviceManager ?? currentDeps.deviceManager,
    avdManager: deps.avdManager ?? currentDeps.avdManager
  };
}

/**
 * Reset dependencies to defaults (for testing cleanup)
 */
export function resetDeviceImageResourcesDependencies(): void {
  moduleDependencies = null;
}

/**
 * Create a DeviceImageResourcesHandler with injected dependencies
 * This is the preferred pattern for testing
 */
export function createDeviceImageResourcesHandler(
  deps?: Partial<DeviceImageResourcesDependencies>
): {
  getAllDeviceImages: () => Promise<ResourceContent>;
  getDeviceImagesByPlatform: (params: Record<string, string>) => Promise<ResourceContent>;
  getDeviceImagesForPlatforms: (platforms: Platform[]) => Promise<DeviceImagesResourceContent>;
} {
  const fallbackDeps = getDependencies();
  const deviceManager = deps?.deviceManager ?? fallbackDeps.deviceManager;
  const avdManager = deps?.avdManager ?? fallbackDeps.avdManager;

  const getDeviceImagesForPlatformsImpl = async (platforms: Platform[]): Promise<DeviceImagesResourceContent> => {
    const images: DeviceImageInfo[] = [];
    let androidCount = 0;
    let iosCount = 0;

    try {
      // Fetch Android device images if requested
      if (platforms.includes("android")) {
        try {
          const androidDevices = await deviceManager.listDeviceImages("android");
          let avdInfoList: AvdInfo[] = [];

          // Try to get extended AVD info
          try {
            avdInfoList = await avdManager.listDeviceImages();
          } catch (error) {
            logger.warn(`[DeviceImageResources] Failed to get extended AVD info: ${error}`);
          }

          // Create a map for quick lookup
          const avdInfoMap = new Map<string, AvdInfo>();
          for (const avd of avdInfoList) {
            avdInfoMap.set(avd.name, avd);
          }

          // Merge device info with extended AVD info
          for (const device of androidDevices) {
            const avdInfo = avdInfoMap.get(device.name);
            images.push(toDeviceImageInfo(device, avdInfo));
            androidCount++;
          }
        } catch (error) {
          logger.warn(`[DeviceImageResources] Failed to list Android device images: ${error}`);
        }
      }

      // Fetch iOS simulator images if requested
      if (platforms.includes("ios")) {
        try {
          const iosDevices = await deviceManager.listDeviceImages("ios");
          for (const device of iosDevices) {
            images.push(toDeviceImageInfo(device));
            iosCount++;
          }
        } catch (error) {
          logger.warn(`[DeviceImageResources] Failed to list iOS simulator images: ${error}`);
        }
      }
    } catch (error) {
      logger.error(`[DeviceImageResources] Error fetching device images: ${error}`);
    }

    return {
      totalCount: images.length,
      androidCount,
      iosCount,
      lastUpdated: new Date().toISOString(),
      images
    };
  };

  const getAllDeviceImagesImpl = async (): Promise<ResourceContent> => {
    const result = await getDeviceImagesForPlatformsImpl(["android", "ios"]);
    return {
      uri: DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES,
      mimeType: "application/json",
      text: JSON.stringify(result, null, 2)
    };
  };

  const getDeviceImagesByPlatformImpl = async (params: Record<string, string>): Promise<ResourceContent> => {
    const platform = params.platform;

    // Validate platform parameter
    if (platform !== "android" && platform !== "ios") {
      return {
        uri: `automobile:devices/images/${platform}`,
        mimeType: "application/json",
        text: JSON.stringify({
          error: `Invalid platform: ${platform}. Must be 'android' or 'ios'.`
        }, null, 2)
      };
    }

    const result = await getDeviceImagesForPlatformsImpl([platform as Platform]);
    return {
      uri: `automobile:devices/images/${platform}`,
      mimeType: "application/json",
      text: JSON.stringify(result, null, 2)
    };
  };

  return {
    getAllDeviceImages: getAllDeviceImagesImpl,
    getDeviceImagesByPlatform: getDeviceImagesByPlatformImpl,
    getDeviceImagesForPlatforms: getDeviceImagesForPlatformsImpl
  };
}

// Convert DeviceInfo to DeviceImageInfo, merging with AvdInfo for Android
function toDeviceImageInfo(device: DeviceInfo, avdInfo?: AvdInfo): DeviceImageInfo {
  return {
    name: device.name,
    platform: device.platform,
    deviceId: device.deviceId,
    source: device.source || "local",
    // Extended AVD info (Android only)
    path: avdInfo?.path,
    target: avdInfo?.target,
    basedOn: avdInfo?.basedOn,
    error: avdInfo?.error,
    // iOS simulator metadata
    state: device.state,
    isAvailable: device.isAvailable,
    availabilityError: device.availabilityError,
    iosVersion: device.iosVersion,
    deviceType: device.deviceType,
    runtime: device.runtime,
    model: device.model,
    architecture: device.architecture
  };
}

// Handler to get all device images (both platforms)
async function getAllDeviceImages(): Promise<ResourceContent> {
  const result = await getDeviceImagesForPlatforms(["android", "ios"]);
  return {
    uri: DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES,
    mimeType: "application/json",
    text: JSON.stringify(result, null, 2)
  };
}

// Handler to get device images for a specific platform
async function getDeviceImagesByPlatform(params: Record<string, string>): Promise<ResourceContent> {
  const platform = params.platform;

  // Validate platform parameter
  if (platform !== "android" && platform !== "ios") {
    return {
      uri: `automobile:devices/images/${platform}`,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Invalid platform: ${platform}. Must be 'android' or 'ios'.`
      }, null, 2)
    };
  }

  const result = await getDeviceImagesForPlatforms([platform as Platform]);
  return {
    uri: `automobile:devices/images/${platform}`,
    mimeType: "application/json",
    text: JSON.stringify(result, null, 2)
  };
}

// Core function to fetch device images for specified platforms
async function getDeviceImagesForPlatforms(platforms: Platform[]): Promise<DeviceImagesResourceContent> {
  const { deviceManager, avdManager } = getDependencies();

  const images: DeviceImageInfo[] = [];
  let androidCount = 0;
  let iosCount = 0;

  try {
    // Fetch Android device images if requested
    if (platforms.includes("android")) {
      try {
        const androidDevices = await deviceManager.listDeviceImages("android");
        let avdInfoList: AvdInfo[] = [];

        // Try to get extended AVD info
        try {
          avdInfoList = await avdManager.listDeviceImages();
        } catch (error) {
          logger.warn(`[DeviceImageResources] Failed to get extended AVD info: ${error}`);
        }

        // Create a map for quick lookup
        const avdInfoMap = new Map<string, AvdInfo>();
        for (const avd of avdInfoList) {
          avdInfoMap.set(avd.name, avd);
        }

        // Merge device info with extended AVD info
        for (const device of androidDevices) {
          const avdInfo = avdInfoMap.get(device.name);
          images.push(toDeviceImageInfo(device, avdInfo));
          androidCount++;
        }
      } catch (error) {
        logger.warn(`[DeviceImageResources] Failed to list Android device images: ${error}`);
      }
    }

    // Fetch iOS simulator images if requested
    if (platforms.includes("ios")) {
      try {
        const iosDevices = await deviceManager.listDeviceImages("ios");
        for (const device of iosDevices) {
          images.push(toDeviceImageInfo(device));
          iosCount++;
        }
      } catch (error) {
        logger.warn(`[DeviceImageResources] Failed to list iOS simulator images: ${error}`);
      }
    }
  } catch (error) {
    logger.error(`[DeviceImageResources] Error fetching device images: ${error}`);
  }

  return {
    totalCount: images.length,
    androidCount,
    iosCount,
    lastUpdated: new Date().toISOString(),
    images
  };
}

// Register all device image resources
export function registerDeviceImageResources(): void {
  // Register the all-images resource
  ResourceRegistry.register(
    DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES,
    "Device Images",
    "List of all available device images (AVDs and simulators) that can be used to start devices.",
    "application/json",
    getAllDeviceImages
  );

  // Register the platform-specific template
  ResourceRegistry.registerTemplate(
    DEVICE_IMAGE_RESOURCE_URIS.PLATFORM_TEMPLATE,
    "Platform-specific Device Images",
    "List of available device images for a specific platform (android or ios).",
    "application/json",
    getDeviceImagesByPlatform
  );

  logger.info("[DeviceImageResources] Registered device image resources");
}

export async function notifyDeviceImageResourcesUpdated(): Promise<void> {
  await ResourceRegistry.notifyResourcesUpdated([
    DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES,
    `${DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES}/android`,
    `${DEVICE_IMAGE_RESOURCE_URIS.ALL_IMAGES}/ios`
  ]);
}
