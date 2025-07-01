import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { LaunchApp } from "../features/action/LaunchApp";
import { TerminateApp } from "../features/action/TerminateApp";
import { ClearAppData } from "../features/action/ClearAppData";
import { InstallApp } from "../features/action/InstallApp";
import { createJSONToolResponse } from "../utils/toolUtils";

// Schema definitions
export const packageNameSchema = z.object({
  appId: z.string().describe("App package ID of the app")
});

export const installAppSchema = z.object({
  apkPath: z.string().describe("Path to the APK file to install")
});

// Export interfaces for type safety
export interface AppActionArgs {
  appId: string;
}

export interface InstallAppArgs {
  apkPath: string;
}

// Register tools
export function registerAppTools(
) {
  // Launch app handler
  const launchAppHandler = async (deviceId: string, args: AppActionArgs) => {
    try {
      const launchApp = new LaunchApp(deviceId);
      const result = await launchApp.execute(args.appId, undefined);

      return createJSONToolResponse({
        message: `Launched app ${args.appId}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to launch app: ${error}`);
    }
  };

  // Terminate app handler
  const terminateAppHandler = async (deviceId: string, args: AppActionArgs) => {
    try {
      const terminateApp = new TerminateApp(deviceId);
      const result = await terminateApp.execute(args.appId); // observe = true

      return createJSONToolResponse({
        message: `Terminated app ${args.appId}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to terminate app: ${error}`);
    }
  };

  // Clear app data handler
  const clearAppDataHandler = async (deviceId: string, args: AppActionArgs) => {
    try {
      const clearAppData = new ClearAppData(deviceId);
      const result = await clearAppData.execute(args.appId);

      return createJSONToolResponse({
        message: `Cleared data for app ${args.appId}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to clear app data: ${error}`);
    }
  };

  // Install app handler
  const installAppHandler = async (deviceId: string, args: InstallAppArgs) => {
    try {
      const installApp = new InstallApp(deviceId);
      const result = await installApp.execute(args.apkPath);

      return createJSONToolResponse({
        message: `Installed app from ${args.apkPath}`,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to install app: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.registerDeviceAware(
    "launchApp",
    "Launch an app by package name",
    packageNameSchema,
    launchAppHandler
  );

  ToolRegistry.registerDeviceAware(
    "terminateApp",
    "Terminate an app by package name",
    packageNameSchema,
    terminateAppHandler
  );

  ToolRegistry.registerDeviceAware(
    "clearAppData",
    "Clear data for an app by package name",
    packageNameSchema,
    clearAppDataHandler
  );

  ToolRegistry.registerDeviceAware(
    "installApp",
    "Install an APK file on the device",
    installAppSchema,
    installAppHandler
  );
}
