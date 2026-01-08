import { ActionableError, BootedDevice, VideoRecordingConfigInput, VideoRecordingMetadata } from "../models";
import {
  PlatformVideoCaptureBackend,
  VideoRecorderService,
  type ActiveVideoRecording,
} from "../features/video";
import { serverConfig } from "../utils/ServerConfig";
import { logger } from "../utils/logger";
import { defaultTimer, type Timer } from "../utils/SystemTimer";

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

function createDefaultRecorderService(): VideoRecorderService {
  return new VideoRecorderService({
    backend: new PlatformVideoCaptureBackend(),
  });
}

function getVideoRecordingDependencies(): VideoRecordingManagerDependencies {
  if (!moduleDependencies) {
    moduleDependencies = {
      videoRecorderService: createDefaultRecorderService(),
      timer: defaultTimer,
    };
  }
  return moduleDependencies;
}

export function setVideoRecordingManagerDependencies(
  deps: Partial<VideoRecordingManagerDependencies>
): void {
  const current = getVideoRecordingDependencies();
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

function scheduleAutoStop(recordingId: string, maxDurationSeconds: number): void {
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0) {
    return;
  }

  const { timer } = getVideoRecordingDependencies();
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

export function getVideoRecorderService(): VideoRecorderService {
  return getVideoRecordingDependencies().videoRecorderService;
}

export async function startVideoRecording(
  request: StartVideoRecordingRequest
): Promise<ActiveVideoRecording> {
  const { videoRecorderService } = getVideoRecordingDependencies();
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
    scheduleAutoStop(active.recordingId, request.maxDurationSeconds);
  }

  return active;
}

export async function stopVideoRecording(
  recordingId?: string
): Promise<VideoRecordingMetadata> {
  const { videoRecorderService } = getVideoRecordingDependencies();
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
  return getVideoRecordingDependencies().videoRecorderService.listRecordings();
}

export async function getVideoRecordingMetadata(
  recordingId: string,
  options?: { touch?: boolean }
): Promise<VideoRecordingMetadata | null> {
  return getVideoRecordingDependencies().videoRecorderService.getRecordingMetadata(recordingId, options);
}

export async function getLatestVideoRecordingMetadata(): Promise<VideoRecordingMetadata | null> {
  const recordings = await listVideoRecordings();
  return recordings[0] ?? null;
}

export async function deleteVideoRecording(recordingId: string): Promise<boolean> {
  return getVideoRecordingDependencies().videoRecorderService.deleteRecording(recordingId);
}
