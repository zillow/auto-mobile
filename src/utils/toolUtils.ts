/**
 * Utility functions for tool handlers
 */

import { ActionableError } from "../models/ActionableError";
import { EmulatorUtils } from "./emulator";
import { AdbUtils } from "./adb";
import { Window } from "../features/observe/Window";

/**
 * Creates a standardized tool response with text content
 * @param content Any data that will be stringified as JSON
 * @returns A properly formatted tool response object
 */
export function createJSONToolResponse(content: any): {
  content: Array<{
    type: "text";
    text: string;
  }>;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(content, null, 2)
      }
    ]
  };
}

/**
 * Creates a standardized tool response with image content
 * @param base64Data Base64 encoded image data
 * @param mimeType The MIME type of the image (e.g., "image/png", "image/webp")
 * @returns A properly formatted tool response object
 */
export function createImageToolResponse(base64Data: string, mimeType: string): {
  content: Array<{
    type: "image";
    data: string;
    mimeType: string;
  }>;
} {
  return {
    content: [
      {
        type: "image",
        data: base64Data,
        mimeType: mimeType
      }
    ]
  };
}

export async function verifyDeviceIsReady(deviceId?: string, apkPath?: string): Promise<void> {
  // Normalize deviceId - treat string "undefined" the same as null
  const normalizedDeviceId = deviceId === "undefined" ? null : deviceId;

  // First, check all connected devices (emulators and physical devices)
  const adb = new AdbUtils();
  const allDevices = await adb.getDevices();

  // If a specific device is requested, verify it's connected
  if (normalizedDeviceId) {
    if (!allDevices.includes(normalizedDeviceId)) {
      throw new ActionableError(
        `Device ${normalizedDeviceId} is not connected. Available devices: ${allDevices.join(", ") || "none"}`
      );
    }
  } else {
    // No specific device requested - check if any devices are available
    if (allDevices.length === 0) {
      // No devices at all - try to start an emulator
      const emulatorUtils = new EmulatorUtils();
      const availableAvds = await emulatorUtils.listAvds();

      if (availableAvds.length === 0) {
        throw new ActionableError(
          "No devices are connected and no Android Virtual Devices (AVDs) are available. Please connect a physical device or create an AVD first."
        );
      }

      // Start the first available AVD
      const avdName = availableAvds[0];
      await emulatorUtils.startEmulator(avdName, []);

      // Wait for the emulator to fully boot and get its device ID
      const newDeviceId = await emulatorUtils.waitForEmulatorReady(avdName);

      if (!newDeviceId) {
        throw new ActionableError(
          `Failed to start emulator ${avdName}.`
        );
      }

      // Use the new device ID for subsequent checks
      deviceId = newDeviceId;
    } else {
      // Use the first available device (could be physical or emulator)
      deviceId = allDevices[0];
    }
  }

  // Check if we can get an active window from the device
  try {
    const window = new Window(deviceId);
    const activeWindow = await window.getActive();

    if (!activeWindow || !activeWindow.appId || !activeWindow.activityName) {
      throw new ActionableError(
        `Cannot get active window information from device ${deviceId}. The device may not be fully booted or is in an unusual state.`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ActionableError(
      `Failed to verify device ${deviceId} readiness: Cannot get active window information. Error: ${errorMessage}`
    );
  }
}
