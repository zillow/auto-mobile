import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, SomePlatform } from "../models";
import {
  getInstallationStatus,
  setupCompleteAndroidEnvironment,
  CompleteSetupParams,
  checkJavaInstallation
} from "../utils/android-cmdline-tools/install";
import { logger } from "../utils/logger";

// Schema definitions
export const installPlatformDependenciesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform to install dependencies for"),
  update: z.enum(["force", "ifAvailable", "never"]).optional().default("ifAvailable").describe("Update behavior: force=always update, ifAvailable=update if detected but don't fail, never=don't update")
});

export const checkPlatformDependenciesSchema = z.object({
  platform: z.enum(["android", "ios"]).describe("Target platform to check dependencies for")
});

// Export interfaces for type safety
export interface InstallPlatformDependenciesArgs {
  platform: SomePlatform;
  update?: "force" | "ifAvailable" | "never";
}

export interface CheckPlatformDependenciesArgs {
  platform: SomePlatform;
}

export function registerEnvironmentTools() {
  // Install platform dependencies handler
  const installPlatformDependenciesHandler = async (
    args: InstallPlatformDependenciesArgs,
    progress?: ProgressCallback
  ) => {
    try {
      if (args.platform === "android") {
        return await installAndroidDependencies(args, progress);
      } else if (args.platform === "ios") {
        return await installIOSDependencies(args, progress);
      } else {
        throw new ActionableError(`Unsupported platform: ${args.platform}`);
      }
    } catch (error) {
      throw new ActionableError(`Failed to install ${args.platform} dependencies: ${error}`);
    }
  };

  // Check platform dependencies handler
  const checkPlatformDependenciesHandler = async (args: CheckPlatformDependenciesArgs) => {
    try {
      if (args.platform === "android") {
        return await checkAndroidDependencies();
      } else if (args.platform === "ios") {
        return await checkIOSDependencies();
      } else {
        throw new ActionableError(`Unsupported platform: ${args.platform}`);
      }
    } catch (error) {
      throw new ActionableError(`Failed to check ${args.platform} dependencies: ${error}`);
    }
  };

  // Register with the tool registry
  ToolRegistry.register(
    "installPlatformDependencies",
    "Install required dependencies and tools for the specified platform",
    installPlatformDependenciesSchema,
    installPlatformDependenciesHandler,
    true // Supports progress notifications
  );

  ToolRegistry.register(
    "checkPlatformDependencies",
    "Check the installation status of platform dependencies and tools",
    checkPlatformDependenciesSchema,
    checkPlatformDependenciesHandler
  );
}

// Android implementation
async function installAndroidDependencies(
  args: InstallPlatformDependenciesArgs,
  progress?: ProgressCallback
): Promise<any> {
  logger.info(`Installing Android dependencies with update: ${args.update}`);

  if (progress) {
    await progress(10, 100, "Starting Android dependency installation...");
  }

  // Determine if we should force installation based on update parameter
  let shouldForce = false;
  if (args.update === "force") {
    shouldForce = true;
  } else if (args.update === "never") {
    shouldForce = false;
  }
  // For "ifAvailable", we'll handle updates separately

  // Always use comprehensive setup - AutoMobile is opinionated about providing complete environment
  const setupParams: CompleteSetupParams = {
    installJava: true,
    installXcodeTools: true,
    force: shouldForce
  };

  if (progress) {
    await progress(30, 100, "Setting up complete Android development environment...");
  }

  const result = await setupCompleteAndroidEnvironment(setupParams);

  // Handle updates if requested and installation was successful but not forced
  let updateResult = null;
  if (args.update === "ifAvailable" && result.success && !shouldForce) {
    if (progress) {
      await progress(60, 100, "Checking for available updates...");
    }

    try {
      // Attempt to update by forcing a reinstall
      const updateParams: CompleteSetupParams = {
        installJava: true,
        installXcodeTools: true,
        force: true
      };
      updateResult = await setupCompleteAndroidEnvironment(updateParams);
      logger.info(`Update attempt completed: ${updateResult.success ? "successful" : "failed"}`);
    } catch (error) {
      logger.warn(`Update attempt failed but continuing: ${error}`);
      // Don't fail the overall operation for update failures when using "ifAvailable"
    }
  }

  if (progress) {
    await progress(100, 100, "Complete Android environment setup finished");
  }

  return createJSONToolResponse({
    success: result.success,
    message: result.success ? "Complete Android development environment installed" : "Some components failed to install",
    platform: "android",
    updateMode: args.update,
    steps: result.steps,
    environmentVariables: result.environmentVariables,
    recommendations: result.recommendations,
    updateAttempted: args.update === "ifAvailable" && updateResult !== null,
    updateSuccessful: updateResult?.success || false
  });
}

async function checkAndroidDependencies(): Promise<any> {
  logger.info("Checking Android dependencies status");

  const status = await getInstallationStatus();
  const javaStatus = await checkJavaInstallation();

  return createJSONToolResponse({
    platform: "android",
    hasInstallation: status.hasInstallation,
    locations: status.locations,
    bestLocation: status.bestLocation,
    recommendations: status.recommendations,
    availableTools: status.bestLocation?.available_tools || [],
    installationPath: status.bestLocation?.path || null,
    installationSource: status.bestLocation?.source || null,
    version: status.bestLocation?.version || null,
    java: {
      installed: javaStatus.installed,
      version: javaStatus.version,
      javaHome: javaStatus.javaHome
    }
  });
}

// iOS stubs (to be implemented later)
async function installIOSDependencies(
  args: InstallPlatformDependenciesArgs,
  progress?: ProgressCallback
): Promise<any> {
  logger.info("iOS dependency installation not yet implemented");

  if (progress) {
    await progress(100, 100, "iOS support coming soon");
  }

  return createJSONToolResponse({
    success: false,
    message: "iOS dependency installation is not yet implemented",
    platform: "ios",
    updateMode: args.update,
    recommendations: [
      "iOS support is planned for a future release",
      "Currently requires manual Xcode installation",
      "Ensure Xcode Command Line Tools are installed: xcode-select --install"
    ]
  });
}

async function checkIOSDependencies(): Promise<any> {
  logger.info("Checking iOS dependencies status (stub)");

  return createJSONToolResponse({
    platform: "ios",
    hasInstallation: false,
    message: "iOS dependency checking is not yet implemented",
    recommendations: [
      "iOS support is planned for a future release",
      "Manually verify Xcode is installed",
      "Check that iOS Simulator is available"
    ]
  });
}
