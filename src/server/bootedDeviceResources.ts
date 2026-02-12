import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { PlatformDeviceManager } from "../utils/deviceUtils";
import { PlatformDeviceManagerFactory } from "../utils/factories/PlatformDeviceManagerFactory";
import { logger } from "../utils/logger";
import { BootedDevice, Platform } from "../models";
import { DaemonState } from "../daemon/daemonState";
import type { Session } from "../daemon/sessionManager";
import type { DevicePool } from "../daemon/devicePool";
import { AndroidAccessibilityServiceManager } from "../utils/AccessibilityServiceManager";
import { IOSXCTestServiceManager } from "../utils/XCTestServiceManager";
import { APK_SHA256_CHECKSUM, XCTESTSERVICE_SHA256_CHECKSUM } from "../constants/release";
import { defaultTimer } from "../utils/SystemTimer";

// Resource URIs
export const BOOTED_DEVICE_RESOURCE_URIS = {
  ALL_BOOTED: "automobile:devices/booted",
  PLATFORM_TEMPLATE: "automobile:devices/booted/{platform}"
} as const;

// Service status for a booted device
export interface DeviceServiceStatus {
  installed: boolean;
  enabled: boolean;
  running: boolean;
  installedSha256: string | null;
  expectedSha256: string;
  isCompatible: boolean;
}

// Booted device info for resource response
export interface BootedDeviceInfo {
  name: string;
  platform: Platform;
  deviceId: string;
  source: "local" | "remote";
  isVirtual: boolean;
  status: "booted";
  poolStatus?: PoolDeviceStatus;
  assignedSession?: string;
  session?: DeviceSessionInfo;
  serviceStatus?: DeviceServiceStatus;
}

// Resource content schema
export interface BootedDevicesResourceContent {
  totalCount: number;
  androidCount: number;
  iosCount: number;
  virtualCount: number;
  physicalCount: number;
  lastUpdated: string;  // ISO 8601
  poolStatus?: PoolStatusSummary;
  devices: BootedDeviceInfo[];
}

export type PoolDeviceStatus = "idle" | "assigned" | "error";

export interface PoolStatusSummary {
  enabled: boolean;
  idle: number;
  assigned: number;
  error: number;
  total: number;
}

export interface DeviceSessionInfo {
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
  lastHeartbeat: string;
  expiresAt: string;
  heartbeatTimeoutMs: number;
  hasReceivedHeartbeat: boolean;
}

interface PoolDeviceInfo {
  poolStatus: PoolDeviceStatus;
  assignedSession?: string;
}

/**
 * Set a custom device manager for testing
 * @param manager - The device manager to use (or null to reset to default)
 * @deprecated Use PlatformDeviceManagerFactory.setInstance() instead
 */
export function setDeviceManager(manager: PlatformDeviceManager | null): void {
  PlatformDeviceManagerFactory.setInstance(manager);
  // Disable service status queries when using a fake device manager,
  // since the real queries require adb/simctl which aren't available in tests.
  serviceStatusEnabled = manager === null;
}

// Controls whether service status is queried for each device.
// Disabled automatically when a test device manager is injected.
let serviceStatusEnabled = true;

// Convert BootedDevice to BootedDeviceInfo
function toBootedDeviceInfo(
  device: BootedDevice,
  poolInfo?: PoolDeviceInfo,
  sessionInfo?: DeviceSessionInfo
): BootedDeviceInfo {
  const info: BootedDeviceInfo = {
    name: device.name,
    platform: device.platform,
    deviceId: device.deviceId,
    source: device.source || "local",
    isVirtual: isVirtualDevice(device),
    status: "booted"
  };

  if (!poolInfo && !sessionInfo) {
    return info;
  }

  return {
    ...info,
    ...(poolInfo ? {
      poolStatus: poolInfo.poolStatus,
      ...(poolInfo.assignedSession ? { assignedSession: poolInfo.assignedSession } : {})
    } : {}),
    ...(sessionInfo ? { session: sessionInfo } : {})
  };
}

function isVirtualDevice(device: BootedDevice): boolean {
  if (device.platform === "android") {
    return device.deviceId.startsWith("emulator-");
  }

  return device.deviceId.includes("-") && device.deviceId.length > 30;
}

function getPoolDeviceInfo(devicePool: DevicePool | null, deviceId: string): PoolDeviceInfo | undefined {
  if (!devicePool) {
    return undefined;
  }

  const pooledDevice = devicePool.getDevice(deviceId);
  if (!pooledDevice) {
    return undefined;
  }

  const poolStatus: PoolDeviceStatus = pooledDevice.status === "busy"
    ? "assigned"
    : pooledDevice.status;

  return {
    poolStatus,
    assignedSession: pooledDevice.sessionId || undefined
  };
}

function toDeviceSessionInfo(session: Session): DeviceSessionInfo {
  return {
    sessionId: session.sessionId,
    createdAt: new Date(session.createdAt).toISOString(),
    lastUsedAt: new Date(session.lastUsedAt).toISOString(),
    lastHeartbeat: new Date(session.lastHeartbeat).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    heartbeatTimeoutMs: session.heartbeatTimeoutMs,
    hasReceivedHeartbeat: session.hasReceivedHeartbeat
  };
}

// Handler to get all booted devices (both platforms)
async function getAllBootedDevices(): Promise<ResourceContent> {
  const result = await getBootedDevicesForPlatforms(["android", "ios"]);
  return {
    uri: BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED,
    mimeType: "application/json",
    text: JSON.stringify(result, null, 2)
  };
}

// Handler to get booted devices for a specific platform
async function getBootedDevicesByPlatform(params: Record<string, string>): Promise<ResourceContent> {
  const platform = params.platform;

  // Validate platform parameter
  if (platform !== "android" && platform !== "ios") {
    return {
      uri: `automobile:devices/booted/${platform}`,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Invalid platform: ${platform}. Must be 'android' or 'ios'.`
      }, null, 2)
    };
  }

  const result = await getBootedDevicesForPlatforms([platform as Platform]);
  return {
    uri: `automobile:devices/booted/${platform}`,
    mimeType: "application/json",
    text: JSON.stringify(result, null, 2)
  };
}

// Core function to fetch booted devices for specified platforms
async function getBootedDevicesForPlatforms(platforms: Platform[]): Promise<BootedDevicesResourceContent> {
  const devices: BootedDeviceInfo[] = [];
  let androidCount = 0;
  let iosCount = 0;
  let devicePool: DevicePool | null = null;
  let poolStatus: PoolStatusSummary | undefined;
  let sessionInfoByDeviceId: Map<string, DeviceSessionInfo> | null = null;

  const daemonState = DaemonState.getInstance();
  if (daemonState.isInitialized()) {
    try {
      devicePool = daemonState.getDevicePool();
      const stats = devicePool.getStats();
      poolStatus = {
        enabled: true,
        idle: stats.idle,
        assigned: stats.assigned,
        error: stats.error,
        total: stats.total
      };
    } catch (error) {
      logger.warn(`[BootedDeviceResources] Failed to read device pool status: ${error}`);
      devicePool = null;
    }

    try {
      const sessionManager = daemonState.getSessionManager();
      const sessions = sessionManager.getAllSessions();
      sessionInfoByDeviceId = new Map(
        sessions.map(session => [session.assignedDevice, toDeviceSessionInfo(session)])
      );
    } catch (error) {
      logger.warn(`[BootedDeviceResources] Failed to read session manager state: ${error}`);
      sessionInfoByDeviceId = null;
    }
  }

  try {
    // Fetch Android booted devices if requested
    if (platforms.includes("android")) {
      try {
        const androidDevices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("android");
        for (const device of androidDevices) {
          devices.push(
            toBootedDeviceInfo(
              device,
              getPoolDeviceInfo(devicePool, device.deviceId),
              sessionInfoByDeviceId?.get(device.deviceId)
            )
          );
          androidCount++;
        }
      } catch (error) {
        logger.warn(`[BootedDeviceResources] Failed to get booted Android devices: ${error}`);
      }
    }

    // Fetch iOS booted simulators if requested
    if (platforms.includes("ios")) {
      try {
        const iosDevices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("ios");
        for (const device of iosDevices) {
          devices.push(
            toBootedDeviceInfo(
              device,
              getPoolDeviceInfo(devicePool, device.deviceId),
              sessionInfoByDeviceId?.get(device.deviceId)
            )
          );
          iosCount++;
        }
      } catch (error) {
        logger.warn(`[BootedDeviceResources] Failed to get booted iOS simulators: ${error}`);
      }
    }
  } catch (error) {
    logger.error(`[BootedDeviceResources] Error fetching booted devices: ${error}`);
  }

  // Query service status for each device in parallel with per-device timeout
  if (serviceStatusEnabled) {
    const SERVICE_STATUS_TIMEOUT_MS = 5000;
    const serviceStatusResults = await Promise.allSettled(
      devices.map(async device => {
        try {
          return await Promise.race([
            queryDeviceServiceStatus(device),
            new Promise<undefined>(resolve =>
              defaultTimer.setTimeout(() => {
                logger.warn(`[BootedDeviceResources] Service status timeout for ${device.deviceId}`);
                resolve(undefined);
              }, SERVICE_STATUS_TIMEOUT_MS)
            ),
          ]);
        } catch (error) {
          logger.warn(`[BootedDeviceResources] Failed to query service status for ${device.deviceId}: ${error}`);
          return undefined;
        }
      })
    );

    for (let i = 0; i < devices.length; i++) {
      const result = serviceStatusResults[i];
      if (result.status === "fulfilled" && result.value) {
        devices[i] = { ...devices[i], serviceStatus: result.value };
      }
    }
  }

  const virtualCount = devices.filter(device => device.isVirtual).length;
  const physicalCount = devices.length - virtualCount;

  return {
    totalCount: devices.length,
    androidCount,
    iosCount,
    virtualCount,
    physicalCount,
    lastUpdated: new Date().toISOString(),
    poolStatus,
    devices
  };
}

// Query service status for a single booted device
async function queryDeviceServiceStatus(device: BootedDeviceInfo): Promise<DeviceServiceStatus | undefined> {
  const bootedDevice: BootedDevice = {
    name: device.name,
    platform: device.platform,
    deviceId: device.deviceId,
    source: device.source,
  };

  try {
    if (device.platform === "android") {
      const manager = AndroidAccessibilityServiceManager.getInstance(bootedDevice);
      const [installed, enabled, installedSha256] = await Promise.all([
        manager.isInstalled(),
        manager.isEnabled(),
        manager.getInstalledApkSha256(),
      ]);
      const expectedSha256 = APK_SHA256_CHECKSUM;
      const isCompatible = expectedSha256.length === 0 ||
        (installedSha256 !== null && installedSha256.toLowerCase() === expectedSha256.toLowerCase());
      return {
        installed,
        enabled,
        running: installed && enabled,
        installedSha256,
        expectedSha256,
        isCompatible,
      };
    } else if (device.platform === "ios") {
      const manager = IOSXCTestServiceManager.getInstance(bootedDevice);
      const [installed, running] = await Promise.all([
        manager.isInstalled(),
        manager.isRunning(),
      ]);
      const expectedSha256 = XCTESTSERVICE_SHA256_CHECKSUM;
      return {
        installed,
        enabled: running,
        running,
        installedSha256: null,
        expectedSha256,
        isCompatible: running,
      };
    }
  } catch (error) {
    logger.warn(`[BootedDeviceResources] Service status query failed for ${device.deviceId}: ${error}`);
  }
  return undefined;
}

// Register all booted device resources
export function registerBootedDeviceResources(): void {
  // Register the all-booted-devices resource
  ResourceRegistry.register(
    BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED,
    "Booted Devices",
    "List of all currently booted/running devices for both Android and iOS platforms.",
    "application/json",
    getAllBootedDevices
  );

  // Register the platform-specific template
  ResourceRegistry.registerTemplate(
    BOOTED_DEVICE_RESOURCE_URIS.PLATFORM_TEMPLATE,
    "Platform-specific Booted Devices",
    "List of booted/running devices for a specific platform (android or ios).",
    "application/json",
    getBootedDevicesByPlatform
  );

  logger.info("[BootedDeviceResources] Registered booted device resources");
}

// Send notifications for booted device resource updates
export async function notifyBootedDeviceResourcesUpdated(): Promise<void> {
  await ResourceRegistry.notifyResourcesUpdated([
    BOOTED_DEVICE_RESOURCE_URIS.ALL_BOOTED
  ]);
}
