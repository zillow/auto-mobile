export type VideoQualityPreset = "low" | "medium" | "high";

export type VideoFormat = "mp4";

export interface VideoRecordingConfig {
  qualityPreset: VideoQualityPreset;
  targetBitrateKbps: number;
  maxThroughputMbps: number;
  fps: number;
  maxArchiveSizeMb: number;
  format: VideoFormat;
}

export interface VideoRecordingConfigInput {
  qualityPreset?: VideoQualityPreset | string;
  targetBitrateKbps?: number | string;
  maxThroughputMbps?: number | string;
  fps?: number | string;
  maxArchiveSizeMb?: number | string;
  format?: VideoFormat | string;
}

export interface VideoRecordingMetadata {
  recordingId: string;
  fileName: string;
  filePath: string;
  format: VideoFormat;
  sizeBytes: number;
  durationMs?: number;
  codec?: string;
  outputName?: string;
  createdAt: string;
  startedAt: string;
  endedAt?: string;
  lastAccessedAt: string;
  config: VideoRecordingConfig;
}
