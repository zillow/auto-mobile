import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice, VideoFormat, VideoQualityPreset } from "../models";
import { createJSONToolResponse } from "../utils/toolUtils";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import {
  deleteVideoRecording,
  listVideoRecordings,
  startVideoRecording,
  stopVideoRecording,
} from "./videoRecordingManager";
import { ResourceRegistry } from "./resourceRegistry";
import { buildVideoArchiveItemUri, VIDEO_RESOURCE_URIS } from "./videoRecordingResources";
import type { VideoRecordingConfigInput } from "../models";

export interface StartVideoRecordingArgs {
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
  maxDurationSeconds?: number;
  outputName?: string;
  sessionUuid?: string;
  device?: string;
}

export interface StopVideoRecordingArgs {
  recordingId?: string;
}

export interface DeleteVideoRecordingArgs {
  recordingId: string;
}

const resolutionSchema = z.object({
  width: z.number().int().positive().describe("Override resolution width in pixels"),
  height: z.number().int().positive().describe("Override resolution height in pixels"),
});

const startVideoRecordingSchema = addDeviceTargetingToSchema(z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform"),
  deviceId: z.string().optional().describe("Optional device ID override"),
  qualityPreset: z.enum(["low", "medium", "high"]).optional().describe("Recording quality preset"),
  targetBitrateKbps: z.number().int().positive().optional().describe("Target bitrate in Kbps"),
  maxThroughputMbps: z.number().positive().optional().describe("Max throughput in Mbps"),
  fps: z.number().int().positive().optional().describe("Frames per second"),
  resolution: resolutionSchema.optional().describe("Override capture resolution"),
  format: z.enum(["mp4"]).optional().describe("Video format"),
  maxDurationSeconds: z.number().int().positive().optional().describe("Maximum recording duration in seconds"),
  outputName: z.string().optional().describe("Optional label to identify the recording"),
}));

const stopVideoRecordingSchema = z.object({
  recordingId: z.string().optional().describe("Recording ID to stop (defaults to latest active recording)"),
});

const deleteVideoRecordingSchema = z.object({
  recordingId: z.string().describe("Recording ID to delete"),
});

const listVideoRecordingsSchema = z.object({});

function buildConfigOverrides(args: StartVideoRecordingArgs): VideoRecordingConfigInput {
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

export function registerVideoRecordingTools(): void {
  const startVideoRecordingHandler = async (
    device: BootedDevice,
    args: StartVideoRecordingArgs
  ) => {
    try {
      const active = await startVideoRecording({
        device,
        configOverrides: buildConfigOverrides(args),
        outputName: args.outputName,
        maxDurationSeconds: args.maxDurationSeconds,
      });

      return createJSONToolResponse({
        message: `Started video recording ${active.recordingId}`,
        recordingId: active.recordingId,
        outputPath: active.outputPath,
        startedAt: active.startedAt,
        outputName: active.outputName,
        deviceId: device.deviceId,
        platform: device.platform,
        settings: {
          ...active.config,
          resolution: active.config.resolution,
          maxDurationSeconds: args.maxDurationSeconds,
        },
      });
    } catch (error) {
      throw new ActionableError(`Failed to start video recording: ${error}`);
    }
  };

  const stopVideoRecordingHandler = async (args: StopVideoRecordingArgs) => {
    try {
      const metadata = await stopVideoRecording(args.recordingId);
      const codec = metadata.codec ?? "unknown";
      const durationMs = metadata.durationMs ?? 0;
      const sizeBytes = metadata.sizeBytes ?? 0;

      await ResourceRegistry.notifyResourcesUpdated([
        VIDEO_RESOURCE_URIS.LATEST,
        VIDEO_RESOURCE_URIS.ARCHIVE,
        buildVideoArchiveItemUri(metadata.recordingId),
      ]);

      return createJSONToolResponse({
        message: `Stopped video recording ${metadata.recordingId}`,
        recordingId: metadata.recordingId,
        filePath: metadata.filePath,
        durationMs,
        sizeBytes,
        codec,
        metadata: { ...metadata, durationMs, sizeBytes, codec },
      });
    } catch (error) {
      throw new ActionableError(`Failed to stop video recording: ${error}`);
    }
  };

  const listVideoRecordingsHandler = async () => {
    try {
      const recordings = await listVideoRecordings();
      return createJSONToolResponse({
        recordings,
        count: recordings.length,
      });
    } catch (error) {
      throw new ActionableError(`Failed to list video recordings: ${error}`);
    }
  };

  const deleteVideoRecordingHandler = async (args: DeleteVideoRecordingArgs) => {
    try {
      const deleted = await deleteVideoRecording(args.recordingId);

      if (!deleted) {
        return createJSONToolResponse({
          success: false,
          deleted: false,
          recordingId: args.recordingId,
          error: `Recording not found: ${args.recordingId}`,
        });
      }

      await ResourceRegistry.notifyResourcesUpdated([
        VIDEO_RESOURCE_URIS.LATEST,
        VIDEO_RESOURCE_URIS.ARCHIVE,
        buildVideoArchiveItemUri(args.recordingId),
      ]);

      return createJSONToolResponse({
        success: true,
        deleted: true,
        recordingId: args.recordingId,
        message: `Deleted video recording ${args.recordingId}`,
      });
    } catch (error) {
      throw new ActionableError(`Failed to delete video recording: ${error}`);
    }
  };

  ToolRegistry.registerDeviceAware(
    "startVideoRecording",
    "Start a low-overhead video recording for the active device.",
    startVideoRecordingSchema,
    startVideoRecordingHandler
  );

  ToolRegistry.register(
    "stopVideoRecording",
    "Stop an active video recording and archive it.",
    stopVideoRecordingSchema,
    stopVideoRecordingHandler
  );

  ToolRegistry.register(
    "listVideoRecordings",
    "List archived video recordings and their metadata.",
    listVideoRecordingsSchema,
    listVideoRecordingsHandler
  );

  ToolRegistry.register(
    "deleteVideoRecording",
    "Delete an archived video recording by ID.",
    deleteVideoRecordingSchema,
    deleteVideoRecordingHandler
  );
}
