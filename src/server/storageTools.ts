import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { addDeviceTargetingToSchema } from "./toolSchemaHelpers";
import { createJSONToolResponse } from "../utils/toolUtils";
import { CtrlProxyClient } from "../features/observe/android";
import { defaultAdbClientFactory } from "../utils/android-cmdline-tools/AdbClientFactory";
import { ResourceRegistry } from "./resourceRegistry";
import type { KeyValueType } from "../features/storage/storageTypes";

// Valid types for key-value storage
const KEY_VALUE_TYPES = ["STRING", "INT", "LONG", "FLOAT", "BOOLEAN", "STRING_SET"] as const;

// Schema for setKeyValue tool
export const setKeyValueSchema = addDeviceTargetingToSchema(
  z.object({
    appId: z.string().describe("App package ID"),
    fileName: z.string().describe("SharedPreferences file name (without .xml extension)"),
    key: z.string().describe("The key to set"),
    value: z.string().nullable().describe("The value to set, serialized as a string (null to clear)"),
    type: z.enum(KEY_VALUE_TYPES).describe("The type of the value (STRING, INT, LONG, FLOAT, BOOLEAN, STRING_SET)"),
  })
);

// Schema for removeKeyValue tool
export const removeKeyValueSchema = addDeviceTargetingToSchema(
  z.object({
    appId: z.string().describe("App package ID"),
    fileName: z.string().describe("SharedPreferences file name (without .xml extension)"),
    key: z.string().describe("The key to remove"),
  })
);

// Schema for clearKeyValueFile tool
export const clearKeyValueFileSchema = addDeviceTargetingToSchema(
  z.object({
    appId: z.string().describe("App package ID"),
    fileName: z.string().describe("SharedPreferences file name to clear entirely (without .xml extension)"),
  })
);

export interface SetKeyValueArgs {
  appId: string;
  fileName: string;
  key: string;
  value: string | null;
  type: KeyValueType;
}

export interface RemoveKeyValueArgs {
  appId: string;
  fileName: string;
  key: string;
}

export interface ClearKeyValueFileArgs {
  appId: string;
  fileName: string;
}

/**
 * Build resource URI for storage entries (mirrors storageResources.ts)
 */
function buildEntriesUri(deviceId: string, packageName: string, fileName: string): string {
  return `automobile:devices/${deviceId}/storage/${encodeURIComponent(packageName)}/${encodeURIComponent(fileName)}/entries`;
}

/**
 * Validate that the device is an Android device
 */
function validateAndroidDevice(device: BootedDevice): void {
  if (device.platform !== "android") {
    throw new ActionableError(
      "Key-value storage write is only supported on Android devices. " +
      "The app must have AutoMobile SDK integrated with storage inspection enabled."
    );
  }
}

/**
 * Register storage write tools.
 *
 * Read-only storage operations (listing files, reading entries) are exposed as
 * MCP resources in storageResources.ts. Only write operations are tools.
 */
export function registerStorageTools(): void {
  // setKeyValue handler
  const setKeyValueHandler = async (device: BootedDevice, args: SetKeyValueArgs) => {
    validateAndroidDevice(device);

    try {
      const client = CtrlProxyClient.getInstance(device, defaultAdbClientFactory);
      if (args.value === null) {
        await client.removePreference(args.appId, args.fileName, args.key);
      } else {
        await client.setPreference(args.appId, args.fileName, args.key, args.value, args.type);
      }

      // Notify subscribers that entries changed so they re-read fresh data
      void ResourceRegistry.notifyResourceUpdated(
        buildEntriesUri(device.deviceId, args.appId, args.fileName)
      );

      return createJSONToolResponse({
        success: true,
        appId: args.appId,
        fileName: args.fileName,
        key: args.key,
        type: args.type,
      });
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to set key-value entry: ${error}`);
    }
  };

  // removeKeyValue handler
  const removeKeyValueHandler = async (device: BootedDevice, args: RemoveKeyValueArgs) => {
    validateAndroidDevice(device);

    try {
      const client = CtrlProxyClient.getInstance(device, defaultAdbClientFactory);
      await client.removePreference(args.appId, args.fileName, args.key);

      void ResourceRegistry.notifyResourceUpdated(
        buildEntriesUri(device.deviceId, args.appId, args.fileName)
      );

      return createJSONToolResponse({
        success: true,
        appId: args.appId,
        fileName: args.fileName,
        key: args.key,
      });
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to remove key-value entry: ${error}`);
    }
  };

  // clearKeyValueFile handler
  const clearKeyValueFileHandler = async (device: BootedDevice, args: ClearKeyValueFileArgs) => {
    validateAndroidDevice(device);

    try {
      const client = CtrlProxyClient.getInstance(device, defaultAdbClientFactory);
      await client.clearPreferenceStore(args.appId, args.fileName);

      void ResourceRegistry.notifyResourceUpdated(
        buildEntriesUri(device.deviceId, args.appId, args.fileName)
      );

      return createJSONToolResponse({
        success: true,
        appId: args.appId,
        fileName: args.fileName,
      });
    } catch (error) {
      if (error instanceof ActionableError) {
        throw error;
      }
      throw new ActionableError(`Failed to clear key-value file: ${error}`);
    }
  };

  ToolRegistry.registerDeviceAware(
    "setKeyValue",
    "Set a key-value entry in an Android app's SharedPreferences. " +
    "Requires the app to have AutoMobile SDK integrated with storage inspection enabled.",
    setKeyValueSchema,
    setKeyValueHandler
  );

  ToolRegistry.registerDeviceAware(
    "removeKeyValue",
    "Remove a key-value entry from an Android app's SharedPreferences. " +
    "Requires the app to have AutoMobile SDK integrated with storage inspection enabled.",
    removeKeyValueSchema,
    removeKeyValueHandler
  );

  ToolRegistry.registerDeviceAware(
    "clearKeyValueFile",
    "Clear all key-value entries from an Android app's SharedPreferences file. " +
    "Requires the app to have AutoMobile SDK integrated with storage inspection enabled.",
    clearKeyValueFileSchema,
    clearKeyValueFileHandler
  );
}
