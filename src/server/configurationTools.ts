import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ConfigurationManager } from "../utils/configurationManager";
import { ConfigureMcpServerResult } from "../models";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ListInstalledApps } from "../features/observe/ListInstalledApps";
import { SourceMapper } from "../utils/sourceMapper";


export interface ConfigArgs {
  mode: "exploration" | "testAuthoring";
}


export interface AppSourceArgs {
  projectPath: string;
  appId: string;
  platform: "android" | "ios";
}

// Schema for config tool
const ConfigSchema = z.object({
  mode: z.enum(["exploration", "testAuthoring"]),
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
    "config",
    "Set/update any configuration parameters including project source, app ID, test authoring, and A/B testing options. All parameters are optional and will be merged with existing configuration.",
    ConfigSchema,
    async (args: ConfigArgs): Promise<any> => {
      try {
        // Update configuration with provided parameters
        await ConfigurationManager.getInstance().updateConfig(args);

        logger.info(`Server now in ${args.mode} mode`);

        return createJSONToolResponse({
          success: true,
          message: `Server now in ${args.mode} mode`
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
    "addAppSource",
    "Set/update any configuration parameters including project source, app ID, test authoring, and A/B testing options. All parameters are optional and will be merged with existing configuration.",
    AppSourceSchema,
    async (deviceId: string, args: AppSourceArgs): Promise<any> => {
      try {

        const apps = await new ListInstalledApps(deviceId).execute();
        if (!apps.includes(args.appId)) {
          return createJSONToolResponse({
            success: false,
            message: `App ${args.appId} is not installed on device ${deviceId}`
          });
        }

        // Update configuration with provided parameters
        await ConfigurationManager.getInstance().addAppConfig(args.appId, args.projectPath, args.platform);

        await SourceMapper.getInstance().scanProject(args.appId);

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
    "getConfig",
    "Retrieve current configuration.",
    z.object({}),
    async (): Promise<any> => {
      try {
        const currentConfig = ConfigurationManager.getInstance().getServerConfig();

        const result: ConfigureMcpServerResult = {
          success: true,
          message: "Retrieved current MCP server configuration",
          currentConfig
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

        const result: ConfigureMcpServerResult = {
          success: true,
          message: "MCP server configuration reset to defaults",
          currentConfig: ConfigurationManager.getInstance().getServerConfig()
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
