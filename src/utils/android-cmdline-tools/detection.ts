import { existsSync } from "fs";
import { join, dirname } from "path";
import { homedir, platform } from "os";
import { logger } from "../logger";
import { exec } from "child_process";
import { promisify } from "util";

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

// Dependencies interface for dependency injection
export interface DetectionDependencies {
  exec: typeof exec;
  existsSync: typeof existsSync;
  platform: typeof platform;
  homedir: typeof homedir;
  logger: typeof logger;
}

// Create default dependencies
const createDefaultDependencies = (): DetectionDependencies => ({
  exec,
  existsSync,
  platform,
  homedir,
  logger
});

/**
 * Create async version of exec with dependency injection
 */
const createExecAsync = (dependencies: DetectionDependencies) => {
  return promisify(dependencies.exec);
};

/**
 * In-memory cache for detection results
 */
let cachedAndroidToolsLocations: AndroidToolsLocation[] | undefined = undefined;

/**
 * Clear cached detection results
 */
export function clearDetectionCache(): void {
  cachedAndroidToolsLocations = undefined;
}

/**
 * Registry of available Android command line tools
 */
export const ANDROID_TOOLS: Record<string, AndroidToolInfo> = {
  apkanalyzer: {
    name: "apkanalyzer",
    description: "APK analysis and inspection"
  },
  avdmanager: {
    name: "avdmanager",
    description: "Android Virtual Device management"
  },
  sdkmanager: {
    name: "sdkmanager",
    description: "SDK package management"
  },
  lint: {
    name: "lint",
    description: "Static code analysis"
  },
  screenshot2: {
    name: "screenshot2",
    description: "Device screenshot capture"
  },
  d8: {
    name: "d8",
    description: "DEX compiler"
  },
  r8: {
    name: "r8",
    description: "Code shrinking and obfuscation"
  },
  resourceshrinker: {
    name: "resourceshrinker",
    description: "Resource optimization"
  },
  retrace: {
    name: "retrace",
    description: "Stack trace de-obfuscation"
  },
  profgen: {
    name: "profgen",
    description: "ART profile generation"
  }
};

/**
 * Get typical Android SDK installation paths for each platform
 */
export function getTypicalAndroidSdkPaths(dependencies = createDefaultDependencies()): string[] {
  const platformName = dependencies.platform();
  const home = dependencies.homedir();

  switch (platformName) {
    case "darwin": // macOS
      return [
        join(home, "Library/Android/sdk"),
        "/opt/android-sdk",
        "/usr/local/android-sdk"
      ];
    case "linux":
      return [
        join(home, "Android/Sdk"),
        "/opt/android-sdk",
        "/usr/local/android-sdk"
      ];
    case "win32": // Windows
      return [
        join(home, "AppData/Local/Android/Sdk"),
        "C:/Android/Sdk",
        "C:/android-sdk"
      ];
    default:
      return [];
  }
}

/**
 * Get Homebrew installation path for Android command line tools (macOS only)
 */
export function getHomebrewAndroidToolsPath(dependencies = createDefaultDependencies()): string | null {
  if (dependencies.platform() !== "darwin") {
    return null;
  }

  const homebrewPath = "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest";
  return dependencies.existsSync(homebrewPath) ? homebrewPath : null;
}

/**
 * Get Android SDK path from environment variables
 */
export function getAndroidSdkFromEnvironment(dependencies = createDefaultDependencies()): string | null {
  // Check ANDROID_HOME first, then ANDROID_SDK_ROOT
  const androidHome = process.env.ANDROID_HOME;
  if (androidHome && dependencies.existsSync(androidHome)) {
    return androidHome;
  }

  const androidSdkRoot = process.env.ANDROID_SDK_ROOT;
  if (androidSdkRoot && dependencies.existsSync(androidSdkRoot)) {
    return androidSdkRoot;
  }

  return null;
}

/**
 * Check if a tool is available in the system PATH
 */
export async function isToolInPath(toolName: string, dependencies = createDefaultDependencies()): Promise<boolean> {
  try {
    const execAsync = createExecAsync(dependencies);
    const command = dependencies.platform() === "win32" ? "where" : "which";
    await execAsync(`${command} ${toolName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full path to a tool in PATH
 */
export async function getToolPathFromPath(toolName: string, dependencies = createDefaultDependencies()): Promise<string | null> {
  try {
    const execAsync = createExecAsync(dependencies);
    const command = dependencies.platform() === "win32" ? "where" : "which";
    const result = await execAsync(`${command} ${toolName}`);
    const path = result.stdout.trim().split("\n")[0]; // Take first result if multiple
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Check if a directory contains Android command line tools
 */
export function getAvailableToolsInDirectory(toolsDir: string, dependencies = createDefaultDependencies()): string[] {
  if (!dependencies.existsSync(toolsDir)) {
    return [];
  }

  const availableTools: string[] = [];
  const binDir = join(toolsDir, "bin");

  // Check if bin directory exists
  if (!dependencies.existsSync(binDir)) {
    return [];
  }

  // Check each tool
  for (const toolName of Object.keys(ANDROID_TOOLS)) {
    const toolPath = join(binDir, toolName);
    const toolPathWithExt = join(binDir, `${toolName}.bat`); // Windows

    if (dependencies.existsSync(toolPath) || dependencies.existsSync(toolPathWithExt)) {
      availableTools.push(toolName);
    }
  }

  return availableTools;
}

/**
 * Get version information for Android command line tools at a specific location
 */
export async function getAndroidToolsVersion(toolsPath: string, dependencies = createDefaultDependencies()): Promise<string | undefined> {
  try {
    // Try to get version from various tools
    const binDir = join(toolsPath, "bin");

    // Try sdkmanager first
    const sdkmanagerPath = join(binDir, "sdkmanager");
    const sdkmanagerBatPath = join(binDir, "sdkmanager.bat");

    let command: string;
    if (dependencies.existsSync(sdkmanagerPath)) {
      command = `${sdkmanagerPath} --version`;
    } else if (dependencies.existsSync(sdkmanagerBatPath)) {
      command = `${sdkmanagerBatPath} --version`;
    } else {
      return undefined;
    }

    const execAsync = createExecAsync(dependencies);
    const result = await execAsync(command);
    return result.stdout.trim() || result.stderr.trim() || undefined;
  } catch (error) {
    dependencies.logger.warn(`Failed to get Android tools version at ${toolsPath}: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Detect Android command line tools installation from Homebrew (macOS only)
 */
export async function detectHomebrewAndroidTools(dependencies = createDefaultDependencies()): Promise<AndroidToolsLocation | null> {
  const homebrewPath = getHomebrewAndroidToolsPath(dependencies);
  if (!homebrewPath) {
    return null;
  }

  const availableTools = getAvailableToolsInDirectory(homebrewPath, dependencies);
  if (availableTools.length === 0) {
    return null;
  }

  const version = await getAndroidToolsVersion(homebrewPath, dependencies);

  return {
    path: homebrewPath,
    source: "homebrew",
    version,
    available_tools: availableTools
  };
}

/**
 * Detect Android command line tools from Android SDK installation
 */
export async function detectAndroidSdkTools(dependencies = createDefaultDependencies()): Promise<AndroidToolsLocation[]> {
  const locations: AndroidToolsLocation[] = [];

  // Check environment variables
  const sdkPath = getAndroidSdkFromEnvironment(dependencies);
  if (sdkPath) {
    const cmdlineToolsPath = join(sdkPath, "cmdline-tools", "latest");
    const availableTools = getAvailableToolsInDirectory(cmdlineToolsPath, dependencies);

    if (availableTools.length > 0) {
      const version = await getAndroidToolsVersion(cmdlineToolsPath, dependencies);
      const source = process.env.ANDROID_HOME ? "android_home" : "android_sdk_root";

      locations.push({
        path: cmdlineToolsPath,
        source,
        version,
        available_tools: availableTools
      });
    }
  }

  // Check typical installation paths
  const typicalPaths = getTypicalAndroidSdkPaths(dependencies);
  for (const sdkPath of typicalPaths) {
    // Skip if we already found this path from environment
    if (process.env.ANDROID_HOME === sdkPath || process.env.ANDROID_SDK_ROOT === sdkPath) {
      continue;
    }

    const cmdlineToolsPath = join(sdkPath, "cmdline-tools", "latest");
    const availableTools = getAvailableToolsInDirectory(cmdlineToolsPath, dependencies);

    if (availableTools.length > 0) {
      const version = await getAndroidToolsVersion(cmdlineToolsPath, dependencies);

      locations.push({
        path: cmdlineToolsPath,
        source: "typical",
        version,
        available_tools: availableTools
      });
    }
  }

  return locations;
}

/**
 * Detect Android command line tools available in PATH
 */
export async function detectAndroidToolsInPath(dependencies = createDefaultDependencies()): Promise<AndroidToolsLocation | null> {
  const availableTools: string[] = [];
  const toolPaths: Record<string, string> = {};

  // Check each tool individually
  for (const toolName of Object.keys(ANDROID_TOOLS)) {
    if (await isToolInPath(toolName, dependencies)) {
      const toolPath = await getToolPathFromPath(toolName, dependencies);
      if (toolPath) {
        availableTools.push(toolName);
        toolPaths[toolName] = toolPath;
      }
    }
  }

  if (availableTools.length === 0) {
    return null;
  }

  // Try to determine a common path (directory containing most tools)
  const directories = Object.values(toolPaths).map(p => dirname(p));
  const directoryCount = directories.reduce((acc, dir) => {
    acc[dir] = (acc[dir] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostCommonDir = Object.entries(directoryCount)
    .sort(([, a], [, b]) => b - a)[0]?.[0];

  const basePath = mostCommonDir ? dirname(mostCommonDir) : "";

  return {
    path: basePath,
    source: "path",
    version: undefined, // Cannot determine version reliably from PATH
    available_tools: availableTools
  };
}

/**
 * Comprehensive detection of all Android command line tools installations
 */
export async function detectAndroidCommandLineTools(dependencies = createDefaultDependencies()): Promise<AndroidToolsLocation[]> {
  if (cachedAndroidToolsLocations !== undefined) {
    return cachedAndroidToolsLocations;
  }

  const locations: AndroidToolsLocation[] = [];

  dependencies.logger.info("Starting Android command line tools detection...");

  // 1. Check Homebrew installation (macOS only)
  try {
    const homebrewLocation = await detectHomebrewAndroidTools(dependencies);
    if (homebrewLocation) {
      locations.push(homebrewLocation);
      dependencies.logger.info(`Found Homebrew Android tools at: ${homebrewLocation.path}`);
    }
  } catch (error) {
    dependencies.logger.warn(`Error detecting Homebrew Android tools: ${(error as Error).message}`);
  }

  // 2. Check Android SDK installations
  try {
    const sdkLocations = await detectAndroidSdkTools(dependencies);
    locations.push(...sdkLocations);
    for (const location of sdkLocations) {
      dependencies.logger.info(`Found Android SDK tools at: ${location.path} (source: ${location.source})`);
    }
  } catch (error) {
    dependencies.logger.warn(`Error detecting Android SDK tools: ${(error as Error).message}`);
  }

  // 3. Check PATH
  try {
    const pathLocation = await detectAndroidToolsInPath(dependencies);
    if (pathLocation) {
      locations.push(pathLocation);
      dependencies.logger.info(`Found Android tools in PATH: ${pathLocation.available_tools.join(", ")}`);
    }
  } catch (error) {
    dependencies.logger.warn(`Error detecting Android tools in PATH: ${(error as Error).message}`);
  }

  // Remove duplicates based on path
  const uniqueLocations = locations.filter((location, index, self) =>
    index === self.findIndex(l => l.path === location.path)
  );

  dependencies.logger.info(`Detection complete. Found ${uniqueLocations.length} unique Android tools installations.`);

  cachedAndroidToolsLocations = uniqueLocations;
  return uniqueLocations;
}

/**
 * Get the best Android tools installation based on source priority and number of available tools
 */
export function getBestAndroidToolsLocation(locations: AndroidToolsLocation[]): AndroidToolsLocation | null {
  if (locations.length === 0) {
    return null;
  }

  // Priority order: homebrew > android_home > android_sdk_root > typical > path > manual
  const sourcePriority: Record<AndroidToolsSource, number> = {
    homebrew: 1,
    android_home: 2,
    android_sdk_root: 3,
    typical: 4,
    path: 5,
    manual: 6
  };

  // Score each location based on source priority and number of available tools
  const scored = locations.map(location => {
    const sourcePriorityScore = sourcePriority[location.source] || 10;
    const totalTools = location.available_tools.length;

    // Lower score is better (higher priority)
    const score = sourcePriorityScore * 100 - totalTools;

    return { location, score };
  });

  // Sort by score (ascending - lower is better)
  scored.sort((a, b) => a.score - b.score);

  return scored[0]?.location || null;
}

/**
 * Validate that required Android tools are available at a location
 */
export function validateRequiredTools(location: AndroidToolsLocation, requiredTools: string[]): {
  valid: boolean;
  missing: string[];
} {
  const missing = requiredTools.filter(tool => !location.available_tools.includes(tool));

  return {
    valid: missing.length === 0,
    missing
  };
}
