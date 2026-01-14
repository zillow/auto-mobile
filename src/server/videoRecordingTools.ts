import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import {
  ActionableError,
  BootedDevice,
  VideoFormat,
  VideoRecordingHighlightInput,
  VideoQualityPreset,
} from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import {
  listActiveVideoRecordings,
  startVideoRecording,
  stopVideoRecording,
} from "./videoRecordingManager";
import type { VideoRecordingConfigInput } from "../models";
import { DeviceSessionManager } from "../utils/DeviceSessionManager";
import type { VideoRecordingRecord } from "../db/videoRecordingRepository";
import { highlightShapeSchema } from "../features/debug/VisualHighlight";

const DEFAULT_MAX_DURATION_SECONDS = 30;

export interface VideoRecordingArgs {
  action: "start" | "stop";
  platform: "android" | "ios";
  deviceId?: string;
  qualityPreset?: VideoQualityPreset;
  targetBitrateKbps?: number;
  maxThroughputMbps?: number;
  fps?: number;
  resolution?: {
    width: number;
    height: number;
  };
  format?: VideoFormat;
  maxDuration?: number;
  outputName?: string;
  recordingId?: string;
  sessionUuid?: string;
  device?: string;
  highlights?: VideoRecordingHighlightInput[];
}

const resolutionSchema = z.object({
  width: z.number().int().positive().describe("Override resolution width in pixels"),
  height: z.number().int().positive().describe("Override resolution height in pixels"),
});

const highlightTimingSchema = z.object({
  startTimeMs: z.number().int().nonnegative().optional().describe("Start time in ms"),
});

const highlightSchema = z.object({
  description: z.string().optional().describe("Description of the highlight"),
  shape: highlightShapeSchema.describe("Highlight shape definition"),
  timing: highlightTimingSchema.optional().describe("Optional highlight timing"),
});

const videoRecordingSchema = addDeviceTargetingToSchema(z.object({
  action: z.enum(["start", "stop"]).describe("Action to perform"),
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  deviceId: z.string().optional().describe("Optional device ID override"),
  recordingId: z.string().optional().describe("Recording ID to stop"),
  qualityPreset: z.enum(["low", "medium", "high"]).optional().describe("Recording quality preset"),
  targetBitrateKbps: z.number().int().positive().optional().describe("Target bitrate in Kbps"),
  maxThroughputMbps: z.number().positive().optional().describe("Max throughput in Mbps"),
  fps: z.number().int().positive().optional().describe("Frames per second"),
  resolution: resolutionSchema.optional().describe("Override capture resolution"),
  format: z.enum(["mp4"]).optional().describe("Video format"),
  maxDuration: z
    .number()
    .int()
    .positive()
    .max(300)
    .optional()
    .describe("Max seconds to record video for (default 30, max 300)"),
  outputName: z.string().optional().describe("Optional label to identify the recording"),
  highlights: z.array(highlightSchema).optional().describe("Optional highlights to show during recording"),
}));

function buildConfigOverrides(args: VideoRecordingArgs): VideoRecordingConfigInput {
  const overrides: VideoRecordingConfigInput = {};
  if (args.qualityPreset) {
    overrides.qualityPreset = args.qualityPreset;
  }
  if (args.targetBitrateKbps !== undefined) {
    overrides.targetBitrateKbps = args.targetBitrateKbps;
  }
  if (args.maxThroughputMbps !== undefined) {
    overrides.maxThroughputMbps = args.maxThroughputMbps;
  }
  if (args.fps !== undefined) {
    overrides.fps = args.fps;
  }
  if (args.format) {
    overrides.format = args.format;
  }
  if (args.resolution) {
    overrides.resolution = args.resolution;
  }
  return overrides;
}

function shouldTargetAllDevices(args: VideoRecordingArgs): boolean {
  return !args.deviceId && !args.device && !args.sessionUuid;
}

async function resolveTargetDevices(
  device: BootedDevice,
  args: VideoRecordingArgs
): Promise<BootedDevice[]> {
  if (!shouldTargetAllDevices(args)) {
    return [device];
  }

  const devices = await DeviceSessionManager.getInstance().detectConnectedPlatforms();
  const matching = devices.filter(candidate => candidate.platform === device.platform);

  if (matching.length === 0) {
    return [device];
  }

  const unique = new Map<string, BootedDevice>();
  for (const candidate of [device, ...matching]) {
    unique.set(candidate.deviceId, candidate);
  }
  return Array.from(unique.values());
}

function selectLatestRecording(records: VideoRecordingRecord[]): VideoRecordingRecord {
  return records
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.startedAt);
      const rightTime = Date.parse(right.startedAt);
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
    })[0];
}

async function stopRecordingById(recordingId: string) {
  const results: Array<Record<string, unknown>> = [];
  const evictedRecordingIds: string[] = [];
  const activeRecords = await listActiveVideoRecordings();
  const matching = activeRecords.find(record => record.recordingId === recordingId);

  try {
    const { metadata, evictedRecordingIds: evicted } = await stopVideoRecording(recordingId);
    const codec = metadata.codec ?? "unknown";
    const durationMs = metadata.durationMs ?? 0;
    const sizeBytes = metadata.sizeBytes ?? 0;

    results.push({
      recordingId: metadata.recordingId,
      filePath: metadata.filePath,
      durationMs,
      sizeBytes,
      codec,
      metadata: { ...metadata, durationMs, sizeBytes, codec },
      deviceId: matching?.deviceId,
      platform: matching?.platform,
    });

    for (const evictedId of evicted) {
      evictedRecordingIds.push(evictedId);
    }
  } catch (error) {
    throw new ActionableError(`Failed to stop video recording: ${error}`);
  }

  return createJSONToolResponse({
    action: "stop",
    count: results.length,
    recordings: results,
    evictedRecordingIds: evictedRecordingIds.length > 0 ? evictedRecordingIds : undefined,
  });
}

export function registerVideoRecordingTools(): void {
  const videoRecordingHandler = async (
    device: BootedDevice,
    args: VideoRecordingArgs
  ) => {
    if (args.action === "start") {
      const targetDevices = await resolveTargetDevices(device, args);
      const maxDurationSeconds = args.maxDuration ?? DEFAULT_MAX_DURATION_SECONDS;
      const recordings: Array<Record<string, unknown>> = [];
      const failures: Array<Record<string, unknown>> = [];

      for (const target of targetDevices) {
        try {
          const active = await startVideoRecording({
            device: target,
            configOverrides: buildConfigOverrides(args),
            outputName: args.outputName,
            maxDurationSeconds: args.maxDuration,
            highlights: args.highlights,
          });

          recordings.push({
            recordingId: active.recordingId,
            outputPath: active.outputPath,
            startedAt: active.startedAt,
            outputName: active.outputName,
            deviceId: target.deviceId,
            platform: target.platform,
            settings: {
              ...active.config,
              resolution: active.config.resolution,
              maxDurationSeconds,
            },
          });
        } catch (error) {
          failures.push({
            deviceId: target.deviceId,
            platform: target.platform,
            error: String(error),
          });
        }
      }

      if (recordings.length === 0) {
        const message = failures.length > 0
          ? `Failed to start video recordings: ${failures.map(failure => failure.error).join("; ")}`
          : "Failed to start video recordings.";
        throw new ActionableError(message);
      }

      return createJSONToolResponse({
        action: "start",
        count: recordings.length,
        recordings,
        failures: failures.length > 0 ? failures : undefined,
      });
    }

    if (args.action === "stop") {
      if (args.recordingId) {
        return stopRecordingById(args.recordingId);
      }

      const results: Array<Record<string, unknown>> = [];
      const failures: Array<Record<string, unknown>> = [];
      const evictedRecordingIds: string[] = [];
      const targetDevices = await resolveTargetDevices(device, args);
      const activeRecords = await listActiveVideoRecordings({ platform: device.platform });

      for (const target of targetDevices) {
        const matches = activeRecords.filter(record => record.deviceId === target.deviceId);
        if (matches.length === 0) {
          failures.push({
            deviceId: target.deviceId,
            platform: target.platform,
            error: "No active video recording found for device.",
          });
          continue;
        }

        const latest = selectLatestRecording(matches);
        try {
          const { metadata, evictedRecordingIds: evicted } = await stopVideoRecording(
            latest.recordingId
          );
          const codec = metadata.codec ?? "unknown";
          const durationMs = metadata.durationMs ?? 0;
          const sizeBytes = metadata.sizeBytes ?? 0;

          results.push({
            recordingId: metadata.recordingId,
            filePath: metadata.filePath,
            durationMs,
            sizeBytes,
            codec,
            metadata: { ...metadata, durationMs, sizeBytes, codec },
            deviceId: target.deviceId,
            platform: target.platform,
          });

          for (const evictedId of evicted) {
            evictedRecordingIds.push(evictedId);
          }
        } catch (error) {
          failures.push({
            deviceId: target.deviceId,
            platform: target.platform,
            error: String(error),
          });
        }
      }

      if (results.length === 0) {
        const message = failures.length > 0
          ? `Failed to stop video recordings: ${failures.map(failure => failure.error).join("; ")}`
          : "Failed to stop video recordings.";
        throw new ActionableError(message);
      }

      return createJSONToolResponse({
        action: "stop",
        count: results.length,
        recordings: results,
        failures: failures.length > 0 ? failures : undefined,
        evictedRecordingIds: evictedRecordingIds.length > 0 ? evictedRecordingIds : undefined,
      });
    }

    throw new ActionableError(`Unsupported videoRecording action: ${args.action}`);
  };

  const videoRecordingNonDeviceHandler = async (args: VideoRecordingArgs) => {
    if (args.action === "stop" && args.recordingId) {
      return stopRecordingById(args.recordingId);
    }

    throw new ActionableError(
      "Video recording start/stop requires a connected device unless recordingId is provided."
    );
  };

  ToolRegistry.registerDeviceAware(
    "videoRecording",
    "Start or stop a low-overhead video recording for the active device.",
    videoRecordingSchema,
    videoRecordingHandler,
    false,
    false,
    {
      shouldEnsureDevice: args => !(args.action === "stop" && args.recordingId),
      nonDeviceHandler: videoRecordingNonDeviceHandler,
    }
  );
}
