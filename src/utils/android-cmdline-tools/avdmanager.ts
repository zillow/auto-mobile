import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { logger } from "../logger";
import {
  detectAndroidCommandLineTools,
  getBestAndroidToolsLocation,
  validateRequiredTools,
  type AndroidToolsLocation
} from "./detection";
import { installAndroidTools } from "./install";

// Dependencies interface for dependency injection
export interface AvdManagerDependencies {
  spawn: typeof spawn;
  existsSync: typeof existsSync;
  logger: typeof logger;
  detectAndroidCommandLineTools: typeof detectAndroidCommandLineTools;
  getBestAndroidToolsLocation: typeof getBestAndroidToolsLocation;
  validateRequiredTools: typeof validateRequiredTools;
  installAndroidTools: typeof installAndroidTools;
}

// Create default dependencies
const createDefaultDependencies = (): AvdManagerDependencies => ({
  spawn,
  existsSync,
  logger,
  detectAndroidCommandLineTools,
  getBestAndroidToolsLocation,
  validateRequiredTools,
  installAndroidTools
});

/**
 * Execute a command using spawn with proper error handling and logging
 */
async function spawnCommand(command: string, args: string[], options: {
  cwd?: string;
  input?: string;
  timeout?: number;
} = {}, dependencies = createDefaultDependencies()): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolve, reject) => {
    dependencies.logger.info(`Executing: ${command} ${args.join(" ")}`);

    const child = dependencies.spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | undefined;

    // Set up timeout if specified
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Command timed out after ${options.timeout}ms: ${command} ${args.join(" ")}`));
      }, options.timeout);
    }

    child.stdout?.on("data", data => {
      const output = data.toString();
      stdout += output;
      if (output.trim()) {
        dependencies.logger.info(`[${command}] ${output.trim()}`);
      }
    });

    child.stderr?.on("data", data => {
      const output = data.toString();
      stderr += output;
      if (output.trim()) {
        dependencies.logger.warn(`[${command}] ${output.trim()}`);
      }
    });

    child.on("close", code => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ stdout, stderr, exitCode: code || 0 });
    });

    child.on("error", error => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(new Error(`Failed to spawn command: ${command} ${args.join(" ")}\nError: ${error.message}`));
    });

    // Send input if provided (for license acceptance)
    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }
  });
}

/**
 * Ensure required Android tools are available, installing if necessary
 */
async function ensureToolsAvailable(dependencies = createDefaultDependencies()): Promise<AndroidToolsLocation> {
  const locations = await dependencies.detectAndroidCommandLineTools();
  const bestLocation = dependencies.getBestAndroidToolsLocation(locations);

  if (!bestLocation) {
    dependencies.logger.info("Android command line tools not found, installing...");
    const installResult = await dependencies.installAndroidTools({
      tools: ["avdmanager", "sdkmanager"],
      force: false
    });

    if (!installResult.success) {
      throw new Error(`Failed to install required tools: ${installResult.message}`);
    }

    // Re-detect after installation
    const updatedLocations = await dependencies.detectAndroidCommandLineTools();
    const newBestLocation = dependencies.getBestAndroidToolsLocation(updatedLocations);

    if (!newBestLocation) {
      throw new Error("Tools installation completed but tools not detected");
    }

    return newBestLocation;
  }

  // Validate that required tools are available
  const validation = dependencies.validateRequiredTools(bestLocation, ["avdmanager", "sdkmanager"]);
  if (!validation.valid) {
    dependencies.logger.info(`Missing required tools: ${validation.missing.join(", ")}, installing...`);
    const installResult = await dependencies.installAndroidTools({
      tools: validation.missing,
      force: false
    });

    if (!installResult.success) {
      throw new Error(`Failed to install missing tools: ${installResult.message}`);
    }
  }

  return bestLocation;
}

/**
 * Get the avdmanager executable path
 */
function getAvdManagerPath(location: AndroidToolsLocation, dependencies = createDefaultDependencies()): string {
  const avdmanagerPath = join(location.path, "bin", "avdmanager");
  const avdmanagerBatPath = join(location.path, "bin", "avdmanager.bat");

  if (dependencies.existsSync(avdmanagerPath)) {
    return avdmanagerPath;
  } else if (dependencies.existsSync(avdmanagerBatPath)) {
    return avdmanagerBatPath;
  }

  throw new Error(`AVD manager not found at ${location.path}`);
}

/**
 * Get the sdkmanager executable path
 */
function getSdkManagerPath(location: AndroidToolsLocation, dependencies = createDefaultDependencies()): string {
  const sdkmanagerPath = join(location.path, "bin", "sdkmanager");
  const sdkmanagerBatPath = join(location.path, "bin", "sdkmanager.bat");

  if (dependencies.existsSync(sdkmanagerPath)) {
    return sdkmanagerPath;
  } else if (dependencies.existsSync(sdkmanagerBatPath)) {
    return sdkmanagerBatPath;
  }

  throw new Error(`SDK manager not found at ${location.path}`);
}

/**
 * Accept Android SDK licenses
 */
export async function acceptLicenses(dependencies = createDefaultDependencies()): Promise<{
  success: boolean;
  message: string
}> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const sdkmanagerPath = getSdkManagerPath(location, dependencies);

    dependencies.logger.info("Accepting Android SDK licenses...");

    // Provide "y" responses to all license prompts
    const licenseInput = "y\n".repeat(20);
    const result = await spawnCommand(sdkmanagerPath, ["--licenses"], {
      input: licenseInput,
      timeout: 60000 // 60 second timeout
    }, dependencies);

    if (result.exitCode === 0) {
      dependencies.logger.info("Successfully accepted Android SDK licenses");
      return { success: true, message: "Android SDK licenses accepted" };
    } else {
      return { success: false, message: `License acceptance failed: ${result.stderr}` };
    }
  } catch (error) {
    const message = `Failed to accept licenses: ${(error as Error).message}`;
    dependencies.logger.error(message);
    return { success: false, message };
  }
}

/**
 * List available system images
 */
export async function listSystemImages(filter?: SystemImageFilter, dependencies = createDefaultDependencies()): Promise<SystemImage[]> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const sdkmanagerPath = getSdkManagerPath(location, dependencies);

    const result = await spawnCommand(sdkmanagerPath, ["--list"], {}, dependencies);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list system images: ${result.stderr}`);
    }

    return parseSystemImages(result.stdout, filter);
  } catch (error) {
    dependencies.logger.error(`Failed to list system images: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Download and install a system image
 */
export async function installSystemImage(packageName: string, acceptLicense = true, dependencies = createDefaultDependencies()): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const sdkmanagerPath = getSdkManagerPath(location, dependencies);

    dependencies.logger.info(`Installing system image: ${packageName}`);

    // Accept license and install
    const input = acceptLicense ? "y\n".repeat(10) : undefined;
    const result = await spawnCommand(sdkmanagerPath, [packageName], {
      input,
      timeout: 600000 // 10 minute timeout for downloads
    }, dependencies);

    if (result.exitCode === 0) {
      dependencies.logger.info(`Successfully installed system image: ${packageName}`);
      return { success: true, message: `System image ${packageName} installed successfully` };
    } else {
      return { success: false, message: `Installation failed: ${result.stderr}` };
    }
  } catch (error) {
    const message = `Failed to install system image ${packageName}: ${(error as Error).message}`;
    dependencies.logger.error(message);
    return { success: false, message };
  }
}

/**
 * List available AVDs
 */
export async function listDeviceImages(dependencies = createDefaultDependencies()): Promise<AvdInfo[]> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const avdmanagerPath = getAvdManagerPath(location, dependencies);

    const result = await spawnCommand(avdmanagerPath, ["list", "avd"], {}, dependencies);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list AVDs: ${result.stderr}`);
    }

    return parseAvdList(result.stdout);
  } catch (error) {
    dependencies.logger.error(`Failed to list AVDs: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Create a new AVD
 */
export async function createAvd(params: CreateAvdParams, dependencies = createDefaultDependencies()): Promise<{
  success: boolean;
  message: string;
  avdName?: string;
}> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const avdmanagerPath = getAvdManagerPath(location, dependencies);

    const {
      name,
      package: packageName,
      device,
      force = false,
      path: avdPath,
      tag,
      abi
    } = params;

    dependencies.logger.info(`Creating AVD: ${name} with package ${packageName}`);

    const args = ["create", "avd", "-n", name, "-k", packageName];

    if (device) {
      args.push("-d", device);
    }

    if (force) {
      args.push("--force");
    }

    if (avdPath) {
      args.push("-p", avdPath);
    }

    if (tag) {
      args.push("-t", tag);
    }

    if (abi) {
      args.push("--abi", abi);
    }

    const result = await spawnCommand(avdmanagerPath, args, {
      input: "\n", // Default response to any prompts
      timeout: 300000 // 5 minute timeout
    }, dependencies);

    if (result.exitCode === 0) {
      dependencies.logger.info(`Successfully created AVD: ${name}`);
      return {
        success: true,
        message: `AVD ${name} created successfully`,
        avdName: name
      };
    } else {
      return {
        success: false,
        message: `AVD creation failed: ${result.stderr}`
      };
    }
  } catch (error) {
    const message = `Failed to create AVD ${params.name}: ${(error as Error).message}`;
    dependencies.logger.error(message);
    return { success: false, message };
  }
}

/**
 * Delete an AVD
 */
export async function deleteAvd(name: string, dependencies = createDefaultDependencies()): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const avdmanagerPath = getAvdManagerPath(location, dependencies);

    dependencies.logger.info(`Deleting AVD: ${name}`);

    const result = await spawnCommand(avdmanagerPath, ["delete", "avd", "-n", name], {}, dependencies);

    if (result.exitCode === 0) {
      dependencies.logger.info(`Successfully deleted AVD: ${name}`);
      return { success: true, message: `AVD ${name} deleted successfully` };
    } else {
      return { success: false, message: `AVD deletion failed: ${result.stderr}` };
    }
  } catch (error) {
    const message = `Failed to delete AVD ${name}: ${(error as Error).message}`;
    dependencies.logger.error(message);
    return { success: false, message };
  }
}

/**
 * List available device profiles
 */
export async function listDevices(dependencies = createDefaultDependencies()): Promise<DeviceProfile[]> {
  try {
    const location = await ensureToolsAvailable(dependencies);
    const avdmanagerPath = getAvdManagerPath(location, dependencies);

    const result = await spawnCommand(avdmanagerPath, ["list", "device"], {}, dependencies);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to list devices: ${result.stderr}`);
    }

    return parseDeviceList(result.stdout);
  } catch (error) {
    dependencies.logger.error(`Failed to list devices: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Parse system images from sdkmanager output
 */
function parseSystemImages(output: string, filter?: SystemImageFilter): SystemImage[] {
  const lines = output.split("\n");
  const images: SystemImage[] = [];
  let inSystemImagesSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.includes("Available Packages:")) {
      inSystemImagesSection = true;
      continue;
    }

    if (trimmedLine.includes("Installed packages:")) {
      inSystemImagesSection = false;
      continue;
    }

    if (inSystemImagesSection && trimmedLine.startsWith("system-images;")) {
      const parts = trimmedLine.split(/\s+/);
      const packageName = parts[0];
      const versionInfo = parts.slice(1).join(" ");

      // Parse package name: system-images;android-XX;tag;abi
      const packageParts = packageName.split(";");
      if (packageParts.length >= 4) {
        const apiLevel = parseInt(packageParts[1].replace("android-", ""), 10);
        const tag = packageParts[2];
        const abi = packageParts[3];

        const image: SystemImage = {
          packageName,
          apiLevel,
          tag,
          abi,
          versionInfo: versionInfo || ""
        };

        // Apply filter if provided
        if (!filter || matchesFilter(image, filter)) {
          images.push(image);
        }
      }
    }
  }

  return images;
}

/**
 * Check if system image matches filter criteria
 */
function matchesFilter(image: SystemImage, filter: SystemImageFilter): boolean {
  if (filter.apiLevel && image.apiLevel !== filter.apiLevel) {
    return false;
  }
  if (filter.tag && image.tag !== filter.tag) {
    return false;
  }
  if (filter.abi && image.abi !== filter.abi) {
    return false;
  }
  return true;
}

/**
 * Parse AVD list from avdmanager output
 */
function parseAvdList(output: string): AvdInfo[] {
  const avds: AvdInfo[] = [];
  const lines = output.split("\n");

  let currentAvd: Partial<AvdInfo> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("Name:")) {
      // Start of new AVD entry
      if (currentAvd.name) {
        avds.push(currentAvd as AvdInfo);
      }
      currentAvd = { name: trimmedLine.substring(5).trim() };
    } else if (trimmedLine.startsWith("Path:")) {
      currentAvd.path = trimmedLine.substring(5).trim();
    } else if (trimmedLine.startsWith("Target:")) {
      currentAvd.target = trimmedLine.substring(7).trim();
    } else if (trimmedLine.startsWith("Based on:")) {
      currentAvd.basedOn = trimmedLine.substring(9).trim();
    } else if (trimmedLine.startsWith("Error:")) {
      currentAvd.error = trimmedLine.substring(6).trim();
    }
  }

  // Add the last AVD if exists
  if (currentAvd.name) {
    avds.push(currentAvd as AvdInfo);
  }

  return avds;
}

/**
 * Parse device profiles from avdmanager output
 */
function parseDeviceList(output: string): DeviceProfile[] {
  const devices: DeviceProfile[] = [];
  const lines = output.split("\n");

  let currentDevice: Partial<DeviceProfile> = {};

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("id:")) {
      // Start of new device entry
      if (currentDevice.id) {
        devices.push(currentDevice as DeviceProfile);
      }
      currentDevice = { id: trimmedLine.substring(3).trim() };
    } else if (trimmedLine.startsWith("Name:")) {
      currentDevice.name = trimmedLine.substring(5).trim();
    } else if (trimmedLine.startsWith("OEM:")) {
      currentDevice.oem = trimmedLine.substring(4).trim();
    }
  }

  // Add the last device if exists
  if (currentDevice.id) {
    devices.push(currentDevice as DeviceProfile);
  }

  return devices;
}

// Type definitions

export interface SystemImageFilter {
  apiLevel?: number;
  tag?: string;
  abi?: string;
}

export interface SystemImage {
  packageName: string;
  apiLevel: number;
  tag: string;
  abi: string;
  versionInfo: string;
}

export interface CreateAvdParams {
  name: string;
  package: string;
  device?: string;
  force?: boolean;
  path?: string;
  tag?: string;
  abi?: string;
}

export interface AvdInfo {
  name: string;
  path?: string;
  target?: string;
  basedOn?: string;
  error?: string;
}

export interface DeviceProfile {
  id: string;
  name?: string;
  oem?: string;
}

// Common system image packages for convenience
export const COMMON_SYSTEM_IMAGES = {
  API_35: {
    GOOGLE_APIS_ARM64: "system-images;android-35;google_apis;arm64-v8a",
    GOOGLE_APIS_X86_64: "system-images;android-35;google_apis;x86_64",
    PLAYSTORE_ARM64: "system-images;android-35;google_apis_playstore;arm64-v8a",
    PLAYSTORE_X86_64: "system-images;android-35;google_apis_playstore;x86_64"
  },
  API_34: {
    GOOGLE_APIS_ARM64: "system-images;android-34;google_apis;arm64-v8a",
    GOOGLE_APIS_X86_64: "system-images;android-34;google_apis;x86_64",
    PLAYSTORE_ARM64: "system-images;android-34;google_apis_playstore;arm64-v8a",
    PLAYSTORE_X86_64: "system-images;android-34;google_apis_playstore;x86_64"
  },
  API_33: {
    GOOGLE_APIS_ARM64: "system-images;android-33;google_apis;arm64-v8a",
    GOOGLE_APIS_X86_64: "system-images;android-33;google_apis;x86_64",
    PLAYSTORE_ARM64: "system-images;android-33;google_apis_playstore;arm64-v8a",
    PLAYSTORE_X86_64: "system-images;android-33;google_apis_playstore;x86_64"
  }
} as const;

// Common device profiles
export const COMMON_DEVICES = {
  PIXEL_4: "pixel_4",
  PIXEL_6: "pixel_6",
  PIXEL_7: "pixel_7",
  NEXUS_5X: "Nexus 5X",
  MEDIUM_PHONE: "Medium Phone",
  SMALL_PHONE: "Small Phone"
} as const;
