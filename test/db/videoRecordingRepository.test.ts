import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { Kysely } from "kysely";
import type { Database } from "../../src/db/types";
import { VideoRecordingRepository } from "../../src/db/videoRecordingRepository";
import type { VideoRecordingRecord } from "../../src/db/videoRecordingRepository";
import { createTestDatabase } from "./testDbHelper";
import type { VideoRecordingConfig } from "../../src/models";

function makeConfig(overrides: Partial<VideoRecordingConfig> = {}): VideoRecordingConfig {
  return {
    qualityPreset: "low",
    targetBitrateKbps: 1000,
    maxThroughputMbps: 5,
    fps: 15,
    maxArchiveSizeMb: 100,
    format: "mp4",
    ...overrides,
  };
}

function makeRecord(overrides: Partial<VideoRecordingRecord> = {}): VideoRecordingRecord {
  return {
    recordingId: "rec-1",
    deviceId: "emulator-5554",
    platform: "android",
    status: "recording",
    fileName: "recording.mp4",
    filePath: "/tmp/recording.mp4",
    format: "mp4",
    sizeBytes: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    startedAt: "2024-01-01T00:00:00.000Z",
    lastAccessedAt: "2024-01-01T00:00:00.000Z",
    config: makeConfig(),
    ...overrides,
  };
}

describe("VideoRecordingRepository", () => {
  let db: Kysely<Database>;
  let repo: VideoRecordingRepository;

  beforeEach(async () => {
    db = await createTestDatabase();
    repo = new VideoRecordingRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("insertRecording and getRecording round-trip", async () => {
    const record = makeRecord();
    await repo.insertRecording(record);

    const result = await repo.getRecording("rec-1");
    expect(result).not.toBeNull();
    expect(result!.recordingId).toBe("rec-1");
    expect(result!.deviceId).toBe("emulator-5554");
    expect(result!.platform).toBe("android");
    expect(result!.status).toBe("recording");
    expect(result!.fileName).toBe("recording.mp4");
    expect(result!.filePath).toBe("/tmp/recording.mp4");
    expect(result!.format).toBe("mp4");
    expect(result!.sizeBytes).toBe(0);
    expect(result!.config.qualityPreset).toBe("low");
    expect(result!.config.fps).toBe(15);
  });

  test("getRecording returns null for unknown id", async () => {
    const result = await repo.getRecording("nonexistent");
    expect(result).toBeNull();
  });

  test("insertRecording with optional fields", async () => {
    const record = makeRecord({
      recordingId: "rec-opt",
      outputName: "my-recording",
      durationMs: 5000,
      codec: "h264",
      endedAt: "2024-01-01T00:05:00.000Z",
      highlights: [
        {
          description: "button tap",
          shape: { type: "circle", cx: 100, cy: 200, r: 30 },
          timeline: { appearedAtSeconds: 1.0, disappearedAtSeconds: 2.0 },
        },
      ],
    });

    await repo.insertRecording(record);
    const result = await repo.getRecording("rec-opt");
    expect(result!.outputName).toBe("my-recording");
    expect(result!.durationMs).toBe(5000);
    expect(result!.codec).toBe("h264");
    expect(result!.endedAt).toBe("2024-01-01T00:05:00.000Z");
    expect(result!.highlights).toHaveLength(1);
    expect(result!.highlights![0].description).toBe("button tap");
  });

  test("listRecordings returns all recordings", async () => {
    await repo.insertRecording(makeRecord({ recordingId: "rec-1" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-2" }));

    const results = await repo.listRecordings();
    expect(results).toHaveLength(2);
  });

  test("listRecordings filters by status (single)", async () => {
    await repo.insertRecording(makeRecord({ recordingId: "rec-1", status: "recording" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-2", status: "completed" }));

    const results = await repo.listRecordings({ status: "completed" });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("completed");
  });

  test("listRecordings filters by status (array)", async () => {
    await repo.insertRecording(makeRecord({ recordingId: "rec-1", status: "recording" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-2", status: "completed" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-3", status: "interrupted" }));

    const results = await repo.listRecordings({ status: ["completed", "interrupted"] });
    expect(results).toHaveLength(2);
  });

  test("listRecordings filters by deviceId", async () => {
    await repo.insertRecording(makeRecord({ recordingId: "rec-1", deviceId: "device-A" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-2", deviceId: "device-B" }));

    const results = await repo.listRecordings({ deviceId: "device-A" });
    expect(results).toHaveLength(1);
    expect(results[0].deviceId).toBe("device-A");
  });

  test("listRecordings filters by platform", async () => {
    await repo.insertRecording(makeRecord({ recordingId: "rec-1", platform: "android" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-2", platform: "ios" }));

    const results = await repo.listRecordings({ platform: "ios" });
    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe("ios");
  });

  test("listRecordings orders by lastAccessedAt", async () => {
    await repo.insertRecording(
      makeRecord({ recordingId: "rec-old", lastAccessedAt: "2024-01-01T00:00:00.000Z" })
    );
    await repo.insertRecording(
      makeRecord({ recordingId: "rec-new", lastAccessedAt: "2024-06-01T00:00:00.000Z" })
    );

    const descResults = await repo.listRecordings({ orderByLastAccessed: "desc" });
    expect(descResults[0].recordingId).toBe("rec-new");

    const ascResults = await repo.listRecordings({ orderByLastAccessed: "asc" });
    expect(ascResults[0].recordingId).toBe("rec-old");
  });

  test("listRecordings respects limit", async () => {
    await repo.insertRecording(makeRecord({ recordingId: "rec-1" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-2" }));
    await repo.insertRecording(makeRecord({ recordingId: "rec-3" }));

    const results = await repo.listRecordings({ limit: 2 });
    expect(results).toHaveLength(2);
  });

  test("updateRecording changes status", async () => {
    await repo.insertRecording(makeRecord({ status: "recording" }));

    await repo.updateRecording("rec-1", {
      status: "completed",
      endedAt: "2024-01-01T00:05:00.000Z",
      sizeBytes: 5000,
      durationMs: 300000,
    });

    const result = await repo.getRecording("rec-1");
    expect(result!.status).toBe("completed");
    expect(result!.endedAt).toBe("2024-01-01T00:05:00.000Z");
    expect(result!.sizeBytes).toBe(5000);
    expect(result!.durationMs).toBe(300000);
  });

  test("updateRecording with empty update is a no-op", async () => {
    await repo.insertRecording(makeRecord());
    await repo.updateRecording("rec-1", {});

    const result = await repo.getRecording("rec-1");
    expect(result!.recordingId).toBe("rec-1");
  });

  test("getLatestRecording returns most recently accessed completed/interrupted recording", async () => {
    await repo.insertRecording(
      makeRecord({
        recordingId: "rec-1",
        status: "completed",
        lastAccessedAt: "2024-01-01T00:00:00.000Z",
      })
    );
    await repo.insertRecording(
      makeRecord({
        recordingId: "rec-2",
        status: "interrupted",
        lastAccessedAt: "2024-06-01T00:00:00.000Z",
      })
    );
    await repo.insertRecording(
      makeRecord({
        recordingId: "rec-3",
        status: "recording",
        lastAccessedAt: "2024-12-01T00:00:00.000Z",
      })
    );

    const latest = await repo.getLatestRecording();
    expect(latest).not.toBeNull();
    expect(latest!.recordingId).toBe("rec-2");
  });

  test("getLatestRecording returns null when no completed/interrupted recordings exist", async () => {
    await repo.insertRecording(makeRecord({ status: "recording" }));

    const latest = await repo.getLatestRecording();
    expect(latest).toBeNull();
  });

  test("touchRecording updates lastAccessedAt", async () => {
    await repo.insertRecording(makeRecord());

    await repo.touchRecording("rec-1", "2025-06-01T00:00:00.000Z");

    const result = await repo.getRecording("rec-1");
    expect(result!.lastAccessedAt).toBe("2025-06-01T00:00:00.000Z");
  });

  test("deleteRecording removes the recording and returns true", async () => {
    await repo.insertRecording(makeRecord());

    const deleted = await repo.deleteRecording("rec-1");
    expect(deleted).toBe(true);

    const result = await repo.getRecording("rec-1");
    expect(result).toBeNull();
  });

  test("deleteRecording returns false for nonexistent recording", async () => {
    const deleted = await repo.deleteRecording("nonexistent");
    expect(deleted).toBe(false);
  });

  test("updateRecording can update highlights", async () => {
    await repo.insertRecording(makeRecord());

    await repo.updateRecording("rec-1", {
      highlights: [
        {
          description: "swipe gesture",
          shape: { type: "circle", cx: 50, cy: 50, r: 20 },
          timeline: { appearedAtSeconds: 0.5 },
        },
      ],
    });

    const result = await repo.getRecording("rec-1");
    expect(result!.highlights).toHaveLength(1);
    expect(result!.highlights![0].description).toBe("swipe gesture");
  });
});
