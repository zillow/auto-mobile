import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { PlatformDeviceManagerFactory } from "../utils/factories/PlatformDeviceManagerFactory";
import { DatabaseInspector, DatabaseInfo, TableStructureResult } from "../features/database/DatabaseInspector";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import { BootedDevice } from "../models";
import { logger } from "../utils/logger";

// Resource URI templates
const DATABASE_RESOURCE_TEMPLATES = {
  DATABASES: "automobile:devices/{deviceId}/databases?appId={appId}",
  TABLES: "automobile:devices/{deviceId}/databases/{databasePath}/tables?appId={appId}",
  TABLE_DATA: "automobile:devices/{deviceId}/databases/{databasePath}/tables/{table}/data?appId={appId}",
  TABLE_STRUCTURE: "automobile:devices/{deviceId}/databases/{databasePath}/tables/{table}/structure?appId={appId}"
} as const;

// Cache entries for change detection
interface DatabaseCacheEntry {
  databases: DatabaseInfo[];
  lastUpdated: string;
  hash: string;
}

interface TableSchemaCacheEntry {
  structure: TableStructureResult;
  lastUpdated: string;
  hash: string;
}

interface DatabaseCache {
  byApp: Map<string, DatabaseCacheEntry>; // key: `${deviceId}:${appId}`
  tableSchemas: Map<string, TableSchemaCacheEntry>; // key: `${deviceId}:${appId}:${dbPath}:${table}`
}

const cache: DatabaseCache = {
  byApp: new Map(),
  tableSchemas: new Map()
};

/**
 * Generate a simple hash for change detection
 */
function generateHash(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Find a booted Android device by ID
 */
async function findBootedAndroidDevice(deviceId: string): Promise<BootedDevice | null> {
  try {
    const devices = await PlatformDeviceManagerFactory.getInstance().getBootedDevices("android");
    return devices.find(d => d.deviceId === deviceId) ?? null;
  } catch (error) {
    logger.warn(`[DatabaseResources] Failed to find device ${deviceId}: ${error}`);
    return null;
  }
}

/**
 * Get cache key for database list
 */
function getDatabasesCacheKey(deviceId: string, appId: string): string {
  return `${deviceId}:${appId}`;
}

/**
 * Get cache key for table schema
 */
function getTableSchemaCacheKey(deviceId: string, appId: string, databasePath: string, table: string): string {
  return `${deviceId}:${appId}:${databasePath}:${table}`;
}

/**
 * Build resource URI for databases
 */
function buildDatabasesUri(deviceId: string, appId: string): string {
  return `automobile:devices/${deviceId}/databases?appId=${encodeURIComponent(appId)}`;
}

/**
 * Build resource URI for tables
 */
function buildTablesUri(deviceId: string, databasePath: string, appId: string): string {
  return `automobile:devices/${deviceId}/databases/${encodeURIComponent(databasePath)}/tables?appId=${encodeURIComponent(appId)}`;
}

/**
 * Build resource URI for table data
 */
function buildTableDataUri(deviceId: string, databasePath: string, table: string, appId: string): string {
  return `automobile:devices/${deviceId}/databases/${encodeURIComponent(databasePath)}/tables/${encodeURIComponent(table)}/data?appId=${encodeURIComponent(appId)}`;
}

/**
 * Build resource URI for table structure
 */
function buildTableStructureUri(deviceId: string, databasePath: string, table: string, appId: string): string {
  return `automobile:devices/${deviceId}/databases/${encodeURIComponent(databasePath)}/tables/${encodeURIComponent(table)}/structure?appId=${encodeURIComponent(appId)}`;
}

/**
 * Get databases resource content
 */
async function getDatabasesResource(params: Record<string, string>): Promise<ResourceContent> {
  const { deviceId, appId } = params;
  const uri = buildDatabasesUri(deviceId, appId);

  try {
    const device = await findBootedAndroidDevice(deviceId);
    if (!device) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Device not found or not booted: ${deviceId}` }, null, 2)
      };
    }

    const adb = defaultAdbClientFactory.create(device);
    const inspector = new DatabaseInspector(device, adb);
    const databases = await inspector.listDatabases(appId);
    const lastUpdated = new Date().toISOString();
    const hash = generateHash(databases);

    // Check for changes and notify
    const cacheKey = getDatabasesCacheKey(deviceId, appId);
    const cached = cache.byApp.get(cacheKey);
    if (cached && cached.hash !== hash) {
      logger.info(`[DatabaseResources] Database list changed for ${appId} on ${deviceId}`);
      void ResourceRegistry.notifyResourceUpdated(uri);
    }

    // Update cache
    cache.byApp.set(cacheKey, { databases, lastUpdated, hash });

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        deviceId,
        appId,
        databases,
        totalCount: databases.length,
        lastUpdated
      }, null, 2)
    };
  } catch (error) {
    logger.error(`[DatabaseResources] Failed to list databases: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to list databases: ${error}` }, null, 2)
    };
  }
}

/**
 * Get tables resource content
 */
async function getTablesResource(params: Record<string, string>): Promise<ResourceContent> {
  const { deviceId, databasePath, appId } = params;
  const decodedPath = decodeURIComponent(databasePath);
  const uri = buildTablesUri(deviceId, decodedPath, appId);

  try {
    const device = await findBootedAndroidDevice(deviceId);
    if (!device) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Device not found or not booted: ${deviceId}` }, null, 2)
      };
    }

    const adb = defaultAdbClientFactory.create(device);
    const inspector = new DatabaseInspector(device, adb);
    const tables = await inspector.listTables(appId, decodedPath);
    const lastUpdated = new Date().toISOString();

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        deviceId,
        appId,
        databasePath: decodedPath,
        tables,
        totalCount: tables.length,
        lastUpdated
      }, null, 2)
    };
  } catch (error) {
    logger.error(`[DatabaseResources] Failed to list tables: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to list tables: ${error}` }, null, 2)
    };
  }
}

/**
 * Get table data resource content
 */
async function getTableDataResource(params: Record<string, string>): Promise<ResourceContent> {
  const { deviceId, databasePath, table, appId } = params;
  const decodedPath = decodeURIComponent(databasePath);
  const decodedTable = decodeURIComponent(table);
  const uri = buildTableDataUri(deviceId, decodedPath, decodedTable, appId);

  // Parse optional limit and offset from query params
  const limit = params.limit ? parseInt(params.limit, 10) : 50;
  const offset = params.offset ? parseInt(params.offset, 10) : 0;

  try {
    const device = await findBootedAndroidDevice(deviceId);
    if (!device) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Device not found or not booted: ${deviceId}` }, null, 2)
      };
    }

    const adb = defaultAdbClientFactory.create(device);
    const inspector = new DatabaseInspector(device, adb);
    const data = await inspector.getTableData(appId, decodedPath, decodedTable, limit, offset);
    const lastUpdated = new Date().toISOString();

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        deviceId,
        appId,
        databasePath: decodedPath,
        table: decodedTable,
        columns: data.columns,
        rows: data.rows,
        total: data.total,
        limit,
        offset,
        lastUpdated
      }, null, 2)
    };
  } catch (error) {
    logger.error(`[DatabaseResources] Failed to get table data: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to get table data: ${error}` }, null, 2)
    };
  }
}

/**
 * Get table structure resource content
 */
async function getTableStructureResource(params: Record<string, string>): Promise<ResourceContent> {
  const { deviceId, databasePath, table, appId } = params;
  const decodedPath = decodeURIComponent(databasePath);
  const decodedTable = decodeURIComponent(table);
  const uri = buildTableStructureUri(deviceId, decodedPath, decodedTable, appId);

  try {
    const device = await findBootedAndroidDevice(deviceId);
    if (!device) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: `Device not found or not booted: ${deviceId}` }, null, 2)
      };
    }

    const adb = defaultAdbClientFactory.create(device);
    const inspector = new DatabaseInspector(device, adb);
    const structure = await inspector.getTableStructure(appId, decodedPath, decodedTable);
    const lastUpdated = new Date().toISOString();
    const hash = generateHash(structure);

    // Check for schema changes and notify
    const cacheKey = getTableSchemaCacheKey(deviceId, appId, decodedPath, decodedTable);
    const cached = cache.tableSchemas.get(cacheKey);
    if (cached && cached.hash !== hash) {
      logger.info(`[DatabaseResources] Table schema changed for ${decodedTable} in ${decodedPath}`);
      void ResourceRegistry.notifyResourceUpdated(uri);
      // Also notify table data resource since schema changed
      void ResourceRegistry.notifyResourceUpdated(buildTableDataUri(deviceId, decodedPath, decodedTable, appId));
    }

    // Update cache
    cache.tableSchemas.set(cacheKey, { structure, lastUpdated, hash });

    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        deviceId,
        appId,
        databasePath: decodedPath,
        table: decodedTable,
        columns: structure.columns,
        lastUpdated
      }, null, 2)
    };
  } catch (error) {
    logger.error(`[DatabaseResources] Failed to get table structure: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({ error: `Failed to get table structure: ${error}` }, null, 2)
    };
  }
}

/**
 * Notify that database data has changed (called after SQL mutations)
 */
export async function notifyDatabaseChanged(
  deviceId: string,
  appId: string,
  databasePath: string,
  affectedTables?: string[]
): Promise<void> {
  // Notify database list resource
  await ResourceRegistry.notifyResourceUpdated(buildDatabasesUri(deviceId, appId));

  // Notify tables resource
  await ResourceRegistry.notifyResourceUpdated(buildTablesUri(deviceId, databasePath, appId));

  // If we know which tables were affected, notify those specifically
  if (affectedTables && affectedTables.length > 0) {
    for (const table of affectedTables) {
      await ResourceRegistry.notifyResourceUpdated(
        buildTableDataUri(deviceId, databasePath, table, appId)
      );
      await ResourceRegistry.notifyResourceUpdated(
        buildTableStructureUri(deviceId, databasePath, table, appId)
      );
    }
  }

  // Invalidate relevant cache entries
  const cacheKey = getDatabasesCacheKey(deviceId, appId);
  cache.byApp.delete(cacheKey);

  // Clear table schema cache for this database
  for (const key of cache.tableSchemas.keys()) {
    if (key.startsWith(`${deviceId}:${appId}:${databasePath}:`)) {
      cache.tableSchemas.delete(key);
    }
  }
}

/**
 * Register database resources
 */
export function registerDatabaseResources(): void {
  // Register template for listing databases
  ResourceRegistry.registerTemplate(
    DATABASE_RESOURCE_TEMPLATES.DATABASES,
    "App Databases",
    "List all SQLite databases in an Android app. Requires app to have AutoMobile SDK with database inspection enabled.",
    "application/json",
    getDatabasesResource
  );

  // Register template for listing tables
  ResourceRegistry.registerTemplate(
    DATABASE_RESOURCE_TEMPLATES.TABLES,
    "Database Tables",
    "List all tables in a database.",
    "application/json",
    getTablesResource
  );

  // Register template for table data
  ResourceRegistry.registerTemplate(
    DATABASE_RESOURCE_TEMPLATES.TABLE_DATA,
    "Table Data",
    "Get rows from a database table with pagination (default: 50 rows). Add &limit=N&offset=M for pagination.",
    "application/json",
    getTableDataResource
  );

  // Also register with limit/offset parameters
  ResourceRegistry.registerTemplate(
    "automobile:devices/{deviceId}/databases/{databasePath}/tables/{table}/data?appId={appId}&limit={limit}&offset={offset}",
    "Table Data (Paginated)",
    "Get rows from a database table with explicit pagination.",
    "application/json",
    getTableDataResource
  );

  // Register template for table structure
  ResourceRegistry.registerTemplate(
    DATABASE_RESOURCE_TEMPLATES.TABLE_STRUCTURE,
    "Table Structure",
    "Get column definitions for a database table.",
    "application/json",
    getTableStructureResource
  );

  logger.info("[DatabaseResources] Registered database resources");
}
