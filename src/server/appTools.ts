import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { LaunchApp } from "../features/action/LaunchApp";
import { TerminateApp } from "../features/action/TerminateApp";
import { ClearAppData } from "../features/action/ClearAppData";
import { InstallApp } from "../features/action/InstallApp";
import { OpenURL } from "../features/action/OpenURL";
import { Rotate } from "../features/action/Rotate";
import { ObserveScreen } from "../features/observe/ObserveScreen";
import { createJSONToolResponse, verifyDeviceIsReady } from "../utils/toolUtils";

// Schema definitions
export const packageNameSchema = z.object({
  appId: z.string().describe("App package ID of the app")
});

export const installAppSchema = z.object({
  apkPath: z.string().describe("Path to the APK file to install")
});

export const openUrlSchema = z.object({
  url: z.string().describe("URL to open in the default browser")
});

export const orientationSchema = z.object({
  orientation: z.enum(["portrait", "landscape"]).describe("The orientation to set")
});

export const deviceIdSchema = z.object({
  deviceId: z.string().describe("The device ID to set as active")
});

// Export interfaces for type safety
export interface AppActionArgs {
  appId: string;
}

export interface InstallAppArgs {
  apkPath: string;
}

export interface OpenUrlArgs {
  url: string;
}

export interface OrientationArgs {
  orientation: "portrait" | "landscape";
}

export interface DeviceIdArgs {
  deviceId: string;
}

// Register tools
export function registerAppTools(
  getCurrentDeviceId: () => string | undefined,
  setCurrentDeviceId: (deviceId: string | undefined) => void
) {
  // Launch app handler
  const launchAppHandler = async (args: AppActionArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

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
  const terminateAppHandler = async (args: AppActionArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

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
  const clearAppDataHandler = async (args: AppActionArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

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
  const installAppHandler = async (args: InstallAppArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId, args.apkPath);

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

  // Open URL handler
  const openUrlHandler = async (args: OpenUrlArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

      const openUrl = new OpenURL(deviceId);
      const result = await openUrl.execute(args.url);

      return createJSONToolResponse({
        message: `Opened URL ${args.url}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to open URL: ${error}`);
    }
  };

  // Change orientation handler
  const changeOrientationHandler = async (args: OrientationArgs) => {
    try {
      const deviceId = getCurrentDeviceId();
      await verifyDeviceIsReady(deviceId);

      const rotate = new Rotate(deviceId);
      const result = await rotate.execute(args.orientation); // observe = true

      return createJSONToolResponse({
        message: `Changed orientation to ${args.orientation}`,
        observation: result.observation,
        ...result
      });
    } catch (error) {
      throw new ActionableError(`Failed to change orientation: ${error}`);
    }
  };

  // Set active device handler
  const setActiveDeviceHandler = async (args: DeviceIdArgs) => {
    try {
      setCurrentDeviceId(args.deviceId);
      const deviceId = getCurrentDeviceId();

      // Verify device is valid by observing
      const observeScreen = new ObserveScreen(deviceId);
      const result = await observeScreen.execute();

      return createJSONToolResponse({
        message: `Active device set to ${args.deviceId}`,
        deviceInfo: result.screenSize
      });
    } catch (error) {
      setCurrentDeviceId(undefined); // Reset if activation fails
      throw new ActionableError(`Failed to set active device: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.register(
    "launchApp",
    "Launch an app by package name",
    packageNameSchema,
    launchAppHandler
  );

  ToolRegistry.register(
    "terminateApp",
    "Terminate an app by package name",
    packageNameSchema,
    terminateAppHandler
  );

  ToolRegistry.register(
    "clearAppData",
    "Clear data for an app by package name",
    packageNameSchema,
    clearAppDataHandler
  );

  ToolRegistry.register(
    "installApp",
    "Install an APK file on the device",
    installAppSchema,
    installAppHandler
  );

  ToolRegistry.register(
    "openUrl",
    "Open a URL in the default browser",
    openUrlSchema,
    openUrlHandler
  );

  ToolRegistry.register(
    "changeOrientation",
    "Change the device orientation",
    orientationSchema,
    changeOrientationHandler
  );

  ToolRegistry.register(
    "setActiveDevice",
    "Set the active device ID for subsequent operations",
    deviceIdSchema,
    setActiveDeviceHandler
  );
}
