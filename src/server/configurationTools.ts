import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ConfigurationManager } from "../utils/configurationManager";
import { ConfigureMcpServerResult } from "../models";
import { logger } from "../utils/logger";
import { createJSONToolResponse } from "../utils/toolUtils";

// Schema for Experiment
const ExperimentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional()
});

// Schema for A/B test treatment
const AbTestTreatmentSchema = z.object({
  experimentId: z.string(),
  treatmentId: z.string(),
  parameters: z.record(z.any()),
  featureOverrides: z.record(z.any()).optional()
});

// Schema for config tool
const ConfigSchema = z.object({
  androidProjectPath: z.string().optional(),
  androidAppId: z.string().optional(),
  userCredentialFile: z.string().optional(),
  mode: z.enum(["exploration", "testAuthoring"]).optional(),
  experiments: z.array(ExperimentSchema).optional(),
  treatments: z.record(AbTestTreatmentSchema).optional()
});

export function registerConfigurationTools(): void {
  const configManager = ConfigurationManager.getInstance();

  // config tool
  ToolRegistry.register(
    "config",
    "Set/update any configuration parameters including project source, app ID, test authoring, and A/B testing options. All parameters are optional and will be merged with existing configuration.",
    ConfigSchema,
    async (args): Promise<any> => {
      try {
        logger.info("Configuring MCP server with parameters:", args);

        // Update configuration with provided parameters
        await configManager.updateConfig(args);

        // Get current configuration to return
        const currentConfig = configManager.getConfig();

        logger.info("MCP server configuration updated successfully");

        const result: ConfigureMcpServerResult = {
          success: true,
          message: "MCP server configuration updated successfully",
          currentConfig
        };

        return createJSONToolResponse(result);
      } catch (error) {
        logger.error("Failed to configure MCP server:", error);
        const result: ConfigureMcpServerResult = {
          success: false,
          message: `Failed to configure MCP server: ${error}`,
          currentConfig: configManager.getConfig()
        };
        return createJSONToolResponse(result);
      }
    }
  );

  // getConfig tool - for getting current configuration
  ToolRegistry.register(
    "getConfig",
    "Retrieve current configuration including all settings and preferences.",
    z.object({}),
    async (): Promise<any> => {
      try {
        const currentConfig = configManager.getConfig();

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

        await configManager.resetConfig();

        const result: ConfigureMcpServerResult = {
          success: true,
          message: "MCP server configuration reset to defaults",
          currentConfig: configManager.getConfig()
        };

        return createJSONToolResponse(result);
      } catch (error) {
        logger.error("Failed to reset MCP server configuration:", error);
        const result: ConfigureMcpServerResult = {
          success: false,
          message: `Failed to reset MCP server configuration: ${error}`,
          currentConfig: configManager.getConfig()
        };
        return createJSONToolResponse(result);
      }
    }
  );
}
