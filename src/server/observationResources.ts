import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { logger } from "../utils/logger";
import { stringifyToolResponse } from "../utils/toolUtils";
import * as fs from "fs/promises";
import * as path from "path";

// Resource URIs
export const RESOURCE_URIS = {
  LATEST_OBSERVATION: "automobile:observation/latest",
  LATEST_SCREENSHOT: "automobile:observation/latest/screenshot"
} as const;

// Helper to get the latest screenshot path from cache
async function getLatestScreenshotPath(): Promise<string | undefined> {
  try {
    const cacheDir = path.join("/tmp/auto-mobile", "screenshots");
    const stat = await fs.stat(cacheDir);
    if (!stat.isDirectory()) {
      return undefined;
    }

    const files = await fs.readdir(cacheDir);
    const imageFiles = files.filter(f => f.endsWith(".png") || f.endsWith(".webp"));

    if (imageFiles.length === 0) {
      return undefined;
    }

    // Sort by modification time (most recent first)
    const fileStats = await Promise.all(
      imageFiles.map(async f => {
        const fullPath = path.join(cacheDir, f);
        const fileStat = await fs.stat(fullPath);
        return { path: fullPath, mtime: fileStat.mtime };
      })
    );

    fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return fileStats[0]?.path;
  } catch (error) {
    logger.warn(`[ObservationResources] Failed to get latest screenshot: ${error}`);
    return undefined;
  }
}

// Handler for latest observation resource (text/json)
async function getLatestObservation(): Promise<ResourceContent> {
  try {
    const cachedResult = ObserveScreen.getRecentCachedResult();

    if (!cachedResult) {
      return {
        uri: RESOURCE_URIS.LATEST_OBSERVATION,
        mimeType: "application/json",
        text: JSON.stringify({
          error: "No observation available. Call the 'observe' tool first to capture screen state."
        }, null, 2)
      };
    }

    // Return the observation as JSON
    return {
      uri: RESOURCE_URIS.LATEST_OBSERVATION,
      mimeType: "application/json",
      text: stringifyToolResponse(cachedResult)
    };
  } catch (error) {
    logger.error(`[ObservationResources] Failed to get latest observation: ${error}`);
    return {
      uri: RESOURCE_URIS.LATEST_OBSERVATION,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve observation: ${error}`
      }, null, 2)
    };
  }
}

// Handler for latest screenshot resource (image/png as blob)
async function getLatestScreenshot(): Promise<ResourceContent> {
  try {
    const screenshotPath = await getLatestScreenshotPath();

    if (!screenshotPath) {
      return {
        uri: RESOURCE_URIS.LATEST_SCREENSHOT,
        mimeType: "application/json",
        text: JSON.stringify({
          error: "No screenshot available. Call the 'observe' tool first to capture a screenshot."
        }, null, 2)
      };
    }

    // Read the screenshot file and convert to base64
    const imageBuffer = await fs.readFile(screenshotPath);
    const base64Image = imageBuffer.toString("base64");

    // Determine mime type from file extension
    const mimeType = screenshotPath.endsWith(".webp") ? "image/webp" : "image/png";

    return {
      uri: RESOURCE_URIS.LATEST_SCREENSHOT,
      mimeType,
      blob: base64Image
    };
  } catch (error) {
    logger.error(`[ObservationResources] Failed to get latest screenshot: ${error}`);
    return {
      uri: RESOURCE_URIS.LATEST_SCREENSHOT,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve screenshot: ${error}`
      }, null, 2)
    };
  }
}

// Register all observation resources
export function registerObservationResources(): void {
  // Register latest observation as text/json resource
  ResourceRegistry.register(
    RESOURCE_URIS.LATEST_OBSERVATION,
    "Latest Observation",
    "The most recent screen observation including view hierarchy, elements, and metadata. Updated automatically after each observe() call.",
    "application/json",
    getLatestObservation
  );

  // Register latest screenshot as image blob resource
  ResourceRegistry.register(
    RESOURCE_URIS.LATEST_SCREENSHOT,
    "Latest Screenshot",
    "The most recent screen capture as a PNG or WebP image. Updated automatically after each observe() call.",
    "image/png",
    getLatestScreenshot
  );

  logger.info("[ObservationResources] Registered observation resources");
}
