import { join, dirname } from "path";
import { logger } from "../logger";
import { SystemDetection, DefaultSystemDetection } from "../system/SystemDetection";

export type AndroidToolsSource = "homebrew" | "android_home" | "android_sdk_root" | "path" | "manual" | "typical";

export interface AndroidToolsLocation {
  path: string;
  source: AndroidToolsSource;
  version?: string;
  available_tools: string[];
}

interface AndroidToolInfo {
  name: string;
  description: string;
}

interface AndroidHomeWithSystemImages {
  androidHome: string;
  systemImagesPath: string;
}

// Create default system detection instance
const createDefaultSystemDetection = (): SystemDetection => {
  return new DefaultSystemDetection();
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function getCmdlineToolsRoot(toolsPath: string): string {
  const normalized = normalizePath(toolsPath);
  if (normalized.endsWith("/cmdline-tools/latest")) {
    return normalized.replace(/\/cmdline-tools\/latest$/, "");
  }
  if (normalized.endsWith("/cmdline-tools")) {
    return normalized.replace(/\/cmdline-tools$/, "");
  }
  return normalized;
}

export function isHomebrewToolsPath(toolsPath: string): boolean {
  const normalized = normalizePath(toolsPath).toLowerCase();
  return normalized.includes("/homebrew/") || normalized.includes("/share/android-commandlinetools/");
}

export function getAndroidHomeWithSystemImages(
  systemDetection = createDefaultSystemDetection()
): AndroidHomeWithSystemImages | null {
  const androidHome = getAndroidSdkFromEnvironment(systemDetection);
  if (!androidHome) {
    return null;
  }

  const systemImagesPath = join(androidHome, "system-images");
  if (!systemDetection.fileExistsSync(systemImagesPath)) {
    return null;
  }

  return {
    androidHome,
    systemImagesPath
  };
}

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
export function getTypicalAndroidSdkPaths(systemDetection = createDefaultSystemDetection()): string[] {
  const platformName = systemDetection.getCurrentPlatform();
  const home = systemDetection.getHomeDir();

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
export function getHomebrewAndroidToolsPath(systemDetection = createDefaultSystemDetection()): string | null {
  if (systemDetection.getCurrentPlatform() !== "darwin") {
    return null;
  }

  const homebrewPaths = [
    "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest",
    "/usr/local/share/android-commandlinetools/cmdline-tools/latest"
  ];

  for (const homebrewPath of homebrewPaths) {
    if (systemDetection.fileExistsSync(homebrewPath)) {
      return homebrewPath;
    }
  }

  return null;
}

/**
 * Get Android SDK path from environment variables
 */
export function getAndroidSdkFromEnvironment(systemDetection = createDefaultSystemDetection()): string | null {
  // Check ANDROID_HOME first, then ANDROID_SDK_ROOT
  const androidHome = systemDetection.getEnvVar("ANDROID_HOME");
  if (androidHome && systemDetection.fileExistsSync(androidHome)) {
    return androidHome;
  }

  const androidSdkRoot = systemDetection.getEnvVar("ANDROID_SDK_ROOT");
  if (androidSdkRoot && systemDetection.fileExistsSync(androidSdkRoot)) {
    return androidSdkRoot;
  }

  return null;
}

/**
 * Check if a tool is available in the system PATH
 */
export async function isToolInPath(toolName: string, systemDetection = createDefaultSystemDetection()): Promise<boolean> {
  try {
    const command = systemDetection.getCurrentPlatform() === "win32" ? "where" : "which";
    await systemDetection.exec(`${command} ${toolName}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full path to a tool in PATH
 */
export async function getToolPathFromPath(toolName: string, systemDetection = createDefaultSystemDetection()): Promise<string | null> {
  try {
    const command = systemDetection.getCurrentPlatform() === "win32" ? "where" : "which";
    const result = await systemDetection.exec(`${command} ${toolName}`);
    const path = result.stdout.trim().split("\n")[0]; // Take first result if multiple
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Check if a directory contains Android command line tools
 */
export function getAvailableToolsInDirectory(toolsDir: string, systemDetection = createDefaultSystemDetection()): string[] {
  if (!systemDetection.fileExistsSync(toolsDir)) {
    return [];
  }

  const availableTools: string[] = [];
  const binDir = join(toolsDir, "bin");

  // Check if bin directory exists
  if (!systemDetection.fileExistsSync(binDir)) {
    return [];
  }

  // Check each tool
  for (const toolName of Object.keys(ANDROID_TOOLS)) {
    const toolPath = join(binDir, toolName);
    const toolPathWithExt = join(binDir, `${toolName}.bat`); // Windows

    if (systemDetection.fileExistsSync(toolPath) || systemDetection.fileExistsSync(toolPathWithExt)) {
      availableTools.push(toolName);
    }
  }

  return availableTools;
}

/**
 * Get version information for Android command line tools at a specific location
 */
async function getAndroidToolsVersion(toolsPath: string, systemDetection = createDefaultSystemDetection()): Promise<string | undefined> {
  try {
    // Try to get version from various tools
    const binDir = join(toolsPath, "bin");

    // Try sdkmanager first
    const sdkmanagerPath = join(binDir, "sdkmanager");
    const sdkmanagerBatPath = join(binDir, "sdkmanager.bat");

    let command: string;
    if (systemDetection.fileExistsSync(sdkmanagerPath)) {
      command = `${sdkmanagerPath} --version`;
    } else if (systemDetection.fileExistsSync(sdkmanagerBatPath)) {
      command = `${sdkmanagerBatPath} --version`;
    } else {
      return undefined;
    }

    const result = await systemDetection.exec(command);
    return result.stdout.trim() || result.stderr.trim() || undefined;
  } catch (error) {
    logger.warn(`Failed to get Android tools version at ${toolsPath}: ${(error as Error).message}`);
    return undefined;
  }
}

/**
 * Detect Android command line tools installation from Homebrew (macOS only)
 */
export async function detectHomebrewAndroidTools(systemDetection = createDefaultSystemDetection()): Promise<AndroidToolsLocation | null> {
  const homebrewPath = getHomebrewAndroidToolsPath(systemDetection);
  if (!homebrewPath) {
    return null;
  }

  const availableTools = getAvailableToolsInDirectory(homebrewPath, systemDetection);
  if (availableTools.length === 0) {
    return null;
  }

  const version = await getAndroidToolsVersion(homebrewPath, systemDetection);

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
export async function detectAndroidSdkTools(systemDetection = createDefaultSystemDetection()): Promise<AndroidToolsLocation[]> {
  const locations: AndroidToolsLocation[] = [];
  logger.info("Looking for for Android SDK tools");

  // Check environment variables
  const sdkPath = getAndroidSdkFromEnvironment(systemDetection);
  if (sdkPath) {
    const cmdlineToolsPath = join(sdkPath, "cmdline-tools", "latest");
    const availableTools = getAvailableToolsInDirectory(cmdlineToolsPath, systemDetection);

    if (availableTools.length > 0) {
      const version = await getAndroidToolsVersion(cmdlineToolsPath, systemDetection);
      const source = systemDetection.getEnvVar("ANDROID_HOME") ? "android_home" : "android_sdk_root";

      locations.push({
        path: cmdlineToolsPath,
        source,
        version,
        available_tools: availableTools
      });
    }
  }

  // Check typical installation paths
  const typicalPaths = getTypicalAndroidSdkPaths(systemDetection);
  for (const sdkPath of typicalPaths) {
    logger.info(`Checking typical path for Android SDK: ${sdkPath}`);
    // Skip if we already found this path from environment
    const androidHome = systemDetection.getEnvVar("ANDROID_HOME");
    const androidSdkRoot = systemDetection.getEnvVar("ANDROID_SDK_ROOT");
    if (androidHome === sdkPath || androidSdkRoot === sdkPath) {
      continue;
    }

    const cmdlineToolsPath = join(sdkPath, "cmdline-tools", "latest");
    const availableTools = getAvailableToolsInDirectory(cmdlineToolsPath, systemDetection);

    if (availableTools.length > 0) {
      const version = await getAndroidToolsVersion(cmdlineToolsPath, systemDetection);

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
async function detectAndroidToolsInPath(systemDetection = createDefaultSystemDetection()): Promise<AndroidToolsLocation | null> {
  const availableTools: string[] = [];
  const toolPaths: Record<string, string> = {};
  logger.info("Looking for for Android SDK tools in PATH");

  // Check each tool individually
  for (const toolName of Object.keys(ANDROID_TOOLS)) {
    if (await isToolInPath(toolName, systemDetection)) {
      const toolPath = await getToolPathFromPath(toolName, systemDetection);
      if (toolPath) {
        logger.info(`Tool ${toolName} was in PATH`);
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
export async function detectAndroidCommandLineTools(systemDetection = createDefaultSystemDetection()): Promise<AndroidToolsLocation[]> {
  if (cachedAndroidToolsLocations !== undefined) {
    logger.info("Already cached Android tools locations. Returning cached result.");
    return cachedAndroidToolsLocations;
  }

  const locations: AndroidToolsLocation[] = [];

  logger.info("Starting Android command line tools detection...");

  // 1. Check Homebrew installation (macOS only)
  try {
    const homebrewLocation = await detectHomebrewAndroidTools(systemDetection);
    if (homebrewLocation) {
      locations.push(homebrewLocation);
      logger.info(`Found Homebrew Android tools at: ${homebrewLocation.path}`);
    }
  } catch (error) {
    logger.warn(`Error detecting Homebrew Android tools: ${(error as Error).message}`);
  }

  // 2. Check Android SDK installations
  try {
    const sdkLocations = await detectAndroidSdkTools(systemDetection);
    locations.push(...sdkLocations);
    for (const location of sdkLocations) {
      logger.info(`Found Android SDK tools at: ${location.path} (source: ${location.source})`);
    }
  } catch (error) {
    logger.warn(`Error detecting Android SDK tools: ${(error as Error).message}`);
  }

  // 3. Check PATH
  try {
    const pathLocation = await detectAndroidToolsInPath(systemDetection);
    if (pathLocation) {
      locations.push(pathLocation);
      logger.info(`Found Android tools in PATH: ${pathLocation.available_tools.join(", ")}`);
    }
  } catch (error) {
    logger.warn(`Error detecting Android tools in PATH: ${(error as Error).message}`);
  }

  // Remove duplicates based on path
  const uniqueLocations = locations.filter((location, index, self) =>
    index === self.findIndex(l => l.path === location.path)
  );

  logger.info(`Detection complete. Found ${uniqueLocations.length} unique Android tools installations.`);

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

  // Priority order: android_home > android_sdk_root > typical > homebrew > path > manual
  const sourcePriority: Record<AndroidToolsSource, number> = {
    android_home: 1,
    android_sdk_root: 2,
    typical: 3,
    homebrew: 4,
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
