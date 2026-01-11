import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  VideoFormat,
  VideoRecordingConfig,
  VideoRecordingConfigInput,
  VideoRecordingMetadata,
  VideoQualityPreset,
  BootedDevice,
  VideoResolution,
} from "../../models";
import { logger, type Logger } from "../../utils/logger";

export interface VideoCaptureConfig extends VideoRecordingConfig {
  recordingId: string;
  outputDirectory: string;
  outputPath: string;
  fileName: string;
  startedAt: string;
  device?: BootedDevice;
  maxDurationSeconds?: number;
}

export interface RecordingHandle {
  recordingId: string;
  outputPath: string;
  startedAt: string;
  backendHandle?: unknown;
}

export interface RecordingResult {
  recordingId: string;
  outputPath: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  sizeBytes?: number;
  codec?: string;
}

export interface VideoCaptureBackend {
  start(config: VideoCaptureConfig): Promise<RecordingHandle>;
  stop(handle: RecordingHandle): Promise<RecordingResult>;
}

export interface StartVideoRecordingOptions {
  outputName?: string;
  config?: VideoRecordingConfigInput | null;
  device?: BootedDevice;
  maxDurationSeconds?: number;
}

export interface ActiveVideoRecording {
  recordingId: string;
  outputPath: string;
  fileName: string;
  startedAt: string;
  config: VideoRecordingConfig;
  outputName?: string;
}

export interface VideoRecorderServiceDependencies {
  backend: VideoCaptureBackend;
  archiveRoot?: string;
  logger?: Pick<Logger, "info" | "warn" | "error" | "debug">;
  idGenerator?: () => string;
  now?: () => Date;
}

interface ActiveRecordingState extends ActiveVideoRecording {
  handle: RecordingHandle;
}

export const DEFAULT_VIDEO_RECORDING_CONFIG: VideoRecordingConfig = {
  qualityPreset: "low",
  targetBitrateKbps: 1000,
  maxThroughputMbps: 5,
  fps: 15,
  maxArchiveSizeMb: 100,
  format: "mp4",
};

const QUALITY_PRESETS = new Set<VideoQualityPreset>(["low", "medium", "high"]);
const VIDEO_FORMATS = new Set<VideoFormat>(["mp4"]);

export function parseVideoRecordingConfig(
  input: VideoRecordingConfigInput | null | undefined
): VideoRecordingConfig {
  const safeInput: VideoRecordingConfigInput =
    input && typeof input === "object" ? input : {};

  const qualityPreset = parseQualityPreset(safeInput.qualityPreset);
  const maxThroughputMbps = parsePositiveNumber(
    safeInput.maxThroughputMbps,
    DEFAULT_VIDEO_RECORDING_CONFIG.maxThroughputMbps,
    true
  );
  const requestedBitrateKbps = parsePositiveNumber(
    safeInput.targetBitrateKbps,
    DEFAULT_VIDEO_RECORDING_CONFIG.targetBitrateKbps,
    true
  );
  const targetBitrateKbps = capBitrateKbps(requestedBitrateKbps, maxThroughputMbps);
  const fps = parsePositiveNumber(
    safeInput.fps,
    DEFAULT_VIDEO_RECORDING_CONFIG.fps,
    false
  );
  const maxArchiveSizeMb = parsePositiveNumber(
    safeInput.maxArchiveSizeMb,
    DEFAULT_VIDEO_RECORDING_CONFIG.maxArchiveSizeMb,
    true
  );
  const format = parseFormat(safeInput.format);
  const resolution = parseResolution(safeInput.resolution);

  return {
    qualityPreset,
    targetBitrateKbps,
    maxThroughputMbps,
    fps,
    maxArchiveSizeMb,
    format,
    resolution,
  };
}

export class VideoRecorderService {
  private backend: VideoCaptureBackend;
  private archiveRoot: string;
  private log: Pick<Logger, "info" | "warn" | "error" | "debug">;
  private idGenerator: () => string;
  private now: () => Date;
  private activeRecordings = new Map<string, ActiveRecordingState>();

  constructor(dependencies: VideoRecorderServiceDependencies) {
    this.backend = dependencies.backend;
    this.archiveRoot =
      dependencies.archiveRoot ??
      path.join(os.homedir(), ".auto-mobile", "video-archive");
    this.log = dependencies.logger ?? logger;
    this.idGenerator = dependencies.idGenerator ?? (() => randomUUID());
    this.now = dependencies.now ?? (() => new Date());
  }

  async startRecording(
    options: StartVideoRecordingOptions = {}
  ): Promise<ActiveVideoRecording> {
    const config = parseVideoRecordingConfig(options.config);
    const recordingId = this.idGenerator();
    const startedAt = this.now().toISOString();
    const recordingDir = this.getRecordingDir(recordingId);

    await fs.ensureDir(recordingDir);

    const fileName = buildRecordingFileName(recordingId, startedAt, config.format);
    const outputPath = path.join(recordingDir, fileName);

    const handle = await this.backend.start({
      recordingId,
      outputDirectory: recordingDir,
      outputPath,
      fileName,
      startedAt,
      device: options.device,
      maxDurationSeconds: options.maxDurationSeconds,
      ...config,
    });

    const resolvedOutputPath = handle.outputPath || outputPath;
    const resolvedFileName = path.basename(resolvedOutputPath);

    const active: ActiveRecordingState = {
      recordingId,
      outputPath: resolvedOutputPath,
      fileName: resolvedFileName,
      startedAt: handle.startedAt || startedAt,
      config,
      outputName: options.outputName,
      handle,
    };

    this.activeRecordings.set(recordingId, active);

    return {
      recordingId,
      outputPath: active.outputPath,
      fileName: active.fileName,
      startedAt: active.startedAt,
      config: active.config,
      outputName: active.outputName,
    };
  }

  async stopRecording(recordingId: string): Promise<VideoRecordingMetadata> {
    const active = this.activeRecordings.get(recordingId);
    if (!active) {
      throw new Error(`No active recording found for id ${recordingId}`);
    }

    const stopResult = await this.backend.stop(active.handle);
    const endedAt = stopResult.endedAt ?? this.now().toISOString();
    const outputPath = stopResult.outputPath || active.outputPath;
    const fileName = path.basename(outputPath);
    const fileStats = await this.safeStat(outputPath);
    const sizeBytes = stopResult.sizeBytes ?? fileStats?.size ?? 0;

    const durationMs =
      stopResult.durationMs ??
      calculateDurationMs(active.startedAt, endedAt);

    const metadata: VideoRecordingMetadata = {
      recordingId: active.recordingId,
      fileName,
      filePath: outputPath,
      format: active.config.format,
      sizeBytes,
      durationMs,
      codec: stopResult.codec,
      outputName: active.outputName,
      createdAt: active.startedAt,
      startedAt: active.startedAt,
      endedAt,
      lastAccessedAt: endedAt,
      config: active.config,
    };

    this.activeRecordings.delete(recordingId);

    return metadata;
  }

  private getRecordingDir(recordingId: string): string {
    return path.join(this.archiveRoot, recordingId);
  }

  private async safeStat(filePath: string): Promise<fs.Stats | null> {
    try {
      return await fs.stat(filePath);
    } catch {
      this.log.warn(`[VideoRecorderService] Missing recording file at ${filePath}`);
      return null;
    }
  }
}

function parseQualityPreset(
  value: VideoRecordingConfigInput["qualityPreset"]
): VideoQualityPreset {
  if (typeof value === "string" && QUALITY_PRESETS.has(value as VideoQualityPreset)) {
    return value as VideoQualityPreset;
  }

  return DEFAULT_VIDEO_RECORDING_CONFIG.qualityPreset;
}

function parseFormat(
  value: VideoRecordingConfigInput["format"]
): VideoFormat {
  if (typeof value === "string" && VIDEO_FORMATS.has(value as VideoFormat)) {
    return value as VideoFormat;
  }

  return DEFAULT_VIDEO_RECORDING_CONFIG.format;
}

function parseResolution(
  value: VideoRecordingConfigInput["resolution"]
): VideoResolution | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const width = parsePositiveNumber(value.width, 0, false);
  const height = parsePositiveNumber(value.height, 0, false);

  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return { width, height };
}

function capBitrateKbps(targetBitrateKbps: number, maxThroughputMbps: number): number {
  const maxBitrateKbps = Math.max(0, Math.floor(maxThroughputMbps * 1000));
  if (!maxBitrateKbps) {
    return targetBitrateKbps;
  }

  return Math.min(targetBitrateKbps, maxBitrateKbps);
}

function parsePositiveNumber(
  value: number | string | undefined,
  defaultValue: number,
  allowFloat: boolean
): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return allowFloat ? parsed : Math.round(parsed);
}

function buildRecordingFileName(
  recordingId: string,
  startedAt: string,
  format: VideoFormat
): string {
  const timestamp = formatTimestampForFilename(startedAt);
  return `${recordingId}-${timestamp}.${format}`;
}

function formatTimestampForFilename(isoTimestamp: string): string {
  const sanitized = isoTimestamp.replace(/[-:]/g, "");
  return sanitized.replace(/\.\d{3}Z$/, "Z");
}

function calculateDurationMs(startedAt: string, endedAt: string): number | undefined {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}
