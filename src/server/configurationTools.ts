import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ConfigurationManager } from "../utils/configurationManager";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
// import { SourceMapper } from "../utils/sourceMapper";


export interface DeviceSessionArgs {
  exploration?: ExplorationArgs;
  testAuthoring?: TestAuthoringArgs;
  deviceId: string;
}

export interface TestAuthoringArgs {
  appId: string;
  persist: "never" | "devicePresent" | "always";
}

export interface ExplorationArgs {
  deepLinkSkipping: boolean;
}

export interface AppSourceArgs {
  projectPath: string;
  appId: string;
  platform: "android" | "ios";
}

// Schema for config tool
const ConfigSchema = z.object({
  exploration: z.object({
    deepLinkSkipping: z.boolean()
  }).optional(),
  testAuthoring: z.object({
    appId: z.string(),
    persist: z.enum(["exploration", "testAuthoring"]),
  }).optional(),
  deviceId: z.string()
});

// Schema for config tool
const AppSourceSchema = z.object({
  projectPath: z.string(),
  appId: z.string(),
  platform: z.string(),
});

export function registerConfigurationTools(): void {

  // config tool
  ToolRegistry.register(
    "setDeviceMode",
    "Set parameters for a particular device in a given mode.",
    ConfigSchema,
    async (args: DeviceSessionArgs): Promise<any> => {
      try {
        // Update configuration with provided parameters
        await ConfigurationManager.getInstance().updateDeviceSession(args, "android");

        return createJSONToolResponse({
          success: true,
          message: `Device configuration updated successfully`
        });
      } catch (error) {
        logger.error("Failed to configure MCP server:", error);
        const result = {
          success: false,
          message: `Failed to configure MCP server: ${error}`
        };
        return createJSONToolResponse(result);
      }
    }
  );

  ToolRegistry.registerDeviceAware(
    "setAppSource",
    "For a given appId, set the source code path and platform.",
    AppSourceSchema,
    async (deviceId: string, args: AppSourceArgs): Promise<any> => {
      try {
        const apps = await new ListInstalledApps(deviceId).execute();
        if (apps.find(app => app === args.appId) === undefined) {
          return createJSONToolResponse({
            success: false,
            message: `App ${args.appId} is not installed on device ${deviceId}, use listApps and try again.`
          });
        }

        // Update configuration with provided parameters
        await ConfigurationManager.getInstance().setAppSource(
          args.appId,
          args.projectPath,
          args.platform,
          false
        );

        // await SourceMapper.getInstance().scanProject(args.appId);

        logger.info("App source added successfully");

        return createJSONToolResponse({
          success: true,
          message: "App source added successfully"
        });
      } catch (error) {
        logger.error("Failed to configure MCP server:", error);
        const result = {
          success: false,
          message: `Failed to configure MCP server: ${error}`
        };
        return createJSONToolResponse(result);
      }
    }
  );

  // getConfig tool - for getting current configuration
  ToolRegistry.register(
    "getAllConfigs",
    "Retrieve current configuration.",
    z.object({}),
    async (): Promise<any> => {
      try {
        const deviceConfig = ConfigurationManager.getInstance().getDeviceConfigs();
        const appConfig = ConfigurationManager.getInstance().getAppConfigs();

        const result = {
          success: true,
          message: "Retrieved current MCP server configuration",
          deviceConfig,
          appConfig
        };

        return createJSONToolResponse(result);
      } catch (error) {
        logger.error("Failed to get MCP server configuration:", error);
        const result = {
          success: false,
          message: `Failed to get MCP server configuration: ${error}`,
        };
        return createJSONToolResponse(result);
      }
    }
  );

  // resetConfig tool - for resetting configuration
  ToolRegistry.register(
    "resetConfig",
    "Reset to default settings. This will clear all saved configuration.",
    z.object({}),
    async (): Promise<any> => {
      try {
        logger.info("Resetting MCP server configuration to defaults");

        await ConfigurationManager.getInstance().resetServerConfig();

        const result = {
          success: true,
          message: "MCP server configuration reset to defaults",
        };

        return createJSONToolResponse(result);
      } catch (error) {
        logger.error("Failed to reset MCP server configuration:", error);
        const result = {
          success: false,
          message: `Failed to reset MCP server configuration: ${error}`
        };
        return createJSONToolResponse(result);
      }
    }
  );
}
