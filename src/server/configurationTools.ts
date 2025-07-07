import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ConfigurationManager } from "../utils/configurationManager";
import { ConfigureMcpServerResult } from "../models";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";


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
  const configManager = ConfigurationManager.getInstance();

  // config tool
  ToolRegistry.register(
    "config",
    "Set/update any configuration parameters including project source, app ID, test authoring, and A/B testing options. All parameters are optional and will be merged with existing configuration.",
    ConfigSchema,
    async (args: ConfigArgs): Promise<any> => {
      try {
        // Update configuration with provided parameters
        await configManager.updateConfig(args);

        logger.info(`Server now in ${args.mode} mode`);

        return createJSONToolResponse({
          success: true,
          message: `Server now in ${args.mode} mode`
        });
      } catch (error) {
        logger.error("Failed to configure MCP server:", error);
        const result: ConfigureMcpServerResult = {
          success: false,
          message: `Failed to configure MCP server: ${error}`,
          currentConfig: configManager.getServerConfig()
        };
        return createJSONToolResponse(result);
      }
    }
  );

  ToolRegistry.register(
    "addAppSource",
    "Set/update any configuration parameters including project source, app ID, test authoring, and A/B testing options. All parameters are optional and will be merged with existing configuration.",
    AppSourceSchema,
    async (args: AppSourceArgs): Promise<any> => {
      try {
        // Update configuration with provided parameters
        await configManager.addAppConfig(args.appId, args.projectPath, args.platform);

        logger.info("App source added successfully");

        return createJSONToolResponse({
          success: true,
          message: "App source added successfully"
        });
      } catch (error) {
        logger.error("Failed to configure MCP server:", error);
        const result: ConfigureMcpServerResult = {
          success: false,
          message: `Failed to configure MCP server: ${error}`,
          currentConfig: configManager.getServerConfig()
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
        const currentConfig = configManager.getServerConfig();

        const result: ConfigureMcpServerResult = {
          success: true,
          message: "Retrieved current MCP server configuration",
          currentConfig
        };

        return createJSONToolResponse(result);
      } catch (error) {
        logger.error("Failed to get MCP server configuration:", error);
        const result: ConfigureMcpServerResult = {
          success: false,
          message: `Failed to get MCP server configuration: ${error}`,
          currentConfig: {}
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

        await configManager.resetServerConfig();

        const result: ConfigureMcpServerResult = {
          success: true,
          message: "MCP server configuration reset to defaults",
          currentConfig: configManager.getServerConfig()
        };

        return createJSONToolResponse(result);
      } catch (error) {
        logger.error("Failed to reset MCP server configuration:", error);
        const result: ConfigureMcpServerResult = {
          success: false,
          message: `Failed to reset MCP server configuration: ${error}`,
          currentConfig: configManager.getServerConfig()
        };
        return createJSONToolResponse(result);
      }
    }
  );
}
