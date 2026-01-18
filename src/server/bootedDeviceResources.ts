import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { MultiPlatformDeviceManager, PlatformDeviceManager } from "../utils/deviceUtils";
import { logger } from "../utils/logger";
import { BootedDevice, Platform } from "../models";
import { DaemonState } from "../daemon/daemonState";
import type { Session } from "../daemon/sessionManager";
import type { DevicePool } from "../daemon/devicePool";

// Resource URIs
export const BOOTED_DEVICE_RESOURCE_URIS = {
  ALL_BOOTED: "automobile:devices/booted",
  PLATFORM_TEMPLATE: "automobile:devices/booted/{platform}"
} as const;

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

// Module-level device manager for dependency injection
let deviceManager: PlatformDeviceManager = new MultiPlatformDeviceManager();

/**
 * Set a custom device manager for testing
 * @param manager - The device manager to use (or null to reset to default)
 */
export function setDeviceManager(manager: PlatformDeviceManager | null): void {
  if (manager === null) {
    deviceManager = new MultiPlatformDeviceManager();
  } else {
    deviceManager = manager;
  }
}

/**
 * Get the current device manager (for testing purposes)
 */
export function getDeviceManager(): PlatformDeviceManager {
  return deviceManager;
}

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
        const androidDevices = await deviceManager.getBootedDevices("android");
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
        const iosDevices = await deviceManager.getBootedDevices("ios");
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
