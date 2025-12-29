/**
 * Android Detection Service - Wrapper implementation of AndroidDetection
 * Provides Android SDK and command line tools detection capabilities
 */

import { SystemDetection } from "../system/SystemDetection";

export type AndroidToolsSource = "homebrew" | "android_home" | "android_sdk_root" | "path" | "manual" | "typical";

export interface AndroidToolsLocation {
  path: string;
  source: AndroidToolsSource;
  version?: string;
  available_tools: string[];
}

export interface AndroidToolInfo {
  name: string;
  description: string;
}

export interface AndroidDetection {
  /**
   * Get typical Android SDK installation paths for the current platform
   */
  getTypicalAndroidSdkPaths(): string[];

  /**
   * Get Homebrew installation path for Android command line tools (macOS only)
   */
  getHomebrewAndroidToolsPath(): string | null;

  /**
   * Get Android SDK path from environment variables (ANDROID_HOME or ANDROID_SDK_ROOT)
   */
  getAndroidSdkFromEnvironment(): string | null;

  /**
   * Check if a tool is available in the system PATH
   */
  isToolInPath(toolName: string): Promise<boolean>;

  /**
   * Get the full path to a tool in PATH
   */
  getToolPathFromPath(toolName: string): Promise<string | null>;

  /**
   * Get available Android command line tools in a directory
   */
  getAvailableToolsInDirectory(toolsDir: string): string[];

  /**
   * Get version information for Android command line tools at a specific location
   */
  getAndroidToolsVersion(toolsPath: string): Promise<string | undefined>;

  /**
   * Detect Android command line tools installation from Homebrew (macOS only)
   */
  detectHomebrewAndroidTools(): Promise<AndroidToolsLocation | null>;

  /**
   * Detect Android command line tools from Android SDK installation
   */
  detectAndroidSdkTools(): Promise<AndroidToolsLocation[]>;

  /**
   * Detect Android command line tools available in PATH
   */
  detectAndroidToolsInPath(): Promise<AndroidToolsLocation | null>;

  /**
   * Comprehensive detection of all Android command line tools installations
   */
  detectAndroidCommandLineTools(): Promise<AndroidToolsLocation[]>;

  /**
   * Get the best Android tools installation based on source priority and number of available tools
   */
  getBestAndroidToolsLocation(locations: AndroidToolsLocation[]): AndroidToolsLocation | null;

  /**
   * Validate that required Android tools are available at a location
   */
  validateRequiredTools(
    location: AndroidToolsLocation,
    requiredTools: string[]
  ): {
    valid: boolean;
    missing: string[];
  };

  /**
   * Clear the cached detection results
   */
  clearDetectionCache(): void;

  /**
   * Get the registry of available Android command line tools
   */
  getAndroidTools(): Record<string, AndroidToolInfo>;
}
import {
  getTypicalAndroidSdkPaths,
  getHomebrewAndroidToolsPath,
  getAndroidSdkFromEnvironment,
  isToolInPath,
  getToolPathFromPath,
  getAvailableToolsInDirectory,
  getAndroidToolsVersion,
  detectHomebrewAndroidTools,
  detectAndroidSdkTools,
  detectAndroidToolsInPath,
  detectAndroidCommandLineTools,
  getBestAndroidToolsLocation,
  validateRequiredTools,
  clearDetectionCache,
  ANDROID_TOOLS
} from "./detection";

export class AndroidDetectionService implements AndroidDetection {
  constructor(private systemDetection: SystemDetection) {}

  getTypicalAndroidSdkPaths(): string[] {
    return getTypicalAndroidSdkPaths(this.systemDetection);
  }

  getHomebrewAndroidToolsPath(): string | null {
    return getHomebrewAndroidToolsPath(this.systemDetection);
  }

  getAndroidSdkFromEnvironment(): string | null {
    return getAndroidSdkFromEnvironment(this.systemDetection);
  }

  async isToolInPath(toolName: string): Promise<boolean> {
    return isToolInPath(toolName, this.systemDetection);
  }

  async getToolPathFromPath(toolName: string): Promise<string | null> {
    return getToolPathFromPath(toolName, this.systemDetection);
  }

  getAvailableToolsInDirectory(toolsDir: string): string[] {
    return getAvailableToolsInDirectory(toolsDir, this.systemDetection);
  }

  async getAndroidToolsVersion(toolsPath: string): Promise<string | undefined> {
    return getAndroidToolsVersion(toolsPath, this.systemDetection);
  }

  async detectHomebrewAndroidTools(): Promise<AndroidToolsLocation | null> {
    return detectHomebrewAndroidTools(this.systemDetection);
  }

  async detectAndroidSdkTools(): Promise<AndroidToolsLocation[]> {
    return detectAndroidSdkTools(this.systemDetection);
  }

  async detectAndroidToolsInPath(): Promise<AndroidToolsLocation | null> {
    return detectAndroidToolsInPath(this.systemDetection);
  }

  async detectAndroidCommandLineTools(): Promise<AndroidToolsLocation[]> {
    return detectAndroidCommandLineTools(this.systemDetection);
  }

  getBestAndroidToolsLocation(locations: AndroidToolsLocation[]): AndroidToolsLocation | null {
    return getBestAndroidToolsLocation(locations);
  }

  validateRequiredTools(
    location: AndroidToolsLocation,
    requiredTools: string[]
  ): {
    valid: boolean;
    missing: string[];
  } {
    return validateRequiredTools(location, requiredTools);
  }

  clearDetectionCache(): void {
    clearDetectionCache();
  }

  getAndroidTools(): Record<string, AndroidToolInfo> {
    return ANDROID_TOOLS;
  }
}
