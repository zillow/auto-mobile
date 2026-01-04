import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { MultiPlatformDeviceManager, PlatformDeviceManager } from "../utils/deviceUtils";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { BootedDevice, InstalledApp, Platform } from "../models";
import { logger } from "../utils/logger";

// Resource URI templates
export const APP_RESOURCE_TEMPLATES = {
  DEVICE_APPS: "automobile://devices/{deviceId}/apps",
  DEVICE_APP: "automobile://devices/{deviceId}/apps/{packageName}"
} as const;

// Resource content schema
export interface AppsResourceContent {
  deviceId: string;
  platform: Platform;
  apps: InstalledAppInfo[];
  totalCount: number;
  foregroundApp: string | null;
  lastUpdated: string; // ISO 8601
}

export interface InstalledAppInfo {
  packageName: string;
  userId: number;
  userProfile: "personal" | "work";
  foreground: boolean;
  recent: boolean;
}

interface AppsCacheEntry {
  expiresAt: number;
  content: AppsResourceContent;
  appsByPackage: Map<string, InstalledAppInfo[]>;
}

const APPS_CACHE_TTL_MS = 60000;
const appCacheByDeviceId = new Map<string, AppsCacheEntry>();
const registeredDeviceResources = new Map<string, string>();
let deviceManager: PlatformDeviceManager = new MultiPlatformDeviceManager();

function userProfileForUserId(userId: number): "personal" | "work" {
  return userId >= 10 ? "work" : "personal";
}

function toInstalledAppInfo(app: InstalledApp): InstalledAppInfo {
  return {
    packageName: app.packageName,
    userId: app.userId,
    userProfile: userProfileForUserId(app.userId),
    foreground: app.foreground,
    recent: app.recent
  };
}

function buildAppsByPackage(apps: InstalledAppInfo[]): Map<string, InstalledAppInfo[]> {
  const appsByPackage = new Map<string, InstalledAppInfo[]>();
  for (const app of apps) {
    const existing = appsByPackage.get(app.packageName);
    if (existing) {
      existing.push(app);
    } else {
      appsByPackage.set(app.packageName, [app]);
    }
  }
  return appsByPackage;
}

function getDeviceAppsUri(deviceId: string): string {
  return `automobile://devices/${deviceId}/apps`;
}

function createAppsResourceContent(
  device: BootedDevice,
  apps: InstalledAppInfo[],
  foregroundApp: string | null,
  lastUpdated: string
): AppsResourceContent {
  return {
    deviceId: device.deviceId,
    platform: device.platform,
    apps,
    totalCount: apps.length,
    foregroundApp,
    lastUpdated
  };
}

async function findBootedDevice(deviceId: string): Promise<BootedDevice | null> {
  try {
    const devices = await deviceManager.getBootedDevices("either");
    return devices.find(device => device.deviceId === deviceId) ?? null;
  } catch (error) {
    logger.warn(`[AppResources] Failed to list booted devices: ${error}`);
    return null;
  }
}

async function fetchAppsForDevice(device: BootedDevice): Promise<AppsCacheEntry> {
  const listInstalledApps = new ListInstalledApps(device);
  const lastUpdated = new Date().toISOString();

  if (device.platform === "android") {
    const installedApps = await listInstalledApps.executeDetailed();
    const apps = installedApps.map(toInstalledAppInfo);
    const foregroundApp = apps.find(app => app.foreground)?.packageName ?? null;

    return {
      expiresAt: Date.now() + APPS_CACHE_TTL_MS,
      content: createAppsResourceContent(device, apps, foregroundApp, lastUpdated),
      appsByPackage: buildAppsByPackage(apps)
    };
  }

  const installedApps = await listInstalledApps.execute();
  const apps = installedApps.map(packageName => ({
    packageName,
    userId: 0,
    userProfile: "personal" as const,
    foreground: false,
    recent: false
  }));

  return {
    expiresAt: Date.now() + APPS_CACHE_TTL_MS,
    content: createAppsResourceContent(device, apps, null, lastUpdated),
    appsByPackage: buildAppsByPackage(apps)
  };
}

async function ensureAppsCacheEntry(deviceId: string): Promise<AppsCacheEntry | null> {
  const cached = appCacheByDeviceId.get(deviceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const device = await findBootedDevice(deviceId);
  if (!device) {
    return null;
  }

  const entry = await fetchAppsForDevice(device);
  appCacheByDeviceId.set(deviceId, entry);
  return entry;
}

async function getAppsResource(deviceId: string): Promise<ResourceContent> {
  const cacheEntry = await ensureAppsCacheEntry(deviceId);
  if (!cacheEntry) {
    return {
      uri: getDeviceAppsUri(deviceId),
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Device not found or not booted: ${deviceId}`
      }, null, 2)
    };
  }

  return {
    uri: getDeviceAppsUri(deviceId),
    mimeType: "application/json",
    text: JSON.stringify(cacheEntry.content, null, 2)
  };
}

async function getAppResource(deviceId: string, packageName: string): Promise<ResourceContent> {
  const cacheEntry = await ensureAppsCacheEntry(deviceId);
  const uri = `${getDeviceAppsUri(deviceId)}/${packageName}`;

  if (!cacheEntry) {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Device not found or not booted: ${deviceId}`
      }, null, 2)
    };
  }

  const matchingApps = cacheEntry.appsByPackage.get(packageName) ?? [];
  const filteredContent: AppsResourceContent = {
    ...cacheEntry.content,
    apps: matchingApps,
    totalCount: matchingApps.length
  };

  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify(filteredContent, null, 2)
  };
}

function registerDeviceAppResource(device: BootedDevice): void {
  const uri = getDeviceAppsUri(device.deviceId);

  ResourceRegistry.register(
    uri,
    `Installed Apps (${device.deviceId})`,
    `List of installed apps for device ${device.deviceId} (${device.platform}).`,
    "application/json",
    () => getAppsResource(device.deviceId)
  );

  registeredDeviceResources.set(device.deviceId, uri);
}

function unregisterDeviceAppResource(deviceId: string): void {
  const uri = registeredDeviceResources.get(deviceId);
  if (!uri) {
    return;
  }

  ResourceRegistry.unregister(uri);
  registeredDeviceResources.delete(deviceId);
  appCacheByDeviceId.delete(deviceId);
}

export async function syncInstalledAppResources(): Promise<void> {
  let devices: BootedDevice[] = [];
  try {
    devices = await deviceManager.getBootedDevices("either");
  } catch (error) {
    logger.warn(`[AppResources] Failed to get booted devices: ${error}`);
  }

  const currentDeviceIds = new Set(devices.map(device => device.deviceId));
  let changed = false;

  for (const device of devices) {
    if (!registeredDeviceResources.has(device.deviceId)) {
      registerDeviceAppResource(device);
      changed = true;
    }
  }

  for (const deviceId of Array.from(registeredDeviceResources.keys())) {
    if (!currentDeviceIds.has(deviceId)) {
      unregisterDeviceAppResource(deviceId);
      changed = true;
    }
  }

  if (changed) {
    await ResourceRegistry.notifyResourceListChanged();
  }
}

export async function notifyInstalledAppResourceUpdated(deviceId: string): Promise<void> {
  await ResourceRegistry.notifyResourceUpdated(getDeviceAppsUri(deviceId));
}

export function invalidateInstalledAppsCache(deviceId?: string): void {
  if (deviceId) {
    appCacheByDeviceId.delete(deviceId);
    return;
  }
  appCacheByDeviceId.clear();
}

export function registerAppResources(): void {
  ResourceRegistry.registerTemplate(
    APP_RESOURCE_TEMPLATES.DEVICE_APPS,
    "Installed Apps",
    "List of installed apps for a specific device.",
    "application/json",
    async params => getAppsResource(params.deviceId)
  );

  ResourceRegistry.registerTemplate(
    APP_RESOURCE_TEMPLATES.DEVICE_APP,
    "Installed App Details",
    "Details for a specific app installed on a specific device.",
    "application/json",
    async params => getAppResource(params.deviceId, params.packageName)
  );

  void syncInstalledAppResources();

  logger.info("[AppResources] Registered app resources");
}
