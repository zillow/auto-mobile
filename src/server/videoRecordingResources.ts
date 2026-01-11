import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import {
  getLatestVideoRecordingMetadata,
  getVideoRecordingMetadata,
  listVideoRecordings,
} from "./videoRecordingManager";
import { buildVideoArchiveItemUri, VIDEO_RESOURCE_URIS } from "./videoRecordingResourceUris";
import { logger } from "../utils/logger";
import * as fs from "fs/promises";
import type { VideoRecordingMetadata } from "../models";

function getVideoMimeType(metadata: VideoRecordingMetadata): string {
  if (metadata.format === "mp4") {
    return "video/mp4";
  }
  return "application/octet-stream";
}

async function buildVideoResourceContent(
  metadata: VideoRecordingMetadata,
  uri: string
): Promise<ResourceContent> {
  if (!metadata.filePath) {
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Missing file path for recording ${metadata.recordingId}`,
        metadata,
      }, null, 2),
    };
  }

  try {
    const fileBuffer = await fs.readFile(metadata.filePath);
    const blob = fileBuffer.toString("base64");
    return {
      uri,
      mimeType: getVideoMimeType(metadata),
      text: JSON.stringify({ metadata }, null, 2),
      blob,
    };
  } catch (error) {
    logger.error(`[VideoRecordingResources] Failed to read video ${metadata.recordingId}: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to read video data: ${error}`,
        metadata,
      }, null, 2),
    };
  }
}

async function getLatestVideoRecording(): Promise<ResourceContent> {
  try {
    const latest = await getLatestVideoRecordingMetadata();
    if (!latest) {
      return {
        uri: VIDEO_RESOURCE_URIS.LATEST,
        mimeType: "application/json",
        text: JSON.stringify({
          error: "No video recordings available. Call videoRecording with action \"start\" first.",
        }, null, 2),
      };
    }

    const metadata = await getVideoRecordingMetadata(latest.recordingId, { touch: true }) ?? latest;
    return buildVideoResourceContent(metadata, VIDEO_RESOURCE_URIS.LATEST);
  } catch (error) {
    logger.error(`[VideoRecordingResources] Failed to get latest recording: ${error}`);
    return {
      uri: VIDEO_RESOURCE_URIS.LATEST,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve latest recording: ${error}`,
      }, null, 2),
    };
  }
}

async function getVideoArchiveList(): Promise<ResourceContent> {
  try {
    const recordings = await listVideoRecordings();
    return {
      uri: VIDEO_RESOURCE_URIS.ARCHIVE,
      mimeType: "application/json",
      text: JSON.stringify({
        recordings,
        count: recordings.length,
      }, null, 2),
    };
  } catch (error) {
    logger.error(`[VideoRecordingResources] Failed to list recordings: ${error}`);
    return {
      uri: VIDEO_RESOURCE_URIS.ARCHIVE,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to list recordings: ${error}`,
      }, null, 2),
    };
  }
}

async function getVideoArchiveItem(params: Record<string, string>): Promise<ResourceContent> {
  try {
    const recordingId = params.recordingId;
    if (!recordingId) {
      return {
        uri: VIDEO_RESOURCE_URIS.ARCHIVE_ITEM,
        mimeType: "application/json",
        text: JSON.stringify({ error: "Recording ID is required." }, null, 2),
      };
    }

    const metadata = await getVideoRecordingMetadata(recordingId, { touch: true });
    if (!metadata) {
      return {
        uri: buildVideoArchiveItemUri(recordingId),
        mimeType: "application/json",
        text: JSON.stringify({
          error: `Recording not found: ${recordingId}`,
        }, null, 2),
      };
    }

    return buildVideoResourceContent(metadata, buildVideoArchiveItemUri(recordingId));
  } catch (error) {
    logger.error(`[VideoRecordingResources] Failed to read recording: ${error}`);
    return {
      uri: VIDEO_RESOURCE_URIS.ARCHIVE_ITEM,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve recording: ${error}`,
      }, null, 2),
    };
  }
}

export function registerVideoRecordingResources(): void {
  ResourceRegistry.register(
    VIDEO_RESOURCE_URIS.LATEST,
    "Latest Video Recording",
    "The most recent video recording with metadata and base64-encoded video data.",
    "video/mp4",
    getLatestVideoRecording
  );

  ResourceRegistry.register(
    VIDEO_RESOURCE_URIS.ARCHIVE,
    "Video Recording Archive",
    "Metadata list for archived video recordings.",
    "application/json",
    getVideoArchiveList
  );

  ResourceRegistry.registerTemplate(
    VIDEO_RESOURCE_URIS.ARCHIVE_ITEM,
    "Video Recording",
    "Video recording content and metadata for the specified recording ID.",
    "video/mp4",
    getVideoArchiveItem
  );

  logger.info("[VideoRecordingResources] Registered video recording resources");
}
