import { z } from "zod";
import { ToolRegistry } from "./toolRegistry";
import { ActionableError } from "../models/ActionableError";
import { SourceMapper } from "../utils/sourceMapper";
import { AddAppConfigResult } from "../models/SourceIndexing";
import { logger } from "../utils/logger";

// Schema for adding app configuration
const AddAppConfigSchema = z.object({
  appId: z.string().describe("Android app package ID (e.g., com.example.myapp)"),
  sourceDir: z.string().describe("Path to the Android app source directory")
});

// Schema for setting Android app source (user-facing tool)
const SetAndroidAppSourceSchema = z.object({
  appId: z.string().describe("Android app package ID (e.g., com.zillow.android.zillowmap)"),
  sourcePath: z.string().describe("Absolute path to the Android app source code directory that you have permission to read")
});

// Schema for getting source index
const GetSourceIndexSchema = z.object({
  appId: z.string().describe("Android app package ID to get source index for")
});

// Schema for finding activity source info
const FindActivitySourceSchema = z.object({
  appId: z.string().describe("Android app package ID"),
  activityClassName: z.string().describe("Activity class name from view hierarchy (e.g., 'com.example.MainActivity')")
});

// Schema for finding fragment source info
const FindFragmentSourceSchema = z.object({
  appId: z.string().describe("Android app package ID"),
  fragmentClassName: z.string().describe("Fragment class name (e.g., 'SearchFragment')"),
  activityClassName: z.string().optional().describe("Associated activity class name for better matching")
});

// Type interfaces for parameters
interface AddAppConfigParams {
  appId: string;
  sourceDir: string;
}

interface SetAndroidAppSourceParams {
  appId: string;
  sourcePath: string;
}

interface GetSourceIndexParams {
  appId: string;
}

interface FindActivitySourceParams {
  appId: string;
  activityClassName: string;
}

interface FindFragmentSourceParams {
  appId: string;
  fragmentClassName: string;
  activityClassName?: string;
}

export function registerSourceIndexingTools(): void {
  // Initialize the source mapper on startup
  const sourceMapper = SourceMapper.getInstance();
  sourceMapper.loadAppConfigs().catch(error => {
    logger.warn(`Failed to load app configurations on startup: ${error}`);
  });

  // Tool to add app configuration
  ToolRegistry.register(
    "addAppConfig",
    "Add Android app source configuration for indexing activities and fragments",
    AddAppConfigSchema,
    async (params: AddAppConfigParams): Promise<AddAppConfigResult> => {
      try {
        await sourceMapper.addAppConfig(params.appId, params.sourceDir);

        return {
          success: true,
          appId: params.appId,
          sourceDir: params.sourceDir
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          appId: params.appId,
          sourceDir: params.sourceDir,
          error: errorMessage
        };
      }
    }
  );

  // Tool to set Android app source
  ToolRegistry.register(
    "setAndroidAppSource",
    "Configure Android app source directory for code analysis when user provides app package ID and source path with explicit permission to read the source directory. Use this when user wants to analyze or find source files for a specific Android app they have access to.",
    SetAndroidAppSourceSchema,
    async (params: SetAndroidAppSourceParams): Promise<AddAppConfigResult> => {
      try {
        await sourceMapper.addAppConfig(params.appId, params.sourcePath);

        return {
          success: true,
          appId: params.appId,
          sourceDir: params.sourcePath
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        return {
          success: false,
          appId: params.appId,
          sourceDir: params.sourcePath,
          error: errorMessage
        };
      }
    }
  );

  // Tool to get all app configurations
  ToolRegistry.register(
    "getAppConfigs",
    "Get all configured Android app source directories",
    z.object({}),
    async () => {
      const configs = sourceMapper.getAppConfigs();

      return {
        success: true,
        configs,
        count: configs.length
      };
    }
  );

  // Tool to get source index for an app
  ToolRegistry.register(
    "getSourceIndex",
    "Get or create source index for an Android app (activities and fragments)",
    GetSourceIndexSchema,
    async (params: GetSourceIndexParams) => {
      try {
        const sourceIndex = await sourceMapper.getSourceIndex(params.appId);

        if (!sourceIndex) {
          throw new ActionableError(`No source directory configured for app: ${params.appId}`);
        }

        // Convert Maps to objects for JSON serialization
        const result = {
          success: true,
          appId: params.appId,
          activities: Object.fromEntries(sourceIndex.activities),
          fragments: Object.fromEntries(sourceIndex.fragments),
          views: Object.fromEntries(sourceIndex.views),
          lastIndexed: sourceIndex.lastIndexed,
          activityCount: sourceIndex.activities.size,
          fragmentCount: sourceIndex.fragments.size,
          viewCount: sourceIndex.views.size
        };

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ActionableError(`Failed to get source index: ${errorMessage}`);
      }
    }
  );

  // Tool to find activity source information
  ToolRegistry.register(
    "findActivitySource",
    "Find source file information for an activity by class name",
    FindActivitySourceSchema,
    async (params: FindActivitySourceParams) => {
      try {
        const activityInfo = await sourceMapper.findActivityInfo(
          params.appId,
          params.activityClassName
        );

        if (!activityInfo) {
          return {
            success: false,
            appId: params.appId,
            activityClassName: params.activityClassName,
            error: `Activity not found: ${params.activityClassName}`
          };
        }

        return {
          success: true,
          appId: params.appId,
          activityClassName: params.activityClassName,
          activityInfo
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ActionableError(`Failed to find activity source: ${errorMessage}`);
      }
    }
  );

  // Tool to find fragment source information
  ToolRegistry.register(
    "findFragmentSource",
    "Find source file information for a fragment by class name",
    FindFragmentSourceSchema,
    async (params: FindFragmentSourceParams) => {
      try {
        let activityInfo = undefined;

        // If activity class name is provided, try to find it first for better matching
        if (params.activityClassName) {
          activityInfo = await sourceMapper.findActivityInfo(
            params.appId,
            params.activityClassName
          );
        }

        const fragmentInfo = await sourceMapper.findFragmentInfo(
          params.appId,
          params.fragmentClassName,
          activityInfo || undefined
        );

        if (!fragmentInfo) {
          return {
            success: false,
            appId: params.appId,
            fragmentClassName: params.fragmentClassName,
            activityClassName: params.activityClassName,
            error: `Fragment not found: ${params.fragmentClassName}`
          };
        }

        return {
          success: true,
          appId: params.appId,
          fragmentClassName: params.fragmentClassName,
          activityClassName: params.activityClassName,
          fragmentInfo,
          activityInfo
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ActionableError(`Failed to find fragment source: ${errorMessage}`);
      }
    }
  );

  logger.info("Source indexing tools registered successfully");
}
