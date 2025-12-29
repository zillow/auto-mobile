import { z } from "zod";
import { ToolRegistry, ProgressCallback } from "./toolRegistry";
import { createJSONToolResponse } from "../utils/toolUtils";
import { ActionableError, SomePlatform } from "../models";
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
  logger.info(`Install platform dependencies request received for Android (not supported)`);

  if (progress) {
    await progress(100, 100, "Tool installation functionality has been removed");
  }

  return createJSONToolResponse({
    success: false,
    message: "Tool installation functionality has been removed. Please install Android command-line tools manually.",
    platform: "android",
    updateMode: args.update,
    steps: [],
    environmentVariables: {},
    recommendations: [
      "Android command-line tools installation is no longer automated",
      "Please install Android SDK manually from: https://developer.android.com/studio",
      "Or on macOS with Homebrew: brew install --cask android-commandlinetools",
      "Then set ANDROID_HOME environment variable to your SDK installation directory"
    ],
    updateAttempted: false,
    updateSuccessful: false
  });
}

async function checkAndroidDependencies(): Promise<any> {
  logger.info("Checking Android dependencies status (installation functionality removed)");

  return createJSONToolResponse({
    platform: "android",
    hasInstallation: false,
    locations: [],
    bestLocation: null,
    recommendations: [
      "Tool installation functionality has been removed",
      "Please install Android SDK manually from: https://developer.android.com/studio"
    ],
    availableTools: [],
    installationPath: null,
    installationSource: null,
    version: null,
    java: {
      installed: false,
      version: undefined,
      javaHome: undefined
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
