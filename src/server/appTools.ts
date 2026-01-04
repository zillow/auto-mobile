import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError, BootedDevice } from "../models";
import { LaunchApp } from "../features/action/LaunchApp";
import { TerminateApp } from "../features/action/TerminateApp";
import { InstallApp } from "../features/action/InstallApp";
import { createJSONToolResponse } from "../utils/toolUtils";
import { addSessionUuidToSchema } from "./toolSchemaHelpers";
import { invalidateInstalledAppsCache, notifyInstalledAppResourceUpdated } from "./appResources";
import { logger } from "../utils/logger";

// Schema definitions
export const packageNameSchema = addSessionUuidToSchema(z.object({
  appId: z.string().describe("App package ID of the app"),
}));

export const launchAppSchema = addSessionUuidToSchema(z.object({
  appId: z.string().describe("App package ID of the app"),
  clearAppData: z.boolean().optional().describe("Whether to clear app data before launching, default false"),
  coldBoot: z.boolean().optional().describe("Whether to cold boot the app, default false"),
}));

export const installAppSchema = addSessionUuidToSchema(z.object({
  apkPath: z.string().describe("Path to the APK file to install"),
}));

// Export interfaces for type safety
export interface AppActionArgs {
  appId: string;
}

export interface LaunchAppActionArgs {
  appId: string;
  clearAppData?: boolean;
  coldBoot?: boolean;
}

export interface InstallAppArgs {
  apkPath: string;
}

// Register tools
export function registerAppTools(
) {
  // Launch app handler
  const launchAppHandler = async (device: BootedDevice, args: LaunchAppActionArgs) => {
    try {
      const launchApp = new LaunchApp(device);
      const result = await launchApp.execute(
        args.appId,
        args.clearAppData ?? false,
        args.coldBoot ?? false,
        undefined, // activityName
        "single", // foregroundCheckMode
        undefined, // userId
        true // skipUiStability - skip the 12+ second stability polling
      );

      return createJSONToolResponse({
        message: `Launched app ${args.appId}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to launch app: ${error}`);
    } finally {
      try {
        invalidateInstalledAppsCache(device.deviceId);
        await notifyInstalledAppResourceUpdated(device.deviceId);
      } catch (error) {
        logger.warn(`[AppTools] Failed to refresh app resources after launch: ${error}`);
      }
    }
  };

  // Terminate app handler
  const terminateAppHandler = async (device: BootedDevice, args: AppActionArgs) => {
    try {
      const terminateApp = new TerminateApp(device);
      const result = await terminateApp.execute(args.appId, {
        skipUiStability: true // skip the 12+ second stability polling
      });

      return createJSONToolResponse({
        message: `Terminated app ${args.appId}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to terminate app: ${error}`);
    } finally {
      try {
        invalidateInstalledAppsCache(device.deviceId);
        await notifyInstalledAppResourceUpdated(device.deviceId);
      } catch (error) {
        logger.warn(`[AppTools] Failed to refresh app resources after terminate: ${error}`);
      }
    }
  };

  // Install app handler
  const installAppHandler = async (device: BootedDevice, args: InstallAppArgs, _progress?: unknown, signal?: AbortSignal) => {
    try {
      const installApp = new InstallApp(device);
      const result = await installApp.execute(args.apkPath, undefined, signal);

      return createJSONToolResponse({
        message: `Installed app from ${args.apkPath}`,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to install app: ${error}`);
    } finally {
      try {
        invalidateInstalledAppsCache(device.deviceId);
        await notifyInstalledAppResourceUpdated(device.deviceId);
      } catch (error) {
        logger.warn(`[AppTools] Failed to refresh app resources after install: ${error}`);
      }
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "launchApp",
    "Launch an app by package name. For Android, automatically detects and targets the appropriate user profile (personal or work). Returns userId indicating which profile was used (0=personal, 10+=work profile).",
    launchAppSchema,
    launchAppHandler
  );

  ToolRegistry.registerDeviceAware(
    "terminateApp",
    "Terminate an app by package name. For Android, automatically detects and targets the appropriate user profile. Returns userId indicating which profile was targeted.",
    packageNameSchema,
    terminateAppHandler
  );

  ToolRegistry.registerDeviceAware(
    "installApp",
    "Install an APK file on the device. For Android, automatically installs to the appropriate user profile (work profile if exists, otherwise personal). Returns userId indicating where the app was installed.",
    installAppSchema,
    installAppHandler
  );
}
