import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models";
import { LaunchApp } from "../features/action/LaunchApp";
import { TerminateApp } from "../features/action/TerminateApp";
import { InstallApp } from "../features/action/InstallApp";
import { createJSONToolResponse } from "../utils/toolUtils";
import { Platform } from "../utils/deviceSessionManager";

// Schema definitions
export const packageNameSchema = z.object({
  appId: z.string().describe("App package ID of the app"),
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const launchAppSchema = z.object({
  appId: z.string().describe("App package ID of the app"),
  clearAppData: z.boolean().optional().describe("Whether to clear app data before launching, default false"),
  coldBoot: z.boolean().optional().describe("Whether to cold boot the app, default true"),
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

export const installAppSchema = z.object({
  apkPath: z.string().describe("Path to the APK file to install"),
  platform: z.enum(["android", "ios"]).describe("Target platform")
});

// Export interfaces for type safety
export interface AppActionArgs {
  appId: string;
  platform: Platform;
}

export interface LaunchAppActionArgs {
  appId: string;
  clearAppData?: boolean;
  coldBoot?: boolean;
  platform: Platform;
}

export interface InstallAppArgs {
  apkPath: string;
  platform: Platform;
}

// Register tools
export function registerAppTools(
) {
  // Launch app handler
  const launchAppHandler = async (deviceId: string, platform: Platform, args: LaunchAppActionArgs) => {
    try {
      const launchApp = new LaunchApp(deviceId);
      const result = await launchApp.execute(
        args.appId,
        args.clearAppData || false,
        args.coldBoot || true,
        undefined
      );

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
  const terminateAppHandler = async (deviceId: string, platform: Platform, args: AppActionArgs) => {
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

  // Install app handler
  const installAppHandler = async (deviceId: string, platform: Platform, args: InstallAppArgs) => {
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
    launchAppSchema,
    launchAppHandler
  );

  ToolRegistry.registerDeviceAware(
    "terminateApp",
    "Terminate an app by package name",
    packageNameSchema,
    terminateAppHandler
  );

  ToolRegistry.registerDeviceAware(
    "installApp",
    "Install an APK file on the device",
    installAppSchema,
    installAppHandler
  );
}
