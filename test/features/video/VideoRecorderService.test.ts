import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import {
  VideoRecorderService,
  parseVideoRecordingConfig,
  DEFAULT_VIDEO_RECORDING_CONFIG,
} from "../../../src/features/video/VideoRecorderService";
import { FakeVideoCaptureBackend } from "../../fakes/FakeVideoCaptureBackend";

describe("parseVideoRecordingConfig", () => {
  test("returns defaults for null input", () => {
    const config = parseVideoRecordingConfig(null);
    expect(config.qualityPreset).toBe("low");
    expect(config.fps).toBe(15);
    expect(config.format).toBe("mp4");
    expect(config.targetBitrateKbps).toBe(1000);
    expect(config.maxThroughputMbps).toBe(5);
    expect(config.maxArchiveSizeMb).toBe(100);
  });

  test("returns defaults for undefined input", () => {
    const config = parseVideoRecordingConfig(undefined);
    expect(config).toEqual(DEFAULT_VIDEO_RECORDING_CONFIG);
  });

  test("returns defaults for non-object input", () => {
    const config = parseVideoRecordingConfig("invalid" as any);
    expect(config.qualityPreset).toBe("low");
  });

  test("accepts valid quality preset", () => {
    expect(parseVideoRecordingConfig({ qualityPreset: "high" }).qualityPreset).toBe("high");
    expect(parseVideoRecordingConfig({ qualityPreset: "medium" }).qualityPreset).toBe("medium");
    expect(parseVideoRecordingConfig({ qualityPreset: "low" }).qualityPreset).toBe("low");
  });

  test("falls back on invalid quality preset", () => {
    expect(parseVideoRecordingConfig({ qualityPreset: "ultra" as any }).qualityPreset).toBe("low");
  });

  test("accepts valid fps", () => {
    expect(parseVideoRecordingConfig({ fps: 30 }).fps).toBe(30);
  });

  test("falls back on invalid fps", () => {
    expect(parseVideoRecordingConfig({ fps: -1 }).fps).toBe(15);
    expect(parseVideoRecordingConfig({ fps: 0 }).fps).toBe(15);
  });

  test("rounds fps to integer", () => {
    expect(parseVideoRecordingConfig({ fps: 29.7 }).fps).toBe(30);
  });

  test("accepts valid format", () => {
    expect(parseVideoRecordingConfig({ format: "mp4" }).format).toBe("mp4");
  });

  test("falls back on invalid format", () => {
    expect(parseVideoRecordingConfig({ format: "avi" as any }).format).toBe("mp4");
  });

  test("caps bitrate to max throughput", () => {
    const config = parseVideoRecordingConfig({
      targetBitrateKbps: 10000,
      maxThroughputMbps: 2,
    });
    expect(config.targetBitrateKbps).toBe(2000);
  });

  test("accepts valid resolution", () => {
    const config = parseVideoRecordingConfig({
      resolution: { width: 1920, height: 1080 },
    });
    expect(config.resolution).toEqual({ width: 1920, height: 1080 });
  });

  test("ignores invalid resolution", () => {
    expect(parseVideoRecordingConfig({ resolution: { width: 0, height: 100 } }).resolution).toBeUndefined();
    expect(parseVideoRecordingConfig({ resolution: null as any }).resolution).toBeUndefined();
  });
});

describe("VideoRecorderService", () => {
  let backend: FakeVideoCaptureBackend;
  let service: VideoRecorderService;
  let archiveRoot: string;
  let idCounter: number;

  beforeEach(async () => {
    backend = new FakeVideoCaptureBackend();
    archiveRoot = path.join(os.tmpdir(), `video-test-${Date.now()}`);
    idCounter = 0;

    service = new VideoRecorderService({
      backend,
      archiveRoot,
      idGenerator: () => `rec-${++idCounter}`,
      now: () => new Date("2024-01-15T10:30:00.000Z"),
    });
  });

  afterEach(async () => {
    await fs.remove(archiveRoot);
  });

  describe("startRecording", () => {
    test("returns recording info with generated id", async () => {
      const result = await service.startRecording();
      expect(result.recordingId).toBe("rec-1");
      expect(result.startedAt).toBe("2024-01-15T10:30:00.000Z");
      expect(result.config.qualityPreset).toBe("low");
    });

    test("passes config to backend", async () => {
      await service.startRecording({ config: { qualityPreset: "high", fps: 30 } });
      expect(backend.startCalls).toHaveLength(1);
      expect(backend.startCalls[0].qualityPreset).toBe("high");
      expect(backend.startCalls[0].fps).toBe(30);
    });

    test("creates output directory", async () => {
      await service.startRecording();
      const dir = path.join(archiveRoot, "rec-1");
      expect(await fs.pathExists(dir)).toBe(true);
    });

    test("passes outputName through", async () => {
      const result = await service.startRecording({ outputName: "my-video" });
      expect(result.outputName).toBe("my-video");
    });

    test("generates unique ids for multiple recordings", async () => {
      const r1 = await service.startRecording();
      const r2 = await service.startRecording();
      expect(r1.recordingId).toBe("rec-1");
      expect(r2.recordingId).toBe("rec-2");
    });
  });

  describe("stopRecording", () => {
    test("returns metadata after stopping", async () => {
      const recording = await service.startRecording();
      backend.setStopResultOverrides({
        endedAt: "2024-01-15T10:31:00.000Z",
        sizeBytes: 12345,
        codec: "h264",
      });

      const metadata = await service.stopRecording(recording.recordingId);
      expect(metadata.recordingId).toBe("rec-1");
      expect(metadata.endedAt).toBe("2024-01-15T10:31:00.000Z");
      expect(metadata.sizeBytes).toBe(12345);
      expect(metadata.codec).toBe("h264");
      expect(metadata.format).toBe("mp4");
    });

    test("throws for unknown recording id", async () => {
      await expect(service.stopRecording("nonexistent")).rejects.toThrow(
        "No active recording found"
      );
    });

    test("removes recording from active set", async () => {
      const recording = await service.startRecording();
      await service.stopRecording(recording.recordingId);

      await expect(service.stopRecording(recording.recordingId)).rejects.toThrow(
        "No active recording found"
      );
    });

    test("calculates duration from start/end times", async () => {
      const recording = await service.startRecording();
      backend.setStopResultOverrides({
        endedAt: "2024-01-15T10:31:00.000Z",
        durationMs: undefined,
      });

      const metadata = await service.stopRecording(recording.recordingId);
      expect(metadata.durationMs).toBe(60000); // 1 minute
    });

    test("calls backend.stop with handle", async () => {
      const recording = await service.startRecording();
      await service.stopRecording(recording.recordingId);

      expect(backend.stopCalls).toHaveLength(1);
      expect(backend.stopCalls[0].recordingId).toBe("rec-1");
    });
  });
});
