import { homedir, platform } from "os";
import { join } from "path";
import {
  type AndroidToolsLocation,
  type AndroidToolsSource
} from "./detection";

/**
 * Check if Homebrew is available (macOS only)
 */
export async function isHomebrewAvailable(): Promise<boolean> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Install Android command line tools via Homebrew
 */
export async function installViaHomebrew(): Promise<{ success: boolean; message: string }> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Download file with progress logging
 */
export async function downloadFile(url: string, outputPath: string): Promise<void> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Verify file checksum
 */
export async function verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Extract zip file
 */
export async function extractZip(zipPath: string, extractPath: string): Promise<void> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
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
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Install tools using existing SDK manager
 */
export async function installViaSdkManager(location: AndroidToolsLocation, tools: string[]): Promise<{
  success: boolean;
  message: string
}> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Check if Java is installed and get version
 */
export async function checkJavaInstallation(): Promise<{
  installed: boolean;
  version?: string;
  javaHome?: string;
}> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Install Java via Homebrew (macOS only) - only if no Java is available
 */
export async function installJavaViaHomebrew(version: string = "21"): Promise<{
  success: boolean;
  message: string;
}> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Setup environment variables for Android development
 */
export async function setupAndroidEnvironmentVariables(androidHome?: string): Promise<{
  success: boolean;
  message: string;
  variables: Record<string, string>;
}> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Install Xcode Command Line Tools (macOS only)
 */
export async function installXcodeCommandLineTools(): Promise<{
  success: boolean;
  message: string;
}> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Comprehensive Android development environment setup
 */
export async function setupCompleteAndroidEnvironment(params: CompleteSetupParams = {}): Promise<CompleteSetupResult> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Android command line tools download information - Updated to latest version
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
 * Comprehensive Android SDK packages for complete development environment
 */
export const COMPREHENSIVE_ANDROID_PACKAGES = [
  // Essential tools
  "platform-tools",
  "emulator",

  // Current and recent Android SDK platforms with sources
  "platforms;android-36",
  "sources;android-36",
  "platforms;android-35",
  "sources;android-35",

  // Build tools (current and recent versions)
  "build-tools;36.0.0",
  "build-tools;35.0.0",

  // System images for emulators (ARM64 and x86_64 for both Intel and Apple Silicon Macs)
  "system-images;android-36;google_apis;arm64-v8a",
  "system-images;android-36;google_apis;x86_64",
  "system-images;android-35;google_apis;arm64-v8a",
  "system-images;android-35;google_apis;x86_64",

  // Google Play system images for testing
  "system-images;android-36;google_apis_playstore;arm64-v8a",
  "system-images;android-36;google_apis_playstore;x86_64"
];

/**
 * Default high-priority tools for AutoMobile MCP - Enhanced
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
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

/**
 * Main installation function
 */
export async function installAndroidTools(params: InstallAndroidToolsParams = {}): Promise<InstallationResult> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
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
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
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

// New interfaces for complete setup
export interface CompleteSetupParams {
  installJava?: boolean;
  installXcodeTools?: boolean;
  javaVersion?: string;
  force?: boolean;
}

export interface SetupStep {
  name: string;
  success: boolean;
  message: string;
}

export interface CompleteSetupResult {
  success: boolean;
  steps: SetupStep[];
  environmentVariables: Record<string, string>;
  recommendations: string[];
}
