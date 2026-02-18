import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { PlatformDeviceManagerFactory } from "../utils/factories/PlatformDeviceManagerFactory";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { SimCtlClient } from "../utils/ios-cmdline-tools/SimCtlClient";
import { BootedDevice, InstalledApp, InstalledAppsByProfile, Platform, SystemInstalledApp } from "../models";
import { logger } from "../utils/logger";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

// Resource URI templates
export const APP_RESOURCE_TEMPLATES = {
  DEVICE_APPS: "automobile:devices/{deviceId}/apps",
  DEVICE_APP: "automobile:devices/{deviceId}/apps/{packageName}"
} as const;

export const APPS_RESOURCE_URIS = {
  BASE: "automobile:apps"
} as const;

const APPS_QUERY_KEYS = ["deviceId", "platform", "search", "type", "profile"] as const;
type AppsQueryKey = typeof APPS_QUERY_KEYS[number];
type AppsQueryType = "user" | "system";

interface AppsQueryOptions {
  platform?: Platform;
  search?: string;
  type?: AppsQueryType;
  profile?: number;
  deviceId?: string;
}

interface AppsQueryAppInfo {
  packageName: string;
  type: AppsQueryType;
  foreground: boolean;
  recent: boolean;
  userId?: number;
  userProfile?: "personal" | "work";
  userIds?: number[];
  displayName?: string;
}

interface AppsQueryDeviceContent {
  deviceId: string;
  platform: Platform;
  totalCount: number;
  lastUpdated: string;
  apps: AppsQueryAppInfo[];
}

interface AppsQueryResourceContent {
  query: AppsQueryOptions;
  totalCount: number;
  deviceCount: number;
  lastUpdated: string;
  devices: AppsQueryDeviceContent[];
}

// Resource content schema
interface AppsResourceContent {
  deviceId: string;
  platform: Platform;
  apps: InstalledAppInfo[];
  totalCount: number;
  foregroundApp: string | null;
  lastUpdated: string; // ISO 8601
  message?: string;
}

interface AndroidInstalledAppInfo {
  packageName: string;
  userId: number;
  userProfile: "personal" | "work";
  foreground: boolean;
  recent: boolean;
}

interface IosInstalledAppInfo {
  bundleId: string;
  displayName?: string;
  version?: string;
  path?: string;
}

type InstalledAppInfo = AndroidInstalledAppInfo | IosInstalledAppInfo;

interface AppsCacheEntry {
  expiresAt: number;
  content: AppsResourceContent;
  appsByPackage: Map<string, InstalledAppInfo[]>;
  queryApps: AppsQueryAppInfo[];
}

const APPS_CACHE_TTL_MS = 60000;
const APPS_QUERY_URI_TTL_MS = 300000;
const appCacheByDeviceId = new Map<string, AppsCacheEntry>();
const registeredDeviceResources = new Map<string, string>();
const appsQueryUrisByDeviceId = new Map<string, Map<string, number>>();

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

function toQueryAndroidApp(app: AndroidInstalledAppInfo): AppsQueryAppInfo {
  return {
    packageName: app.packageName,
    type: "user",
    userId: app.userId,
    userProfile: app.userProfile,
    foreground: app.foreground,
    recent: app.recent
  };
}

function toQuerySystemApp(app: SystemInstalledApp): AppsQueryAppInfo {
  return {
    packageName: app.packageName,
    type: "system",
    userIds: app.userIds,
    foreground: app.foreground,
    recent: app.recent
  };
}

function normalizeAndroidApps(installedApps: InstalledAppsByProfile): {
  userApps: AndroidInstalledAppInfo[];
  queryApps: AppsQueryAppInfo[];
} {
  const userApps: AndroidInstalledAppInfo[] = [];
  const queryApps: AppsQueryAppInfo[] = [];

  for (const profileApps of Object.values(installedApps.profiles)) {
    for (const app of profileApps) {
      const info = toInstalledAppInfo(app) as AndroidInstalledAppInfo;
      userApps.push(info);
      queryApps.push(toQueryAndroidApp(info));
    }
  }

  for (const systemApp of installedApps.system) {
    queryApps.push(toQuerySystemApp(systemApp));
  }

  return { userApps, queryApps };
}

function readIosStringField(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readIosAppField(app: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readIosStringField(app[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function extractIosBundleId(app: Record<string, unknown>): string | null {
  const bundleId = readIosAppField(app, [
    "bundleId",
    "bundleIdentifier",
    "bundleID",
    "CFBundleIdentifier"
  ]);
  return bundleId ?? null;
}

function extractIosDisplayName(app: Record<string, unknown>): string | undefined {
  return readIosAppField(app, [
    "bundleDisplayName",
    "bundleName",
    "CFBundleDisplayName",
    "CFBundleName",
    "displayName",
    "name"
  ]);
}

function extractIosVersion(app: Record<string, unknown>): string | undefined {
  return readIosAppField(app, [
    "bundleShortVersionString",
    "bundleVersion",
    "CFBundleShortVersionString",
    "CFBundleVersion",
    "BundleShortVersionString",
    "BundleVersion",
    "version"
  ]);
}

function extractIosPath(app: Record<string, unknown>): string | undefined {
  return readIosAppField(app, [
    "bundlePath",
    "bundleContainer",
    "path",
    "Path",
    "dataContainer"
  ]);
}

function toQueryIosApp(app: IosInstalledAppInfo): AppsQueryAppInfo {
  return {
    packageName: app.bundleId,
    type: "user",
    userId: 0,
    userProfile: "personal",
    foreground: false,
    recent: false,
    displayName: app.displayName
  };
}

function recordAppsQueryUri(deviceId: string, uri: string, timer: Timer = defaultTimer): void {
  const now = timer.now();
  let entries = appsQueryUrisByDeviceId.get(deviceId);
  if (!entries) {
    entries = new Map();
    appsQueryUrisByDeviceId.set(deviceId, entries);
  }
  entries.set(uri, now);

  for (const [storedUri, lastSeen] of entries) {
    if (now - lastSeen > APPS_QUERY_URI_TTL_MS) {
      entries.delete(storedUri);
    }
  }

  if (entries.size === 0) {
    appsQueryUrisByDeviceId.delete(deviceId);
  }
}

function getAppsQueryUrisForDevice(deviceId: string, timer: Timer = defaultTimer): string[] {
  const entries = appsQueryUrisByDeviceId.get(deviceId);
  if (!entries) {
    return [];
  }

  const now = timer.now();
  const uris: string[] = [];
  for (const [uri, lastSeen] of entries) {
    if (now - lastSeen > APPS_QUERY_URI_TTL_MS) {
      entries.delete(uri);
      continue;
    }
    uris.push(uri);
  }

  if (entries.size === 0) {
    appsQueryUrisByDeviceId.delete(deviceId);
  }

  return uris;
}

function getInstalledAppIdentifier(app: InstalledAppInfo): string {
  return "bundleId" in app ? app.bundleId : app.packageName;
}

function buildAppsByPackage(apps: InstalledAppInfo[]): Map<string, InstalledAppInfo[]> {
  const appsByPackage = new Map<string, InstalledAppInfo[]>();
  for (const app of apps) {
    const identifier = getInstalledAppIdentifier(app);
    const existing = appsByPackage.get(identifier);
    if (existing) {
      existing.push(app);
    } else {
      appsByPackage.set(identifier, [app]);
    }
  }
  return appsByPackage;
}

function getDeviceAppsUri(deviceId: string): string {
  return `automobile:devices/${deviceId}/apps`;
}

function createAppsResourceContent(
  device: BootedDevice,
  apps: InstalledAppInfo[],
  foregroundApp: string | null,
  lastUpdated: string,
  message?: string
): AppsResourceContent {
  return {
    deviceId: device.deviceId,
    platform: device.platform,
    apps,
    totalCount: apps.length,
    foregroundApp,
    lastUpdated,
    ...(message ? { message } : {})
  };
}

function getAndroidAppsMessage(deviceId: string): string {
  return `User apps only. Use automobile:apps?deviceId=${deviceId}&type=system to list system apps.`;
}

async function findBootedDevice(deviceId: string): Promise<BootedDevice | null> {
  try {
    const devices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("either");
    return devices.find(device => device.deviceId === deviceId) ?? null;
  } catch (error) {
    logger.warn(`[AppResources] Failed to list booted devices: ${error}`);
    return null;
  }
}

async function fetchAppsForDevice(device: BootedDevice, timer: Timer = defaultTimer): Promise<AppsCacheEntry> {
  const listInstalledApps = new ListInstalledApps(device);
  const lastUpdated = new Date().toISOString();

  if (device.platform === "android") {
    const installedApps = await listInstalledApps.executeDetailed();
    const { userApps, queryApps } = normalizeAndroidApps(installedApps);
    const foregroundApp = queryApps.find(app => app.foreground)?.packageName ?? null;
    const message = getAndroidAppsMessage(device.deviceId);

    return {
      expiresAt: timer.now() + APPS_CACHE_TTL_MS,
      content: createAppsResourceContent(device, userApps, foregroundApp, lastUpdated, message),
      appsByPackage: buildAppsByPackage(userApps),
      queryApps
    };
  }

  const simctl = new SimCtlClient(device);
  const installedApps = await simctl.listApps();
  const apps: IosInstalledAppInfo[] = [];
  const queryApps: AppsQueryAppInfo[] = [];

  for (const app of installedApps) {
    const bundleId = extractIosBundleId(app as Record<string, unknown>);
    if (!bundleId) {
      continue;
    }
    const displayName = extractIosDisplayName(app as Record<string, unknown>);
    const version = extractIosVersion(app as Record<string, unknown>);
    const path = extractIosPath(app as Record<string, unknown>);
    const info: IosInstalledAppInfo = {
      bundleId,
      displayName,
      ...(version ? { version } : {}),
      ...(path ? { path } : {})
    };
    apps.push(info);
    queryApps.push({
      ...toQueryIosApp(info)
    });
  }

  return {
    expiresAt: timer.now() + APPS_CACHE_TTL_MS,
    content: createAppsResourceContent(device, apps, null, lastUpdated),
    appsByPackage: buildAppsByPackage(apps),
    queryApps
  };
}

async function ensureAppsCacheEntry(deviceId: string, timer: Timer = defaultTimer): Promise<AppsCacheEntry | null> {
  const cached = appCacheByDeviceId.get(deviceId);
  if (cached && cached.expiresAt > timer.now()) {
    return cached;
  }

  const device = await findBootedDevice(deviceId);
  if (!device) {
    return null;
  }

  const entry = await fetchAppsForDevice(device, timer);
  appCacheByDeviceId.set(deviceId, entry);
  return entry;
}

function decodeQueryParam(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\+/g, " ");
  const decoded = decodeURIComponent(normalized).trim();
  return decoded ? decoded : undefined;
}

function parseProfileParam(value: string | undefined): number | undefined {
  const decoded = decodeQueryParam(value);
  if (!decoded) {
    return undefined;
  }
  const parsed = Number(decoded);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid profile: ${value}`);
  }
  return parsed;
}

function parseAppsQueryParams(params: Record<string, string>): AppsQueryOptions {
  const platformRaw = decodeQueryParam(params.platform);
  const typeRaw = decodeQueryParam(params.type);
  const search = decodeQueryParam(params.search);
  const deviceId = decodeQueryParam(params.deviceId);

  if (!deviceId) {
    throw new Error("deviceId is required");
  }

  let platform: Platform | undefined;
  if (platformRaw) {
    if (platformRaw !== "android" && platformRaw !== "ios") {
      throw new Error(`Invalid platform: ${platformRaw}`);
    }
    platform = platformRaw;
  }

  let type: AppsQueryType | undefined;
  if (typeRaw) {
    if (typeRaw !== "user" && typeRaw !== "system") {
      throw new Error(`Invalid type: ${typeRaw}`);
    }
    type = typeRaw;
  }

  return {
    platform,
    search: search ?? undefined,
    type,
    profile: parseProfileParam(params.profile),
    deviceId
  };
}

function buildAppsUri(options: AppsQueryOptions): string {
  const query = new URLSearchParams();
  if (options.deviceId) {
    query.set("deviceId", options.deviceId);
  }
  if (options.platform) {
    query.set("platform", options.platform);
  }
  if (options.search) {
    query.set("search", options.search);
  }
  if (options.type) {
    query.set("type", options.type);
  }
  if (options.profile !== undefined) {
    query.set("profile", options.profile.toString());
  }

  const queryString = query.toString();
  return queryString ? `${APPS_RESOURCE_URIS.BASE}?${queryString}` : APPS_RESOURCE_URIS.BASE;
}

function buildAppsQueryTemplate(keys: readonly AppsQueryKey[]): string {
  const query = keys.map(key => `${key}={${key}}`).join("&");
  return `${APPS_RESOURCE_URIS.BASE}?${query}`;
}

function filterAppsByQuery(apps: AppsQueryAppInfo[], options: AppsQueryOptions): AppsQueryAppInfo[] {
  const searchTerm = options.search?.toLowerCase();

  return apps.filter(app => {
    if (options.type && app.type !== options.type) {
      return false;
    }

    if (options.profile !== undefined) {
      if (app.type === "user") {
        if (app.userId !== options.profile) {
          return false;
        }
      } else if (!app.userIds?.includes(options.profile)) {
        return false;
      }
    }

    if (searchTerm) {
      const packageMatch = app.packageName.toLowerCase().includes(searchTerm);
      const displayMatch = app.displayName?.toLowerCase().includes(searchTerm) ?? false;
      if (!packageMatch && !displayMatch) {
        return false;
      }
    }

    return true;
  });
}

async function getAppsQueryDevice(options: AppsQueryOptions): Promise<BootedDevice> {
  if (!options.deviceId) {
    throw new Error("deviceId is required");
  }

  const devices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("either");

  const matched = devices.find(device => device.deviceId === options.deviceId);
  if (!matched) {
    throw new Error(`Device not found or not booted: ${options.deviceId}`);
  }
  if (options.platform && matched.platform !== options.platform) {
    throw new Error(`Device ${options.deviceId} is not a ${options.platform} device`);
  }

  return matched;
}

async function getAppsQueryResource(
  options: AppsQueryOptions,
  uri: string
): Promise<ResourceContent> {
  try {
    const device = await getAppsQueryDevice(options);
    const cacheEntry = await ensureAppsCacheEntry(device.deviceId);
    if (!cacheEntry) {
      throw new Error(`Device not found or not booted: ${device.deviceId}`);
    }

    const apps = filterAppsByQuery(cacheEntry.queryApps, options);
    const deviceEntries: AppsQueryDeviceContent[] = [{
      deviceId: device.deviceId,
      platform: device.platform,
      totalCount: apps.length,
      lastUpdated: cacheEntry.content.lastUpdated,
      apps
    }];

    const parsed = Date.parse(cacheEntry.content.lastUpdated);
    const lastUpdated = Number.isNaN(parsed)
      ? new Date().toISOString()
      : new Date(parsed).toISOString();

    const content: AppsQueryResourceContent = {
      query: options,
      totalCount: apps.length,
      deviceCount: 1,
      lastUpdated,
      devices: deviceEntries
    };

    if (options.deviceId) {
      recordAppsQueryUri(options.deviceId, uri);
    }

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(content, null, 2)
    };
  } catch (error) {
    logger.error(`[AppResources] Failed to read apps resource: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to read apps resource: ${error}`
      }, null, 2)
    };
  }
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
    `List of installed user apps for device ${device.deviceId} (${device.platform}). ` +
      `System apps: use automobile:apps?deviceId=${device.deviceId}&type=system.`,
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
  appsQueryUrisByDeviceId.delete(deviceId);
}

export async function syncInstalledAppResources(): Promise<void> {
  let devices: BootedDevice[] = [];
  try {
    devices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("either");
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
      // Clear installed apps cache when device disappears
      try {
        const { InstalledAppsRepository } = await import("../db/installedAppsRepository");
        const repo = new InstalledAppsRepository();
        await repo.clearDeviceSession(deviceId);
        logger.info(`[AppResources] Cleared installed apps cache for disappeared device: ${deviceId}`);
      } catch (error) {
        logger.warn(`[AppResources] Failed to clear cache for device ${deviceId}: ${error}`);
      }
      changed = true;
    }
  }

  if (changed) {
    await ResourceRegistry.notifyResourceListChanged();
    await ResourceRegistry.notifyResourceUpdated(APPS_RESOURCE_URIS.BASE);
  }
}

export async function notifyInstalledAppResourceUpdated(deviceId: string): Promise<void> {
  const queryUris = getAppsQueryUrisForDevice(deviceId);
  await ResourceRegistry.notifyResourcesUpdated([
    getDeviceAppsUri(deviceId),
    APPS_RESOURCE_URIS.BASE,
    ...queryUris
  ]);
}

export function invalidateInstalledAppsCache(deviceId?: string): void {
  if (deviceId) {
    appCacheByDeviceId.delete(deviceId);
    return;
  }
  appCacheByDeviceId.clear();
}

function registerAppsQueryTemplates(
  handler: (params: Record<string, string>) => Promise<ResourceContent>
): void {
  const optionalKeys = APPS_QUERY_KEYS.filter(key => key !== "deviceId");
  const optionalKeyCount = optionalKeys.length;

  for (let mask = 0; mask < (1 << optionalKeyCount); mask += 1) {
    const keys = [
      "deviceId",
      ...optionalKeys.filter((_, index) => (mask & (1 << index)) !== 0)
    ];
    ResourceRegistry.registerTemplate(
      buildAppsQueryTemplate(keys),
      "Installed Apps",
      "List installed apps across booted devices with optional query filters.",
      "application/json",
      handler
    );
  }
}

export function registerAppResources(): void {
  ResourceRegistry.register(
    APPS_RESOURCE_URIS.BASE,
    "Installed Apps",
    "List installed apps across booted devices with optional query filters (deviceId required).",
    "application/json",
    () => getAppsQueryResource({}, APPS_RESOURCE_URIS.BASE)
  );

  registerAppsQueryTemplates(async params => {
    try {
      const options = parseAppsQueryParams(params);
      const uri = buildAppsUri(options);
      return getAppsQueryResource(options, uri);
    } catch (error) {
      logger.error(`[AppResources] Failed to parse apps query params: ${error}`);
      return {
        uri: APPS_RESOURCE_URIS.BASE,
        mimeType: "application/json",
        text: JSON.stringify({
          error: `Invalid apps query parameters: ${error}`
        }, null, 2)
      };
    }
  });

  ResourceRegistry.registerTemplate(
    APP_RESOURCE_TEMPLATES.DEVICE_APPS,
    "Installed Apps",
    "List of installed user apps for a specific device. " +
      "System apps: use automobile:apps?deviceId=DEVICE_ID&type=system.",
    "application/json",
    async params => getAppsResource(params.deviceId)
  );

  ResourceRegistry.registerTemplate(
    APP_RESOURCE_TEMPLATES.DEVICE_APP,
    "Installed App Details",
    "Details for a specific user app installed on a specific device. " +
      "System apps: use automobile:apps?deviceId=DEVICE_ID&type=system&search=PACKAGE_NAME.",
    "application/json",
    async params => getAppResource(params.deviceId, params.packageName)
  );

  void syncInstalledAppResources();

  logger.info("[AppResources] Registered app resources");
}
