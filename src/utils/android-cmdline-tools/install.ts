import { exec, spawn } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { readFile } from "fs/promises";
import { logger } from "../logger";
import {
  detectAndroidCommandLineTools,
  getBestAndroidToolsLocation,
  validateRequiredTools,
  type AndroidToolsLocation,
  type AndroidToolsSource
} from "./detection";
import { CryptoUtils } from "../crypto";

const execAsync = promisify(exec);

/**
 * Execute a command using spawn with proper error handling and logging
 */
async function spawnCommand(command: string, args: string[], options: { cwd?: string; input?: string } = {}): Promise<{
  stdout: string;
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    logger.info(`Executing: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", data => {
      const output = data.toString();
      stdout += output;
      // Log substantial output for visibility
      if (output.trim()) {
        logger.info(`[${command}] ${output.trim()}`);
      }
    });

    child.stderr?.on("data", data => {
      const output = data.toString();
      stderr += output;
      // Log errors but don't treat all stderr as errors (some tools use stderr for info)
      if (output.trim()) {
        logger.warn(`[${command}] ${output.trim()}`);
      }
    });

    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}\nstderr: ${stderr}`));
      }
    });

    child.on("error", error => {
      reject(new Error(`Failed to spawn command: ${command} ${args.join(" ")}\nError: ${error.message}`));
    });

    // Send input if provided (for interactive commands)
    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }
  });
}

/**
 * Check if Homebrew is available (macOS only)
 */
export async function isHomebrewAvailable(): Promise<boolean> {
  if (platform() !== "darwin") {
    return false;
  }

  try {
    await execAsync("brew --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Install Android command line tools via Homebrew
 */
export async function installViaHomebrew(): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("Installing Android command line tools via Homebrew...");

    // Check if already installed (keep using exec for quick checks)
    try {
      const result = await execAsync("brew list --cask android-commandlinetools");
      if (result.stdout.includes("android-commandlinetools")) {
        return { success: true, message: "Android command line tools already installed via Homebrew" };
      }
    } catch {
      // Not installed, proceed with installation
    }

    // Use spawn for the actual installation
    await spawnCommand("brew", ["install", "--cask", "android-commandlinetools"]);
    logger.info("Successfully installed Android command line tools via Homebrew");

    return { success: true, message: "Successfully installed Android command line tools via Homebrew" };
  } catch (error) {
    const errorMessage = `Failed to install via Homebrew: ${(error as Error).message}`;
    logger.error(errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Download file with progress logging
 */
export async function downloadFile(url: string, outputPath: string): Promise<void> {
  const https = await import("https");

  return new Promise((resolve, reject) => {
    const file = createWriteStream(outputPath);

    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloaded = 0;

      response.on("data", chunk => {
        downloaded += chunk.length;
        if (totalSize > 0) {
          const percent = Math.round((downloaded / totalSize) * 100);
          if (downloaded % (1024 * 1024) === 0) { // Log every MB
            logger.info(`Download progress: ${percent}% (${Math.round(downloaded / 1024 / 1024)}MB)`);
          }
        }
      });

      response.pipe(file);

      response.on("end", () => {
        file.end();
        resolve();
      });

      response.on("error", reject);
      file.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Verify file checksum
 */
export async function verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
  try {
    const fileBuffer = await readFile(filePath);
    return CryptoUtils.verifyChecksum(fileBuffer, expectedChecksum);
  } catch (error) {
    logger.error(`Failed to verify checksum: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Extract zip file
 */
export async function extractZip(zipPath: string, extractPath: string): Promise<void> {
  const platformName = platform();

  try {
    // Ensure extract directory exists
    mkdirSync(extractPath, { recursive: true });

    if (platformName === "win32") {
      // Use PowerShell on Windows
      await spawnCommand("powershell", [
        "-command",
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force`
      ]);
    } else {
      // Use unzip on Unix-like systems
      await spawnCommand("unzip", ["-q", "-o", zipPath, "-d", extractPath]);
    }

    logger.info(`Successfully extracted ${zipPath} to ${extractPath}`);
  } catch (error) {
    throw new Error(`Failed to extract zip file: ${(error as Error).message}`);
  }
}

/**
 * Get default installation path for manual installation
 */
export function getDefaultInstallPath(): string {
  const home = homedir();
  const platformName = platform();

  switch (platformName) {
    case "darwin":
      return join(home, "Library/Android/sdk");
    case "linux":
      return join(home, "Android/Sdk");
    case "win32":
      return join(home, "AppData/Local/Android/Sdk");
    default:
      return join(home, "android-sdk");
  }
}

/**
 * Install Android command line tools manually
 */
export async function installManually(installPath?: string): Promise<{
  success: boolean;
  message: string;
  path?: string
}> {
  const platformName = platform();
  const downloadInfo = CMDLINE_TOOLS_DOWNLOAD.platforms[platformName as keyof typeof CMDLINE_TOOLS_DOWNLOAD.platforms];

  if (!downloadInfo) {
    return { success: false, message: `Unsupported platform: ${platformName}` };
  }

  const targetPath = installPath || getDefaultInstallPath();
  const cmdlineToolsPath = join(targetPath, "cmdline-tools");
  const latestPath = join(cmdlineToolsPath, "latest");

  try {
    logger.info(`Installing Android command line tools manually to: ${targetPath}`);

    // Create directories
    mkdirSync(cmdlineToolsPath, { recursive: true });

    // Download
    const downloadUrl = `${CMDLINE_TOOLS_DOWNLOAD.baseUrl}/${downloadInfo.filename}`;
    const zipPath = join(cmdlineToolsPath, downloadInfo.filename);

    logger.info(`Downloading from: ${downloadUrl}`);
    await downloadFile(downloadUrl, zipPath);

    // Verify checksum
    logger.info("Verifying download integrity...");
    const checksumValid = await verifyChecksum(zipPath, downloadInfo.checksum);
    if (!checksumValid) {
      throw new Error("Download checksum verification failed");
    }

    // Extract
    logger.info("Extracting command line tools...");
    await extractZip(zipPath, cmdlineToolsPath);

    // Move extracted cmdline-tools directory to 'latest'
    const extractedPath = join(cmdlineToolsPath, "cmdline-tools");
    if (existsSync(extractedPath)) {
      if (existsSync(latestPath)) {
        // Remove existing latest directory
        await spawnCommand("rm", ["-rf", latestPath]);
      }
      await spawnCommand("mv", [extractedPath, latestPath]);
    }

    // Clean up zip file
    await spawnCommand("rm", [zipPath]);

    logger.info(`Successfully installed Android command line tools to: ${latestPath}`);
    return { success: true, message: "Successfully installed Android command line tools manually", path: latestPath };

  } catch (error) {
    const errorMessage = `Manual installation failed: ${(error as Error).message}`;
    logger.error(errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Install tools using existing SDK manager
 */
export async function installViaSdkManager(location: AndroidToolsLocation, tools: string[]): Promise<{
  success: boolean;
  message: string
}> {
  try {
    const sdkmanagerPath = join(location.path, "bin", "sdkmanager");
    const sdkmanagerBatPath = join(location.path, "bin", "sdkmanager.bat");

    let command: string;
    if (existsSync(sdkmanagerPath)) {
      command = sdkmanagerPath;
    } else if (existsSync(sdkmanagerBatPath)) {
      command = sdkmanagerBatPath;
    } else {
      return { success: false, message: "SDK manager not found in existing installation" };
    }

    // Accept licenses first - provide "y" responses to all prompts
    logger.info("Accepting Android SDK licenses...");
    const licenseInput = "y\n".repeat(10); // Accept up to 10 license prompts
    await spawnCommand(command, ["--licenses"], { input: licenseInput });

    // Install additional packages if needed
    const packagesToInstall = [
      "platform-tools",
      "build-tools;34.0.0",
      "platforms;android-34"
    ];

    for (const pkg of packagesToInstall) {
      logger.info(`Installing package: ${pkg}`);
      await spawnCommand(command, [pkg]);
    }

    return { success: true, message: "Successfully updated Android SDK tools" };

  } catch (error) {
    const errorMessage = `SDK manager installation failed: ${(error as Error).message}`;
    logger.error(errorMessage);
    return { success: false, message: errorMessage };
  }
}

/**
 * Android command line tools download information
 */
export const CMDLINE_TOOLS_DOWNLOAD = {
  version: "13114758",
  baseUrl: "https://dl.google.com/android/repository",
  platforms: {
    darwin: {
      filename: "commandlinetools-mac-13114758_latest.zip",
      checksum: "5673201e6f3869f418eeed3b5cb6c4be7401502bd0aae1b12a29d164d647a54e"
    },
    linux: {
      filename: "commandlinetools-linux-13114758_latest.zip",
      checksum: "7ec965280a073311c339e571cd5de778b9975026cfcbe79f2b1cdcb1e15317ee"
    },
    win32: {
      filename: "commandlinetools-win-13114758_latest.zip",
      checksum: "98b565cb657b012dae6794cefc0f66ae1efb4690c699b78a614b4a6a3505b003"
    }
  }
};

/**
 * Default high-priority tools for AutoMobile MCP
 */
export const DEFAULT_REQUIRED_TOOLS = [
  "apkanalyzer",
  "avdmanager",
  "sdkmanager"
];

/**
 * Determine the best installation method for the current platform
 */
export async function determineBestInstallMethod(preferredMethod?: string): Promise<"homebrew" | "manual" | "sdk"> {
  if (preferredMethod === "homebrew" && platform() === "darwin") {
    const homebrewAvailable = await isHomebrewAvailable();
    if (homebrewAvailable) {
      return "homebrew";
    }
  }

  if (preferredMethod === "manual") {
    return "manual";
  }

  if (preferredMethod === "sdk") {
    return "sdk";
  }

  // Auto-determine best method
  if (platform() === "darwin") {
    const homebrewAvailable = await isHomebrewAvailable();
    if (homebrewAvailable) {
      return "homebrew";
    }
  }

  return "manual";
}

/**
 * Main installation function
 */
export async function installAndroidTools(params: InstallAndroidToolsParams = {}): Promise<InstallationResult> {
  const {
    tools = DEFAULT_REQUIRED_TOOLS,
    method = "auto",
    installPath,
    force = false
  } = params;

  logger.info(`Starting Android tools installation. Tools: ${tools.join(", ")}, Method: ${method}, Force: ${force}`);

  try {
    // 1. Detect existing installations
    const existingLocations = await detectAndroidCommandLineTools();
    const bestLocation = getBestAndroidToolsLocation(existingLocations);

    // 2. Check if tools already exist and are sufficient
    if (!force && bestLocation) {
      const validation = validateRequiredTools(bestLocation, tools);
      if (validation.valid) {
        logger.info(`All required tools already available at: ${bestLocation.path}`);
        return {
          success: true,
          installed_tools: tools,
          failed_tools: [],
          installation_path: bestLocation.path,
          installation_method: bestLocation.source,
          message: "All required tools already installed",
          existing_location: bestLocation
        };
      } else {
        logger.info(`Missing tools: ${validation.missing.join(", ")}`);
      }
    }

    // 3. Determine installation method
    const installMethod = await determineBestInstallMethod(method);
    logger.info(`Using installation method: ${installMethod}`);

    let installResult: { success: boolean; message: string; path?: string };
    let finalPath: string;
    let installationSource: AndroidToolsSource;

    // 4. Perform installation based on method
    switch (installMethod) {
      case "homebrew":
        installResult = await installViaHomebrew();
        finalPath = "/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest";
        installationSource = "homebrew";
        break;

      case "sdk":
        if (bestLocation) {
          installResult = await installViaSdkManager(bestLocation, tools);
          finalPath = bestLocation.path;
          installationSource = bestLocation.source;
        } else {
          installResult = { success: false, message: "No existing SDK installation found for SDK method" };
          finalPath = "";
          installationSource = "manual";
        }
        break;

      case "manual":
      default:
        installResult = await installManually(installPath);
        finalPath = installResult.path || join(installPath || getDefaultInstallPath(), "cmdline-tools", "latest");
        installationSource = "manual";
        break;
    }

    if (!installResult.success) {
      return {
        success: false,
        installed_tools: [],
        failed_tools: tools,
        installation_path: "",
        installation_method: installationSource,
        message: installResult.message
      };
    }

    // 5. Verify installation
    logger.info("Verifying installation...");
    const updatedLocations = await detectAndroidCommandLineTools();
    const newLocation = updatedLocations.find(loc => loc.path === finalPath) || getBestAndroidToolsLocation(updatedLocations);

    if (!newLocation) {
      return {
        success: false,
        installed_tools: [],
        failed_tools: tools,
        installation_path: finalPath,
        installation_method: installationSource,
        message: "Installation completed but tools not detected"
      };
    }

    // 6. Validate that required tools are now available
    const finalValidation = validateRequiredTools(newLocation, tools);
    const installedTools = tools.filter(tool => newLocation.available_tools.includes(tool));
    const failedTools = finalValidation.missing;

    const success = finalValidation.valid;
    const message = success
      ? `Successfully installed ${installedTools.length} tools`
      : `Partial installation: ${installedTools.length}/${tools.length} tools installed. Missing: ${failedTools.join(", ")}`;

    logger.info(message);

    return {
      success,
      installed_tools: installedTools,
      failed_tools: failedTools,
      installation_path: newLocation.path,
      installation_method: newLocation.source,
      message,
      existing_location: bestLocation || undefined
    };

  } catch (error) {
    const errorMessage = `Installation failed: ${(error as Error).message}`;
    logger.error(errorMessage);

    return {
      success: false,
      installed_tools: [],
      failed_tools: tools,
      installation_path: "",
      installation_method: "manual",
      message: errorMessage
    };
  }
}

/**
 * Get installation status and recommendations
 */
export async function getInstallationStatus(): Promise<{
  hasInstallation: boolean;
  locations: AndroidToolsLocation[];
  bestLocation?: AndroidToolsLocation;
  recommendations: string[];
}> {
  const locations = await detectAndroidCommandLineTools();
  const bestLocation = getBestAndroidToolsLocation(locations);
  const recommendations: string[] = [];

  if (locations.length === 0) {
    recommendations.push("No Android command line tools detected");

    if (platform() === "darwin") {
      const homebrewAvailable = await isHomebrewAvailable();
      if (homebrewAvailable) {
        recommendations.push("Recommended: Install via Homebrew (brew install --cask android-commandlinetools)");
      } else {
        recommendations.push("Install Homebrew first, then install Android command line tools");
      }
    } else {
      recommendations.push("Recommended: Manual installation from Android Developer website");
    }
  } else {
    const validation = validateRequiredTools(bestLocation!, DEFAULT_REQUIRED_TOOLS);
    if (!validation.valid) {
      recommendations.push(`Missing required tools: ${validation.missing.join(", ")}`);
      recommendations.push("Consider updating your Android SDK installation");
    } else {
      recommendations.push("All required tools are available");
    }
  }

  return {
    hasInstallation: locations.length > 0,
    locations,
    bestLocation: bestLocation || undefined,
    recommendations
  };
}

export interface InstallAndroidToolsParams {
  tools?: string[]; // Specific tools to install, empty defaults to high-priority tools
  method?: "auto" | "homebrew" | "manual" | "sdk"; // Installation method preference
  installPath?: string; // Custom installation path for manual installation
  force?: boolean; // Force reinstallation even if tools exist
}

export interface InstallationResult {
  success: boolean;
  installed_tools: string[];
  failed_tools: string[];
  installation_path: string;
  installation_method: AndroidToolsSource;
  message: string;
  existing_location?: AndroidToolsLocation;
}
