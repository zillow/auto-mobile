import type { Kysely } from "kysely";
import { ensureMigrations, getDatabase } from "./database";
import type { DeviceSnapshotManifest, DeviceSnapshotMetadata, DeviceSnapshotType } from "../models";
import type {
  Database,
  DeviceSnapshot as DbDeviceSnapshot,
  NewDeviceSnapshot,
  DeviceSnapshotUpdate,
} from "./types";
import { logger } from "../utils/logger";

export interface DeviceSnapshotRecord extends DeviceSnapshotMetadata {}

export interface DeviceSnapshotQuery {
  deviceId?: string;
  platform?: "android" | "ios";
  snapshotType?: DeviceSnapshotType;
  limit?: number;
  orderByLastAccessed?: "asc" | "desc";
  orderByCreatedAt?: "asc" | "desc";
}

function parseManifest(
  snapshotName: string,
  manifestJson: string
): DeviceSnapshotManifest | null {
  try {
    return JSON.parse(manifestJson) as DeviceSnapshotManifest;
  } catch (error) {
    logger.warn(
      `[DeviceSnapshotRepository] Failed to parse manifest for ${snapshotName}: ${error}`
    );
    return null;
  }
}

function toRecord(row: DbDeviceSnapshot): DeviceSnapshotRecord | null {
  const manifest = parseManifest(row.snapshot_name, row.manifest_json);
  if (!manifest) {
    return null;
  }

  return {
    snapshotName: row.snapshot_name,
    deviceId: row.device_id,
    deviceName: row.device_name,
    platform: row.platform,
    snapshotType: row.snapshot_type as DeviceSnapshotType,
    includeAppData: Boolean(row.include_app_data),
    includeSettings: Boolean(row.include_settings),
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    sizeBytes: row.size_bytes,
    manifest,
  };
}

function buildUpdatePayload(update: Partial<DeviceSnapshotRecord>): DeviceSnapshotUpdate {
  const payload: DeviceSnapshotUpdate = {};

  if (update.deviceId !== undefined) {
    payload.device_id = update.deviceId;
  }
  if (update.deviceName !== undefined) {
    payload.device_name = update.deviceName;
  }
  if (update.platform !== undefined) {
    payload.platform = update.platform;
  }
  if (update.snapshotType !== undefined) {
    payload.snapshot_type = update.snapshotType;
  }
  if (update.includeAppData !== undefined) {
    payload.include_app_data = update.includeAppData ? 1 : 0;
  }
  if (update.includeSettings !== undefined) {
    payload.include_settings = update.includeSettings ? 1 : 0;
  }
  if (update.createdAt !== undefined) {
    payload.created_at = update.createdAt;
  }
  if (update.lastAccessedAt !== undefined) {
    payload.last_accessed_at = update.lastAccessedAt;
  }
  if (update.sizeBytes !== undefined) {
    payload.size_bytes = update.sizeBytes;
  }
  if (update.manifest !== undefined) {
    payload.manifest_json = JSON.stringify(update.manifest);
  }

  return payload;
}

export class DeviceSnapshotRepository {
  private db: Kysely<Database> | null;

  constructor(db?: Kysely<Database>) {
    this.db = db ?? null;
  }

  private async getDb(): Promise<Kysely<Database>> {
    if (this.db) {
      return this.db;
    }
    await ensureMigrations();
    return getDatabase();
  }

  async insertSnapshot(record: DeviceSnapshotRecord): Promise<void> {
    const db = await this.getDb();
    const row: NewDeviceSnapshot = {
      snapshot_name: record.snapshotName,
      device_id: record.deviceId,
      device_name: record.deviceName,
      platform: record.platform,
      snapshot_type: record.snapshotType,
      include_app_data: record.includeAppData ? 1 : 0,
      include_settings: record.includeSettings ? 1 : 0,
      created_at: record.createdAt,
      last_accessed_at: record.lastAccessedAt,
      size_bytes: record.sizeBytes,
      manifest_json: JSON.stringify(record.manifest),
    };

    await db.insertInto("device_snapshots").values(row).execute();
  }

  async updateSnapshot(
    snapshotName: string,
    update: Partial<DeviceSnapshotRecord>
  ): Promise<void> {
    const db = await this.getDb();
    const payload = buildUpdatePayload(update);
    if (Object.keys(payload).length === 0) {
      return;
    }

    await db
      .updateTable("device_snapshots")
      .set(payload)
      .where("snapshot_name", "=", snapshotName)
      .execute();
  }

  async getSnapshot(snapshotName: string): Promise<DeviceSnapshotRecord | null> {
    const db = await this.getDb();
    const row = await db
      .selectFrom("device_snapshots")
      .selectAll()
      .where("snapshot_name", "=", snapshotName)
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  async listSnapshots(query: DeviceSnapshotQuery = {}): Promise<DeviceSnapshotRecord[]> {
    const db = await this.getDb();
    let builder = db
      .selectFrom("device_snapshots")
      .selectAll();

    if (query.deviceId) {
      builder = builder.where("device_id", "=", query.deviceId);
    }
    if (query.platform) {
      builder = builder.where("platform", "=", query.platform);
    }
    if (query.snapshotType) {
      builder = builder.where("snapshot_type", "=", query.snapshotType);
    }
    if (query.orderByLastAccessed) {
      builder = builder.orderBy("last_accessed_at", query.orderByLastAccessed);
    }
    if (query.orderByCreatedAt) {
      builder = builder.orderBy("created_at", query.orderByCreatedAt);
    }
    if (query.limit && query.limit > 0) {
      builder = builder.limit(query.limit);
    }

    const rows = await builder.execute();
    return rows
      .map(row => toRecord(row))
      .filter((record): record is DeviceSnapshotRecord => Boolean(record));
  }

  async touchSnapshot(snapshotName: string, timestamp: string): Promise<void> {
    await this.updateSnapshot(snapshotName, { lastAccessedAt: timestamp });
  }

  async deleteSnapshot(snapshotName: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db
      .deleteFrom("device_snapshots")
      .where("snapshot_name", "=", snapshotName)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0) > 0;
  }
}
