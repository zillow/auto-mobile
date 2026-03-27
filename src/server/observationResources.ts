import { ResourceRegistry, ResourceContent } from "./resourceRegistry";
import { RealObserveScreen } from "../features/observe/ObserveScreen";
import { logger } from "../utils/logger";
import { stringifyToolResponse } from "../utils/toolUtils";
import { ScreenshotJobTracker } from "../utils/ScreenshotJobTracker";
import * as realFs from "fs/promises";

interface ScreenshotFileSystem {
  stat(path: string): Promise<{ isFile(): boolean }>;
  readFile(path: string): Promise<Buffer>;
}

let screenshotFileSystem: ScreenshotFileSystem = realFs;

export function setScreenshotFileSystem(fs: ScreenshotFileSystem): void {
  screenshotFileSystem = fs;
}

export function resetScreenshotFileSystem(): void {
  screenshotFileSystem = realFs;
}

// Resource URIs
export const RESOURCE_URIS = {
  LATEST_OBSERVATION: "automobile:observation/latest",
  LATEST_SCREENSHOT: "automobile:observation/latest/screenshot",
  DEVICE_OBSERVATION: "automobile:observation/{deviceId}/latest",
  DEVICE_SCREENSHOT: "automobile:observation/{deviceId}/latest/screenshot",
} as const;

// Helper to get the latest screenshot path from cache
async function getLatestScreenshotPath(): Promise<string | undefined> {
  try {
    const screenshotPath = RealObserveScreen.getRecentCachedScreenshotPath();
    if (!screenshotPath) {
      return undefined;
    }

    const fileStat = await screenshotFileSystem.stat(screenshotPath);
    if (!fileStat.isFile()) {
      return undefined;
    }

    return screenshotPath;
  } catch (error) {
    logger.warn(`[ObservationResources] Failed to get latest screenshot: ${error}`);
    return undefined;
  }
}

// Handler for latest observation resource (text/json)
async function getLatestObservation(): Promise<ResourceContent> {
  try {
    const cachedResult = RealObserveScreen.getRecentCachedResult();

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
    const cachedResult = RealObserveScreen.getRecentCachedResult();
    if (!cachedResult) {
      return {
        uri: RESOURCE_URIS.LATEST_SCREENSHOT,
        mimeType: "application/json",
        text: JSON.stringify({
          error: "No observation available. Call the 'observe' tool first to capture a screenshot."
        }, null, 2)
      };
    }

    let screenshotPath = await getLatestScreenshotPath();

    if (!screenshotPath) {
      const pendingDeviceId = ScreenshotJobTracker.getMostRecentPendingDeviceId();
      if (pendingDeviceId) {
        await ScreenshotJobTracker.waitForCompletion(pendingDeviceId, 3000);
        screenshotPath = await getLatestScreenshotPath();
      }
    }

    if (!screenshotPath) {
      const screenshotError = RealObserveScreen.getRecentCachedScreenshotError();
      const errorMessage = screenshotError
        ? `No screenshot available from the latest observation: ${screenshotError}`
        : "No screenshot available. Call the 'observe' tool again to capture a screenshot.";
      return {
        uri: RESOURCE_URIS.LATEST_SCREENSHOT,
        mimeType: "application/json",
        text: JSON.stringify({
          error: errorMessage
        }, null, 2)
      };
    }

    // Read the screenshot file and convert to base64
    const imageBuffer = await screenshotFileSystem.readFile(screenshotPath);
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

// Device-scoped handler for observation (with deviceId parameter)
async function getDeviceObservation(params: Record<string, string>): Promise<ResourceContent> {
  const { deviceId } = params;
  const uri = `automobile:observation/${deviceId}/latest`;
  try {
    const cachedResult = RealObserveScreen.getRecentCachedResultForDevice(deviceId);

    if (!cachedResult) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          error: `No observation available for device ${deviceId}. Call the 'observe' tool first.`
        }, null, 2)
      };
    }

    return {
      uri,
      mimeType: "application/json",
      text: stringifyToolResponse(cachedResult)
    };
  } catch (error) {
    logger.error(`[ObservationResources] Failed to get observation for device ${deviceId}: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve observation for device ${deviceId}: ${error}`
      }, null, 2)
    };
  }
}

// Device-scoped handler for screenshot (with deviceId parameter)
async function getDeviceScreenshot(params: Record<string, string>): Promise<ResourceContent> {
  const { deviceId } = params;
  const uri = `automobile:observation/${deviceId}/latest/screenshot`;
  try {
    const cachedResult = RealObserveScreen.getRecentCachedResultForDevice(deviceId);
    if (!cachedResult) {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          error: `No observation available for device ${deviceId}. Call the 'observe' tool first.`
        }, null, 2)
      };
    }

    const screenshotPath = RealObserveScreen.getRecentCachedScreenshotPathForDevice(deviceId);
    if (!screenshotPath) {
      const screenshotError = RealObserveScreen.getRecentCachedScreenshotErrorForDevice(deviceId);
      const errorMessage = screenshotError
        ? `No screenshot available for device ${deviceId}: ${screenshotError}`
        : `No screenshot available for device ${deviceId}. Call the 'observe' tool again.`;
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({ error: errorMessage }, null, 2)
      };
    }

    const imageBuffer = await screenshotFileSystem.readFile(screenshotPath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = screenshotPath.endsWith(".webp") ? "image/webp" : "image/png";

    return { uri, mimeType, blob: base64Image };
  } catch (error) {
    logger.error(`[ObservationResources] Failed to get screenshot for device ${deviceId}: ${error}`);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        error: `Failed to retrieve screenshot for device ${deviceId}: ${error}`
      }, null, 2)
    };
  }
}

// Register all observation resources
export function registerObservationResources(): void {
  // Register latest observation as text/json resource (all devices)
  ResourceRegistry.register(
    RESOURCE_URIS.LATEST_OBSERVATION,
    "Latest Observation",
    "The most recent screen observation including view hierarchy, elements, and metadata. Updated automatically after each observe() call.",
    "application/json",
    getLatestObservation
  );

  // Register latest screenshot as image blob resource (all devices)
  ResourceRegistry.register(
    RESOURCE_URIS.LATEST_SCREENSHOT,
    "Latest Screenshot",
    "The most recent screen capture as a PNG or WebP image. Updated automatically after each observe() call.",
    "image/png",
    getLatestScreenshot
  );

  // Register device-scoped observation template
  ResourceRegistry.registerTemplate(
    RESOURCE_URIS.DEVICE_OBSERVATION,
    "Device Observation",
    "Screen observation for a specific device. Use when multiple devices are active.",
    "application/json",
    getDeviceObservation
  );

  // Register device-scoped screenshot template
  ResourceRegistry.registerTemplate(
    RESOURCE_URIS.DEVICE_SCREENSHOT,
    "Device Screenshot",
    "Screen capture for a specific device. Use when multiple devices are active.",
    "image/png",
    getDeviceScreenshot
  );

  logger.info("[ObservationResources] Registered observation resources");
}
