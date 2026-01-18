import fs from "fs-extra";
import path from "node:path";
import {
  ActionableError,
  BootedDevice,
  VideoRecordingConfig,
  VideoRecordingConfigInput,
  VideoRecordingHighlightEntry,
  VideoRecordingHighlightInput,
  VideoRecordingMetadata,
} from "../models";
import {
  FfmpegVideoProcessingBackend,
  VideoRecorderService,
  parseVideoRecordingConfig,
  type ActiveVideoRecording,
  type VideoCaptureBackend,
} from "../features/video";
import { serverConfig } from "../utils/ServerConfig";
import { logger } from "../utils/logger";
import { defaultTimer, type Timer } from "../utils/SystemTimer";
import { ResourceRegistry } from "./resourceRegistry";
import {
  VideoRecordingRepository,
  type VideoRecordingRecord,
} from "../db/videoRecordingRepository";
import { VideoRecordingConfigRepository } from "../db/videoRecordingConfigRepository";
import { buildVideoArchiveItemUri, VIDEO_RESOURCE_URIS } from "./videoRecordingResourceUris";
import { VisualHighlightClient } from "../features/debug/VisualHighlight";

const DEFAULT_MAX_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 300;
// Keep in sync with HighlightAnimator's total fade-in + display + fade-out duration.
const HIGHLIGHT_ANIMATION_DURATION_MS = 6000;

export interface StartVideoRecordingRequest {
  device: BootedDevice;
  configOverrides?: VideoRecordingConfigInput;
  outputName?: string;
  maxDurationSeconds?: number;
  highlights?: VideoRecordingHighlightInput[];
}

export interface StopVideoRecordingResult {
  metadata: VideoRecordingMetadata;
  evictedRecordingIds: string[];
}

export interface VideoRecordingConfigUpdateResult {
  config: VideoRecordingConfig;
  evictedRecordingIds: string[];
}

export interface VideoArchiveEvictionResult {
  evictedRecordingIds: string[];
  currentSizeBytes: number;
  maxSizeBytes: number;
}

export interface VideoRecordingManagerDependencies {
  videoRecorderService: VideoRecorderService;
  recordingRepository: VideoRecordingRepository;
  configRepository: VideoRecordingConfigRepository;
  highlightClient: VisualHighlightClient;
  timer: Timer;
  now: () => Date;
}

interface RecordedHighlightEntry {
  description?: string;
  shape: VideoRecordingHighlightInput["shape"];
  appearedAtMs: number;
  disappearedAtMs: number;
}

interface VideoRecordingHighlightSession {
  recordingId: string;
  deviceId: string;
  platform: BootedDevice["platform"];
  startedAtMs: number;
  highlights: RecordedHighlightEntry[];
  timer: Timer;
  timers: Set<NodeJS.Timeout>;
}

let moduleDependencies: VideoRecordingManagerDependencies | null = null;
let managerInitialized = false;

const autoStopTimers = new Map<string, { timer: Timer; handle: NodeJS.Timeout }>();
const highlightSessions = new Map<string, VideoRecordingHighlightSession>();
const highlightSessionsByDeviceId = new Map<string, string>();

async function selectBackend(): Promise<VideoCaptureBackend> {
  logger.debug("[VideoRecording] Using FfmpegVideoProcessingBackend");
  return new FfmpegVideoProcessingBackend();
}

async function createRecorderService(): Promise<VideoRecorderService> {
  const backend = await selectBackend();
  return new VideoRecorderService({ backend });
}

async function initializeVideoRecordingState(
  deps: VideoRecordingManagerDependencies
): Promise<void> {
  if (managerInitialized) {
    return;
  }
  managerInitialized = true;

  const active = await deps.recordingRepository.listRecordings({ status: "recording" });
  if (active.length === 0) {
    return;
  }

  const endedAt = deps.now().toISOString();

  for (const record of active) {
    const sizeBytes = await getFileSize(record.filePath);
    const durationMs = calculateDurationMs(record.startedAt, endedAt);
    await deps.recordingRepository.updateRecording(record.recordingId, {
      status: "interrupted",
      endedAt,
      lastAccessedAt: endedAt,
      sizeBytes,
      durationMs,
    });
  }

  logger.info(
    `[VideoRecording] Marked ${active.length} recording(s) as interrupted after restart`
  );
}

async function getVideoRecordingDependencies(): Promise<VideoRecordingManagerDependencies> {
  if (!moduleDependencies) {
    moduleDependencies = {
      videoRecorderService: await createRecorderService(),
      recordingRepository: new VideoRecordingRepository(),
      configRepository: new VideoRecordingConfigRepository(),
      highlightClient: new VisualHighlightClient(),
      timer: defaultTimer,
      now: () => new Date(),
    };
  }

  await initializeVideoRecordingState(moduleDependencies);
  return moduleDependencies;
}

export async function setVideoRecordingManagerDependencies(
  deps: Partial<VideoRecordingManagerDependencies>
): Promise<void> {
  const current = moduleDependencies ?? {
    videoRecorderService: deps.videoRecorderService ?? await createRecorderService(),
    recordingRepository: deps.recordingRepository ?? new VideoRecordingRepository(),
    configRepository: deps.configRepository ?? new VideoRecordingConfigRepository(),
    highlightClient: deps.highlightClient ?? new VisualHighlightClient(),
    timer: deps.timer ?? defaultTimer,
    now: deps.now ?? (() => new Date()),
  };
  moduleDependencies = {
    videoRecorderService: deps.videoRecorderService ?? current.videoRecorderService,
    recordingRepository: deps.recordingRepository ?? current.recordingRepository,
    configRepository: deps.configRepository ?? current.configRepository,
    highlightClient: deps.highlightClient ?? current.highlightClient,
    timer: deps.timer ?? current.timer,
    now: deps.now ?? current.now,
  };
  resetVideoRecordingManagerState();
}

export function resetVideoRecordingManagerState(): void {
  for (const { timer, handle } of autoStopTimers.values()) {
    timer.clearTimeout(handle);
  }
  autoStopTimers.clear();
  for (const session of highlightSessions.values()) {
    for (const handle of session.timers) {
      session.timer.clearTimeout(handle);
    }
  }
  highlightSessions.clear();
  highlightSessionsByDeviceId.clear();
  managerInitialized = false;
}

export function resetVideoRecordingManagerDependencies(): void {
  resetVideoRecordingManagerState();
  moduleDependencies = null;
}

function mergeConfigInput(
  defaults: VideoRecordingConfigInput,
  overrides: VideoRecordingConfigInput
): VideoRecordingConfigInput {
  return {
    qualityPreset: overrides.qualityPreset ?? defaults.qualityPreset,
    targetBitrateKbps: overrides.targetBitrateKbps ?? defaults.targetBitrateKbps,
    maxThroughputMbps: overrides.maxThroughputMbps ?? defaults.maxThroughputMbps,
    fps: overrides.fps ?? defaults.fps,
    maxArchiveSizeMb: overrides.maxArchiveSizeMb ?? defaults.maxArchiveSizeMb,
    format: overrides.format ?? defaults.format,
    resolution: overrides.resolution ?? defaults.resolution,
  };
}

function configToInput(config: VideoRecordingConfig): VideoRecordingConfigInput {
  return {
    qualityPreset: config.qualityPreset,
    targetBitrateKbps: config.targetBitrateKbps,
    maxThroughputMbps: config.maxThroughputMbps,
    fps: config.fps,
    maxArchiveSizeMb: config.maxArchiveSizeMb,
    format: config.format,
    resolution: config.resolution,
  };
}

function resolveMaxDurationSeconds(value?: number): number {
  if (value === undefined) {
    return DEFAULT_MAX_DURATION_SECONDS;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new ActionableError("maxDuration must be a positive number of seconds.");
  }
  if (value > MAX_DURATION_SECONDS) {
    throw new ActionableError(`maxDuration must be <= ${MAX_DURATION_SECONDS} seconds.`);
  }
  return Math.round(value);
}

async function resolveActiveRecordingId(recordingId?: string): Promise<string> {
  if (recordingId) {
    return recordingId;
  }

  const { recordingRepository } = await getVideoRecordingDependencies();
  const active = await recordingRepository.listRecordings({ status: "recording" });

  if (active.length === 0) {
    throw new ActionableError("No active video recording found. Provide recordingId.");
  }

  if (active.length > 1) {
    throw new ActionableError(
      "Multiple active video recordings found. Provide recordingId."
    );
  }

  return active[0].recordingId;
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

function getHighlightSessionByDevice(deviceId: string): VideoRecordingHighlightSession | null {
  const recordingId = highlightSessionsByDeviceId.get(deviceId);
  if (!recordingId) {
    return null;
  }
  return highlightSessions.get(recordingId) ?? null;
}

function getElapsedMs(session: VideoRecordingHighlightSession, timestampMs: number): number {
  if (!Number.isFinite(timestampMs)) {
    return 0;
  }
  return Math.max(0, Math.round(timestampMs - session.startedAtMs));
}

function toSeconds(valueMs: number): number {
  const roundedMs = Math.max(0, Math.round(valueMs));
  return Number((roundedMs / 1000).toFixed(3));
}

function recordHighlightAdded(
  session: VideoRecordingHighlightSession,
  highlight: VideoRecordingHighlightInput,
  timestampMs: number
): void {
  const appearedAtMs = getElapsedMs(session, timestampMs);
  session.highlights.push({
    description: highlight.description,
    shape: highlight.shape,
    appearedAtMs,
    disappearedAtMs: appearedAtMs + HIGHLIGHT_ANIMATION_DURATION_MS,
  });
}

function generateHighlightId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `highlight_${timestamp}_${random}`;
}

function finalizeHighlightSession(
  session: VideoRecordingHighlightSession,
  endedAt: string
): VideoRecordingHighlightEntry[] | undefined {
  if (session.highlights.length === 0) {
    return undefined;
  }

  const endedAtMs = Date.parse(endedAt);
  const elapsedMs = getElapsedMs(session, endedAtMs);

  return session.highlights
    .map(highlight => {
      const disappearedAtMs = Math.min(highlight.disappearedAtMs, elapsedMs);
      return {
        description: highlight.description,
        shape: highlight.shape,
        timeline: {
          appearedAtSeconds: toSeconds(highlight.appearedAtMs),
          disappearedAtSeconds: toSeconds(disappearedAtMs),
        },
      };
    })
    .sort((left, right) => left.timeline.appearedAtSeconds - right.timeline.appearedAtSeconds);
}

function createHighlightSession(
  recordingId: string,
  device: BootedDevice,
  startedAt: string,
  timer: Timer
): VideoRecordingHighlightSession {
  const startedAtMs = Date.parse(startedAt);
  return {
    recordingId,
    deviceId: device.deviceId,
    platform: device.platform,
    startedAtMs: Number.isNaN(startedAtMs) ? Date.now() : startedAtMs,
    highlights: [],
    timer,
    timers: new Set(),
  };
}

function disposeHighlightSession(recordingId: string): VideoRecordingHighlightSession | null {
  const session = highlightSessions.get(recordingId);
  if (!session) {
    return null;
  }
  for (const handle of session.timers) {
    session.timer.clearTimeout(handle);
  }
  session.timers.clear();
  highlightSessions.delete(recordingId);
  highlightSessionsByDeviceId.delete(session.deviceId);
  return session;
}

function normalizeHighlightTiming(
  highlight: VideoRecordingHighlightInput
): { startMs: number } {
  const startMs = highlight.timing?.startTimeMs ?? 0;
  if (!Number.isFinite(startMs) || startMs < 0) {
    throw new ActionableError("highlight.timing.startTimeMs must be >= 0.");
  }
  return { startMs };
}

async function scheduleRecordingHighlights(
  session: VideoRecordingHighlightSession,
  device: BootedDevice,
  highlights: VideoRecordingHighlightInput[],
  deps: VideoRecordingManagerDependencies
): Promise<void> {
  const options = {
    device,
    deviceId: device.deviceId,
    platform: device.platform,
  };

  const immediateTasks: Array<Promise<void>> = [];

  const schedule = (delayMs: number, action: () => Promise<void>) => {
    const timeoutMs = Math.max(0, Math.round(delayMs));
    if (timeoutMs === 0) {
      immediateTasks.push(action());
      return;
    }
    const handle = session.timer.setTimeout(() => {
      void action();
    }, timeoutMs);
    session.timers.add(handle);
  };

  const addHighlight = async (highlight: VideoRecordingHighlightInput) => {
    try {
      const highlightId = generateHighlightId();
      await deps.highlightClient.addHighlight(highlightId, highlight.shape, options);
      recordHighlightAdded(session, highlight, deps.now().getTime());
    } catch (error) {
      logger.warn(`[VideoRecording] Failed to add highlight: ${error}`);
    }
  };

  for (const highlight of highlights) {
    const { startMs } = normalizeHighlightTiming(highlight);
    schedule(startMs, () => addHighlight(highlight));
  }

  if (immediateTasks.length > 0) {
    await Promise.all(immediateTasks);
  }
}

async function resolveConfigInput(
  overrides: VideoRecordingConfigInput
): Promise<VideoRecordingConfigInput> {
  const { configRepository } = await getVideoRecordingDependencies();
  const stored = await configRepository.getConfig();
  const baseInput = stored
    ? configToInput(stored)
    : serverConfig.getVideoRecordingDefaults();
  return mergeConfigInput(baseInput, overrides);
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    logger.warn(`[VideoRecording] Missing recording file at ${filePath}`);
    return 0;
  }
}

function calculateDurationMs(startedAt: string, endedAt: string): number | undefined {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}

function toMetadata(record: VideoRecordingRecord): VideoRecordingMetadata {
  return {
    recordingId: record.recordingId,
    fileName: record.fileName,
    filePath: record.filePath,
    format: record.format,
    sizeBytes: record.sizeBytes,
    durationMs: record.durationMs,
    codec: record.codec,
    outputName: record.outputName,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    lastAccessedAt: record.lastAccessedAt,
    config: record.config,
    highlights: record.highlights,
  };
}

async function notifyVideoRecordingResources(recordingIds: string[]): Promise<void> {
  const uris = new Set<string>([
    VIDEO_RESOURCE_URIS.LATEST,
    VIDEO_RESOURCE_URIS.ARCHIVE,
  ]);

  for (const recordingId of recordingIds) {
    uris.add(buildVideoArchiveItemUri(recordingId));
  }

  await ResourceRegistry.notifyResourcesUpdated(Array.from(uris));
}

export async function getVideoRecorderService(): Promise<VideoRecorderService> {
  return (await getVideoRecordingDependencies()).videoRecorderService;
}

export async function getVideoRecordingConfig(): Promise<VideoRecordingConfig> {
  const { configRepository } = await getVideoRecordingDependencies();
  const stored = await configRepository.getConfig();
  if (stored) {
    return stored;
  }
  return parseVideoRecordingConfig(serverConfig.getVideoRecordingDefaults());
}

export async function updateVideoRecordingConfig(
  update: VideoRecordingConfigInput | null
): Promise<VideoRecordingConfigUpdateResult> {
  const { configRepository } = await getVideoRecordingDependencies();
  if (update === null) {
    await configRepository.clearConfig();
    const defaults = parseVideoRecordingConfig(serverConfig.getVideoRecordingDefaults());
    const eviction = await enforceArchiveLimit(defaults.maxArchiveSizeMb);
    return { config: defaults, evictedRecordingIds: eviction.evictedRecordingIds };
  }

  const current = await getVideoRecordingConfig();
  const mergedInput = mergeConfigInput(configToInput(current), update);
  const nextConfig = parseVideoRecordingConfig(mergedInput);
  await configRepository.setConfig(nextConfig);

  const eviction = await enforceArchiveLimit(nextConfig.maxArchiveSizeMb);
  return { config: nextConfig, evictedRecordingIds: eviction.evictedRecordingIds };
}

export async function startVideoRecording(
  request: StartVideoRecordingRequest
): Promise<ActiveVideoRecording> {
  const deps = await getVideoRecordingDependencies();
  const { videoRecorderService, recordingRepository, timer } = deps;
  const existing = await recordingRepository.listRecordings({
    status: "recording",
    deviceId: request.device.deviceId,
  });
  if (existing.length > 0) {
    throw new ActionableError(
      `Video recording already active for device ${request.device.deviceId}.`
    );
  }
  const overrides = request.configOverrides ?? {};
  const configInput = await resolveConfigInput(overrides);
  const maxDurationSeconds = resolveMaxDurationSeconds(request.maxDurationSeconds);
  const highlightInputs = request.highlights ?? [];

  if (highlightInputs.length > 0 && request.device.platform !== "android") {
    throw new ActionableError("Visual highlights are only supported on Android devices.");
  }
  for (const highlight of highlightInputs) {
    normalizeHighlightTiming(highlight);
  }

  const active = await videoRecorderService.startRecording({
    outputName: request.outputName,
    config: configInput,
    device: request.device,
    maxDurationSeconds,
  });

  await recordingRepository.insertRecording({
    recordingId: active.recordingId,
    deviceId: request.device.deviceId,
    platform: request.device.platform,
    status: "recording",
    outputName: active.outputName,
    fileName: active.fileName,
    filePath: active.outputPath,
    format: active.config.format,
    sizeBytes: 0,
    durationMs: undefined,
    codec: undefined,
    createdAt: active.startedAt,
    startedAt: active.startedAt,
    endedAt: undefined,
    lastAccessedAt: active.startedAt,
    config: active.config,
  });

  if (request.device.platform === "android") {
    const highlightSession = createHighlightSession(
      active.recordingId,
      request.device,
      active.startedAt,
      timer
    );
    highlightSessions.set(active.recordingId, highlightSession);
    highlightSessionsByDeviceId.set(request.device.deviceId, active.recordingId);

    if (highlightInputs.length > 0) {
      await scheduleRecordingHighlights(highlightSession, request.device, highlightInputs, deps);
    }
  }

  await scheduleAutoStop(active.recordingId, maxDurationSeconds);

  return active;
}

export async function stopVideoRecording(
  recordingId?: string
): Promise<StopVideoRecordingResult> {
  const { videoRecorderService, recordingRepository, now } =
    await getVideoRecordingDependencies();
  const resolvedId = await resolveActiveRecordingId(recordingId);

  clearAutoStop(resolvedId);

  const metadata = await videoRecorderService.stopRecording(resolvedId);
  const highlightSession = disposeHighlightSession(resolvedId);
  if (highlightSession) {
    const finalizedHighlights = finalizeHighlightSession(
      highlightSession,
      metadata.endedAt ?? now().toISOString()
    );
    if (finalizedHighlights) {
      metadata.highlights = finalizedHighlights;
    }
  }
  await recordingRepository.updateRecording(resolvedId, {
    status: "completed",
    outputName: metadata.outputName,
    fileName: metadata.fileName,
    filePath: metadata.filePath,
    format: metadata.format,
    sizeBytes: metadata.sizeBytes,
    durationMs: metadata.durationMs,
    codec: metadata.codec,
    endedAt: metadata.endedAt,
    lastAccessedAt: metadata.lastAccessedAt,
    config: metadata.config,
    highlights: metadata.highlights,
  });

  const eviction = await enforceArchiveLimit(metadata.config.maxArchiveSizeMb);

  await notifyVideoRecordingResources([metadata.recordingId]);

  return { metadata, evictedRecordingIds: eviction.evictedRecordingIds };
}

export async function recordVideoRecordingHighlightAdded(
  device: BootedDevice,
  highlight: VideoRecordingHighlightInput
): Promise<void> {
  const session = getHighlightSessionByDevice(device.deviceId);
  if (!session) {
    return;
  }
  const { now } = await getVideoRecordingDependencies();
  recordHighlightAdded(session, highlight, now().getTime());
}

export async function listActiveVideoRecordings(
  filter: { deviceId?: string; platform?: "android" | "ios" } = {}
): Promise<VideoRecordingRecord[]> {
  const { recordingRepository } = await getVideoRecordingDependencies();
  return recordingRepository.listRecordings({
    status: "recording",
    deviceId: filter.deviceId,
    platform: filter.platform,
  });
}

export async function listVideoRecordings(): Promise<VideoRecordingMetadata[]> {
  const { recordingRepository } = await getVideoRecordingDependencies();
  const recordings = await recordingRepository.listRecordings({
    status: ["completed", "interrupted"],
    orderByLastAccessed: "desc",
  });
  return recordings.map(toMetadata);
}

export async function getVideoRecordingMetadata(
  recordingId: string,
  options?: { touch?: boolean }
): Promise<VideoRecordingMetadata | null> {
  const { recordingRepository, now } = await getVideoRecordingDependencies();
  const record = await recordingRepository.getRecording(recordingId);
  if (!record || record.status === "recording") {
    return null;
  }

  const metadata = toMetadata(record);

  if (options?.touch !== false) {
    const timestamp = now().toISOString();
    await recordingRepository.touchRecording(recordingId, timestamp);
    metadata.lastAccessedAt = timestamp;
  }

  return metadata;
}

export async function getLatestVideoRecordingMetadata(): Promise<VideoRecordingMetadata | null> {
  const { recordingRepository } = await getVideoRecordingDependencies();
  const latest = await recordingRepository.getLatestRecording();
  return latest ? toMetadata(latest) : null;
}

export async function deleteVideoRecording(recordingId: string): Promise<boolean> {
  const { recordingRepository } = await getVideoRecordingDependencies();
  const record = await recordingRepository.getRecording(recordingId);

  if (!record) {
    return false;
  }

  if (record.status === "recording") {
    throw new Error(`Cannot delete active recording ${recordingId}`);
  }

  const recordingDir = path.dirname(record.filePath);
  if (await fs.pathExists(recordingDir)) {
    await fs.remove(recordingDir);
  }

  const deleted = await recordingRepository.deleteRecording(recordingId);
  if (deleted) {
    await notifyVideoRecordingResources([recordingId]);
  }
  return deleted;
}

export async function enforceArchiveLimit(
  maxArchiveSizeMb: number
): Promise<VideoArchiveEvictionResult> {
  const maxSizeBytes = Math.max(0, Math.floor(maxArchiveSizeMb * 1024 * 1024));
  const { recordingRepository } = await getVideoRecordingDependencies();
  const recordings = await recordingRepository.listRecordings({
    status: ["completed", "interrupted"],
    orderByLastAccessed: "asc",
  });

  let currentSizeBytes = recordings.reduce(
    (sum, recording) => sum + (recording.sizeBytes ?? 0),
    0
  );

  if (maxSizeBytes === 0 || currentSizeBytes <= maxSizeBytes) {
    return {
      evictedRecordingIds: [],
      currentSizeBytes,
      maxSizeBytes,
    };
  }

  const evictedRecordingIds: string[] = [];

  for (const recording of recordings) {
    if (currentSizeBytes <= maxSizeBytes) {
      break;
    }

    try {
      const deleted = await deleteVideoRecording(recording.recordingId);
      if (deleted) {
        evictedRecordingIds.push(recording.recordingId);
        currentSizeBytes -= recording.sizeBytes ?? 0;
      }
    } catch (error) {
      logger.warn(
        `[VideoRecording] Failed to evict recording ${recording.recordingId}: ${error}`
      );
    }
  }

  if (currentSizeBytes > maxSizeBytes) {
    logger.warn(
      `[VideoRecording] Archive size ${currentSizeBytes} bytes still exceeds limit ${maxSizeBytes} bytes after eviction`
    );
  }

  return {
    evictedRecordingIds,
    currentSizeBytes,
    maxSizeBytes,
  };
}
