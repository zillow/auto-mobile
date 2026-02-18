import { homedir, platform } from "os";
import { join } from "path";
import {
  type AndroidToolsLocation,
  type AndroidToolsSource
} from "./detection";

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
 * Default high-priority tools for AutoMobile MCP - Enhanced
 */
export const DEFAULT_REQUIRED_TOOLS = [
  "apkanalyzer",
  "avdmanager",
  "sdkmanager"
];

/**
 * Main installation function
 */
export async function installAndroidTools(params: InstallAndroidToolsParams = {}): Promise<InstallationResult> {
  throw new Error("Tool installation functionality has been removed. Please install Android command-line tools manually.");
}

interface InstallAndroidToolsParams {
  tools?: string[]; // Specific tools to install, empty defaults to high-priority tools
  method?: "auto" | "homebrew" | "manual" | "sdk"; // Installation method preference
  installPath?: string; // Custom installation path for manual installation
  force?: boolean; // Force reinstallation even if tools exist
}

interface InstallationResult {
  success: boolean;
  installed_tools: string[];
  failed_tools: string[];
  installation_path: string;
  installation_method: AndroidToolsSource;
  message: string;
  existing_location?: AndroidToolsLocation;
}
