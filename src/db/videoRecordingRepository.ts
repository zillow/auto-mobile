import type { Kysely } from "kysely";
import { ensureMigrations, getDatabase } from "./database";
import type {
  VideoFormat,
  VideoRecordingConfig,
  VideoRecordingHighlightEntry,
  VideoRecordingMetadata,
} from "../models";
import { parseVideoRecordingConfig } from "../features/video";
import type { Database, NewVideoRecording, VideoRecordingUpdate, VideoRecording as DbVideoRecording } from "./types";
import { logger } from "../utils/logger";

export type VideoRecordingStatus = "recording" | "completed" | "interrupted";

export interface VideoRecordingRecord extends VideoRecordingMetadata {
  deviceId: string;
  platform: "android" | "ios";
  status: VideoRecordingStatus;
}

export interface VideoRecordingQuery {
  status?: VideoRecordingStatus | VideoRecordingStatus[];
  deviceId?: string;
  platform?: "android" | "ios";
  limit?: number;
  orderByLastAccessed?: "asc" | "desc";
}

function parseConfig(configJson: string): VideoRecordingConfig {
  try {
    const parsed = JSON.parse(configJson) as VideoRecordingConfig;
    return parseVideoRecordingConfig(parsed);
  } catch (error) {
    logger.warn(`[VideoRecordingRepository] Failed to parse config JSON: ${error}`);
    return parseVideoRecordingConfig(null);
  }
}

function parseHighlights(
  highlightsJson: string | null
): VideoRecordingHighlightEntry[] | undefined {
  if (!highlightsJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(highlightsJson) as VideoRecordingHighlightEntry[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch (error) {
    logger.warn(`[VideoRecordingRepository] Failed to parse highlights JSON: ${error}`);
    return undefined;
  }
}

function toRecord(row: DbVideoRecording): VideoRecordingRecord {
  return {
    recordingId: row.recording_id,
    deviceId: row.device_id,
    platform: row.platform as "android" | "ios",
    status: row.status as VideoRecordingStatus,
    outputName: row.output_name ?? undefined,
    fileName: row.file_name,
    filePath: row.file_path,
    format: row.format as VideoFormat,
    sizeBytes: row.size_bytes,
    durationMs: row.duration_ms ?? undefined,
    codec: row.codec ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    lastAccessedAt: row.last_accessed_at,
    config: parseConfig(row.config_json),
    highlights: parseHighlights(row.highlights_json ?? null),
  };
}

function buildUpdatePayload(update: Partial<VideoRecordingRecord>): VideoRecordingUpdate {
  const payload: VideoRecordingUpdate = {};

  if (update.deviceId !== undefined) {
    payload.device_id = update.deviceId;
  }
  if (update.platform !== undefined) {
    payload.platform = update.platform;
  }
  if (update.status !== undefined) {
    payload.status = update.status;
  }
  if (update.outputName !== undefined) {
    payload.output_name = update.outputName ?? null;
  }
  if (update.fileName !== undefined) {
    payload.file_name = update.fileName;
  }
  if (update.filePath !== undefined) {
    payload.file_path = update.filePath;
  }
  if (update.format !== undefined) {
    payload.format = update.format;
  }
  if (update.sizeBytes !== undefined) {
    payload.size_bytes = update.sizeBytes;
  }
  if (update.durationMs !== undefined) {
    payload.duration_ms = update.durationMs ?? null;
  }
  if (update.codec !== undefined) {
    payload.codec = update.codec ?? null;
  }
  if (update.createdAt !== undefined) {
    payload.created_at = update.createdAt;
  }
  if (update.startedAt !== undefined) {
    payload.started_at = update.startedAt;
  }
  if (update.endedAt !== undefined) {
    payload.ended_at = update.endedAt ?? null;
  }
  if (update.lastAccessedAt !== undefined) {
    payload.last_accessed_at = update.lastAccessedAt;
  }
  if (update.config !== undefined) {
    payload.config_json = JSON.stringify(update.config);
  }
  if (update.highlights !== undefined) {
    payload.highlights_json = JSON.stringify(update.highlights ?? []);
  }

  return payload;
}

export class VideoRecordingRepository {
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

  async insertRecording(record: VideoRecordingRecord): Promise<void> {
    const db = await this.getDb();
    const row: NewVideoRecording = {
      recording_id: record.recordingId,
      device_id: record.deviceId,
      platform: record.platform,
      status: record.status,
      output_name: record.outputName ?? null,
      file_name: record.fileName,
      file_path: record.filePath,
      format: record.format,
      size_bytes: record.sizeBytes,
      duration_ms: record.durationMs ?? null,
      codec: record.codec ?? null,
      created_at: record.createdAt,
      started_at: record.startedAt,
      ended_at: record.endedAt ?? null,
      last_accessed_at: record.lastAccessedAt,
      config_json: JSON.stringify(record.config),
      highlights_json: record.highlights ? JSON.stringify(record.highlights) : null,
    };

    await db.insertInto("video_recordings").values(row).execute();
  }

  async updateRecording(
    recordingId: string,
    update: Partial<VideoRecordingRecord>
  ): Promise<void> {
    const db = await this.getDb();
    const payload = buildUpdatePayload(update);
    if (Object.keys(payload).length === 0) {
      return;
    }
    await db
      .updateTable("video_recordings")
      .set(payload)
      .where("recording_id", "=", recordingId)
      .execute();
  }

  async getRecording(recordingId: string): Promise<VideoRecordingRecord | null> {
    const db = await this.getDb();
    const row = await db
      .selectFrom("video_recordings")
      .selectAll()
      .where("recording_id", "=", recordingId)
      .executeTakeFirst();

    return row ? toRecord(row) : null;
  }

  async listRecordings(query: VideoRecordingQuery = {}): Promise<VideoRecordingRecord[]> {
    const db = await this.getDb();
    let builder = db
      .selectFrom("video_recordings")
      .selectAll();

    if (query.status !== undefined) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      builder = builder.where("status", "in", statuses);
    }
    if (query.deviceId) {
      builder = builder.where("device_id", "=", query.deviceId);
    }
    if (query.platform) {
      builder = builder.where("platform", "=", query.platform);
    }
    if (query.orderByLastAccessed) {
      builder = builder.orderBy("last_accessed_at", query.orderByLastAccessed);
    }
    if (query.limit && query.limit > 0) {
      builder = builder.limit(query.limit);
    }

    const rows = await builder.execute();
    return rows.map(toRecord);
  }

  async getLatestRecording(): Promise<VideoRecordingRecord | null> {
    const rows = await this.listRecordings({
      status: ["completed", "interrupted"],
      orderByLastAccessed: "desc",
      limit: 1,
    });
    return rows[0] ?? null;
  }

  async touchRecording(recordingId: string, timestamp: string): Promise<void> {
    await this.updateRecording(recordingId, { lastAccessedAt: timestamp });
  }

  async deleteRecording(recordingId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await db
      .deleteFrom("video_recordings")
      .where("recording_id", "=", recordingId)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0) > 0;
  }
}
