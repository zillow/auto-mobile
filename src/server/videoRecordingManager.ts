import { ActionableError, BootedDevice, VideoRecordingConfigInput, VideoRecordingMetadata } from "../models";
import {
  PlatformVideoCaptureBackend,
  FfmpegVideoCaptureBackend,
  VideoRecorderService,
  type ActiveVideoRecording,
  type VideoCaptureBackend,
} from "../features/video";
import { serverConfig } from "../utils/ServerConfig";
import { logger } from "../utils/logger";
import { defaultTimer, type Timer } from "../utils/SystemTimer";
import { spawn } from "node:child_process";

export interface StartVideoRecordingRequest {
  device: BootedDevice;
  configOverrides?: VideoRecordingConfigInput;
  outputName?: string;
  maxDurationSeconds?: number;
}

export interface VideoRecordingManagerDependencies {
  videoRecorderService: VideoRecorderService;
  timer: Timer;
}

let moduleDependencies: VideoRecordingManagerDependencies | null = null;

const activeRecordingIds = new Set<string>();
const autoStopTimers = new Map<string, { timer: Timer; handle: NodeJS.Timeout }>();
let latestActiveRecordingId: string | null = null;

async function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    const process = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    process.once("error", () => resolve(false));
    process.once("exit", code => resolve(code === 0));
  });
}

async function selectBackend(): Promise<VideoCaptureBackend> {
  const ffmpegAvailable = await checkFfmpegAvailable();

  if (ffmpegAvailable) {
    logger.debug("[VideoRecording] FFmpeg available, using FfmpegVideoCaptureBackend");
    return new FfmpegVideoCaptureBackend();
  }

  logger.debug("[VideoRecording] FFmpeg not available, using PlatformVideoCaptureBackend");
  return new PlatformVideoCaptureBackend();
}

async function createRecorderService(): Promise<VideoRecorderService> {
  const backend = await selectBackend();
  return new VideoRecorderService({ backend });
}

async function getVideoRecordingDependencies(): Promise<VideoRecordingManagerDependencies> {
  if (!moduleDependencies) {
    moduleDependencies = {
      videoRecorderService: await createRecorderService(),
      timer: defaultTimer,
    };
  }
  return moduleDependencies;
}

export async function setVideoRecordingManagerDependencies(
  deps: Partial<VideoRecordingManagerDependencies>
): Promise<void> {
  const current = await getVideoRecordingDependencies();
  moduleDependencies = {
    videoRecorderService: deps.videoRecorderService ?? current.videoRecorderService,
    timer: deps.timer ?? current.timer,
  };
  resetVideoRecordingManagerState();
}

export function resetVideoRecordingManagerState(): void {
  for (const { timer, handle } of autoStopTimers.values()) {
    timer.clearTimeout(handle);
  }
  autoStopTimers.clear();
  activeRecordingIds.clear();
  latestActiveRecordingId = null;
}

export function resetVideoRecordingManagerDependencies(): void {
  resetVideoRecordingManagerState();
  moduleDependencies = null;
}

function mergeConfigInput(
  defaults: VideoRecordingConfigInput,
  overrides: VideoRecordingConfigInput
): VideoRecordingConfigInput {
  const merged: VideoRecordingConfigInput = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

function resolveActiveRecordingId(recordingId?: string): string {
  if (recordingId) {
    return recordingId;
  }

  if (latestActiveRecordingId && activeRecordingIds.has(latestActiveRecordingId)) {
    return latestActiveRecordingId;
  }

  const [firstActive] = activeRecordingIds;
  if (firstActive) {
    return firstActive;
  }

  throw new ActionableError("No active video recording found. Provide recordingId.");
}

async function scheduleAutoStop(recordingId: string, maxDurationSeconds: number): Promise<void> {
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0) {
    return;
  }

  const { timer } = await getVideoRecordingDependencies();
  const timeoutMs = Math.max(1, Math.round(maxDurationSeconds * 1000));
  const handle = timer.setTimeout(() => {
    void stopVideoRecording(recordingId).catch(error => {
      logger.warn(`[VideoRecording] Failed to auto-stop recording ${recordingId}: ${error}`);
    });
  }, timeoutMs);

  autoStopTimers.set(recordingId, { timer, handle });
}

function clearAutoStop(recordingId: string): void {
  const entry = autoStopTimers.get(recordingId);
  if (entry) {
    entry.timer.clearTimeout(entry.handle);
    autoStopTimers.delete(recordingId);
  }
}

export async function getVideoRecorderService(): Promise<VideoRecorderService> {
  return (await getVideoRecordingDependencies()).videoRecorderService;
}

export async function startVideoRecording(
  request: StartVideoRecordingRequest
): Promise<ActiveVideoRecording> {
  const { videoRecorderService } = await getVideoRecordingDependencies();
  const defaults = serverConfig.getVideoRecordingDefaults();
  const overrides = request.configOverrides ?? {};
  const configInput = mergeConfigInput(defaults, overrides);

  const active = await videoRecorderService.startRecording({
    outputName: request.outputName,
    config: configInput,
    device: request.device,
    maxDurationSeconds: request.maxDurationSeconds,
  });

  activeRecordingIds.add(active.recordingId);
  latestActiveRecordingId = active.recordingId;

  if (request.maxDurationSeconds) {
    await scheduleAutoStop(active.recordingId, request.maxDurationSeconds);
  }

  return active;
}

export async function stopVideoRecording(
  recordingId?: string
): Promise<VideoRecordingMetadata> {
  const { videoRecorderService } = await getVideoRecordingDependencies();
  const resolvedId = resolveActiveRecordingId(recordingId);

  clearAutoStop(resolvedId);

  const metadata = await videoRecorderService.stopRecording(resolvedId);

  activeRecordingIds.delete(resolvedId);
  if (latestActiveRecordingId === resolvedId) {
    latestActiveRecordingId = null;
  }

  return metadata;
}

export async function listVideoRecordings(): Promise<VideoRecordingMetadata[]> {
  return (await getVideoRecordingDependencies()).videoRecorderService.listRecordings();
}

export async function getVideoRecordingMetadata(
  recordingId: string,
  options?: { touch?: boolean }
): Promise<VideoRecordingMetadata | null> {
  return (await getVideoRecordingDependencies()).videoRecorderService.getRecordingMetadata(recordingId, options);
}

export async function getLatestVideoRecordingMetadata(): Promise<VideoRecordingMetadata | null> {
  const recordings = await listVideoRecordings();
  return recordings[0] ?? null;
}

export async function deleteVideoRecording(recordingId: string): Promise<boolean> {
  return (await getVideoRecordingDependencies()).videoRecorderService.deleteRecording(recordingId);
}
