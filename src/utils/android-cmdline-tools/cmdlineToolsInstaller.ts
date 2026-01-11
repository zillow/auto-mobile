import { spawn } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { logger } from "../logger";
import { CMDLINE_TOOLS_DOWNLOAD, getDefaultInstallPath } from "./install";

export interface InstallCmdlineToolsParams {
  androidHome?: string;
}

export interface CmdlineToolsInstallResult {
  success: boolean;
  message: string;
  androidHome: string;
  installedPath?: string;
}

export interface CmdlineToolsInstallerDependencies {
  spawn: typeof spawn;
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  rmSync: typeof rmSync;
  renameSync: typeof renameSync;
  mkdtempSync: typeof mkdtempSync;
  tmpdir: typeof tmpdir;
  platform: () => NodeJS.Platform;
  logger: typeof logger;
}

const createDefaultDependencies = (): CmdlineToolsInstallerDependencies => ({
  spawn,
  existsSync,
  mkdirSync,
  rmSync,
  renameSync,
  mkdtempSync,
  tmpdir,
  platform: () => process.platform,
  logger
});

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: Error;
}

async function spawnCommand(
  command: string,
  args: string[],
  dependencies: CmdlineToolsInstallerDependencies
): Promise<CommandResult> {
  return new Promise(resolve => {
    const child = dependencies.spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", data => {
      stdout += data.toString();
    });

    child.stderr?.on("data", data => {
      stderr += data.toString();
    });

    child.on("close", code => {
      resolve({
        exitCode: code ?? 0,
        stdout,
        stderr
      });
    });

    child.on("error", error => {
      resolve({
        exitCode: 1,
        stdout,
        stderr,
        error
      });
    });
  });
}

function getCommandFailureSummary(result: CommandResult): string {
  const stderr = result.stderr.trim();
  if (stderr) {
    return stderr;
  }
  const stdout = result.stdout.trim();
  if (stdout) {
    return stdout;
  }
  if (result.error) {
    return result.error.message;
  }
  return "Unknown error";
}

function resolveAndroidHome(params: InstallCmdlineToolsParams): string {
  return params.androidHome
    || process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || getDefaultInstallPath();
}

function getCmdlineToolsDownloadUrl(platformName: NodeJS.Platform): string | null {
  const platformInfo = CMDLINE_TOOLS_DOWNLOAD.platforms[platformName as keyof typeof CMDLINE_TOOLS_DOWNLOAD.platforms];
  if (!platformInfo) {
    return null;
  }
  return `${CMDLINE_TOOLS_DOWNLOAD.baseUrl}/${platformInfo.filename}`;
}

export async function installCmdlineTools(
  params: InstallCmdlineToolsParams = {},
  dependencies = createDefaultDependencies()
): Promise<CmdlineToolsInstallResult> {
  const androidHome = resolveAndroidHome(params);
  const platformName = dependencies.platform();

  if (platformName !== "darwin" && platformName !== "linux") {
    return {
      success: false,
      message: "Command line tools installation is supported on macOS and Linux only.",
      androidHome
    };
  }

  const existingSdkManager = join(androidHome, "cmdline-tools", "latest", "bin", "sdkmanager");
  const existingAvdManager = join(androidHome, "cmdline-tools", "latest", "bin", "avdmanager");
  if (dependencies.existsSync(existingSdkManager) || dependencies.existsSync(existingAvdManager)) {
    return {
      success: true,
      message: "Android command line tools are already installed.",
      androidHome,
      installedPath: join(androidHome, "cmdline-tools", "latest")
    };
  }

  const downloadUrl = getCmdlineToolsDownloadUrl(platformName);
  if (!downloadUrl) {
    return {
      success: false,
      message: `No command line tools download available for platform: ${platformName}`,
      androidHome
    };
  }

  let tempDir: string | undefined;
  try {
    tempDir = dependencies.mkdtempSync(join(dependencies.tmpdir(), "auto-mobile-cmdline-tools-"));
    const zipPath = join(tempDir, "cmdline-tools.zip");

    dependencies.logger.info(`Downloading Android command line tools from ${downloadUrl}`);
    const downloadResult = await spawnCommand("curl", ["-fsSL", downloadUrl, "-o", zipPath], dependencies);
    if (downloadResult.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to download command line tools: ${getCommandFailureSummary(downloadResult)}`,
        androidHome
      };
    }

    dependencies.logger.info("Extracting Android command line tools...");
    const unzipResult = await spawnCommand("unzip", ["-q", zipPath, "-d", tempDir], dependencies);
    if (unzipResult.exitCode !== 0) {
      return {
        success: false,
        message: `Failed to extract command line tools: ${getCommandFailureSummary(unzipResult)}`,
        androidHome
      };
    }

    const extractedDir = join(tempDir, "cmdline-tools");
    if (!dependencies.existsSync(extractedDir)) {
      return {
        success: false,
        message: "Command line tools archive did not contain the expected cmdline-tools directory.",
        androidHome
      };
    }

    const toolsRoot = join(androidHome, "cmdline-tools");
    const latestDir = join(toolsRoot, "latest");

    dependencies.mkdirSync(toolsRoot, { recursive: true });
    if (dependencies.existsSync(latestDir)) {
      dependencies.rmSync(latestDir, { recursive: true, force: true });
    }

    dependencies.renameSync(extractedDir, latestDir);

    return {
      success: true,
      message: "Android command line tools installed.",
      androidHome,
      installedPath: latestDir
    };
  } finally {
    if (tempDir) {
      dependencies.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
