/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from "node:fs";
import { CheckResult, DoctorOptions } from "../types";
import {
  detectAndroidCommandLineTools,
  getAndroidHomeWithSystemImages,
  getAndroidSdkFromEnvironment,
  getBestAndroidToolsLocation,
  getCmdlineToolsRoot,
  isHomebrewToolsPath
} from "../../utils/android-cmdline-tools/detection";
import { installCmdlineTools } from "../../utils/android-cmdline-tools/cmdlineToolsInstaller";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AndroidEmulatorClient } from "../../utils/android-cmdline-tools/AndroidEmulatorClient";
import { logger } from "../../utils/logger";

export interface AndroidDoctorDependencies {
  detectAndroidCommandLineTools: typeof detectAndroidCommandLineTools;
  getBestAndroidToolsLocation: typeof getBestAndroidToolsLocation;
  getAndroidHomeWithSystemImages: typeof getAndroidHomeWithSystemImages;
  getAndroidSdkFromEnvironment: typeof getAndroidSdkFromEnvironment;
  getAndroidSdkEnvValue: () => string | undefined;
  installCmdlineTools: typeof installCmdlineTools;
  logger: typeof logger;
}

const createAndroidDoctorDependencies = (): AndroidDoctorDependencies => ({
  detectAndroidCommandLineTools,
  getBestAndroidToolsLocation,
  getAndroidHomeWithSystemImages,
  getAndroidSdkFromEnvironment,
  getAndroidSdkEnvValue: () => process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT,
  installCmdlineTools,
  logger
});

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * Check Android command line tools installation and Homebrew mismatch
 */
export async function checkAndroidCommandLineTools(
  options: DoctorOptions = {},
  dependencies = createAndroidDoctorDependencies()
): Promise<CheckResult> {
  const name = "Android Command Line Tools";

  if (options.installCmdlineTools) {
    const androidHome = dependencies.getAndroidSdkFromEnvironment()
      || dependencies.getAndroidSdkEnvValue();
    if (!androidHome) {
      return {
        name,
        status: "warn",
        message: "ANDROID_HOME is not set; cannot install command line tools.",
        recommendation: "Set ANDROID_HOME and rerun: auto-mobile --cli doctor --install-cmdline-tools"
      };
    }

    const installResult = await dependencies.installCmdlineTools({ androidHome });
    return {
      name,
      status: installResult.success ? "pass" : "fail",
      message: installResult.message,
      value: installResult.installedPath ?? installResult.androidHome,
      recommendation: installResult.success
        ? undefined
        : "Install Android command line tools into ANDROID_HOME."
    };
  }

  let locations: Awaited<ReturnType<typeof detectAndroidCommandLineTools>>;
  try {
    locations = await dependencies.detectAndroidCommandLineTools();
  } catch (error) {
    dependencies.logger.debug(`Failed to detect Android command line tools: ${error}`);
    return {
      name,
      status: "warn",
      message: "Failed to detect Android command line tools."
    };
  }

  const bestLocation = dependencies.getBestAndroidToolsLocation(locations);
  if (!bestLocation) {
    return {
      name,
      status: "warn",
      message: "Android command line tools not detected.",
      recommendation: "Install command line tools into ANDROID_HOME."
    };
  }

  const androidHomeInfo = dependencies.getAndroidHomeWithSystemImages();
  if (androidHomeInfo && isHomebrewToolsPath(bestLocation.path)) {
    const toolsRoot = getCmdlineToolsRoot(bestLocation.path);
    if (normalizePath(toolsRoot) !== normalizePath(androidHomeInfo.androidHome)) {
      return {
        name,
        status: "warn",
        message: "Homebrew cmdline-tools detected while system images are in ANDROID_HOME.",
        recommendation: "Install command line tools into ANDROID_HOME or run: auto-mobile --cli doctor --install-cmdline-tools"
      };
    }
  }

  return {
    name,
    status: "pass",
    message: "Android command line tools detected.",
    value: bestLocation.path
  };
}

/**
 * Check ANDROID_HOME environment variable
 */
export async function checkAndroidHome(): Promise<CheckResult> {
  const androidHome = getAndroidSdkFromEnvironment();

  if (androidHome) {
    return {
      name: "ANDROID_HOME",
      status: "pass",
      message: `Android SDK found`,
      value: androidHome,
    };
  }

  return {
    name: "ANDROID_HOME",
    status: "fail",
    message: "ANDROID_HOME or ANDROID_SDK_ROOT not set or path does not exist",
    recommendation: "Set ANDROID_HOME to your Android SDK installation path. " +
      "Example: export ANDROID_HOME=$HOME/Library/Android/sdk",
  };
}

/**
 * Check JAVA_HOME environment variable
 */
export async function checkJavaHome(): Promise<CheckResult> {
  const javaHome = process.env.JAVA_HOME;

  if (!javaHome) {
    return {
      name: "JAVA_HOME",
      status: "warn",
      message: "JAVA_HOME environment variable not set",
      recommendation: "Set JAVA_HOME to your Java installation. " +
        "Example: export JAVA_HOME=$(/usr/libexec/java_home)",
    };
  }

  if (!existsSync(javaHome)) {
    return {
      name: "JAVA_HOME",
      status: "warn",
      message: `JAVA_HOME is set but path does not exist: ${javaHome}`,
      recommendation: "Update JAVA_HOME to a valid Java installation path",
    };
  }

  return {
    name: "JAVA_HOME",
    status: "pass",
    message: "Java home directory found",
    value: javaHome,
  };
}

/**
 * Check ADB installation and get path
 */
export async function checkAdbInstallation(): Promise<CheckResult> {
  try {
    const adb = new AdbClient();
    const adbPath = await adb.getAdbPathOnly();

    return {
      name: "ADB Installation",
      status: "pass",
      message: "ADB is available",
      value: adbPath,
    };
  } catch (error) {
    return {
      name: "ADB Installation",
      status: "fail",
      message: `ADB not found: ${error instanceof Error ? error.message : String(error)}`,
      recommendation: "Install Android SDK Platform-Tools. " +
        "Via Homebrew: brew install android-platform-tools",
    };
  }
}

/**
 * Check ADB version
 */
export async function checkAdbVersion(): Promise<CheckResult> {
  try {
    const adb = new AdbClient();
    const result = await adb.executeCommand("--version", undefined, undefined, true);

    // Parse version from output like "Android Debug Bridge version 35.0.0"
    const versionMatch = result.stdout.match(/Android Debug Bridge version (\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : "unknown";

    return {
      name: "ADB Version",
      status: "pass",
      message: `Version ${version}`,
      value: version,
    };
  } catch (error) {
    return {
      name: "ADB Version",
      status: "warn",
      message: `Could not determine ADB version: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check Android emulator availability
 */
export async function checkEmulator(): Promise<CheckResult> {
  try {
    const emulator = new AndroidEmulatorClient();
    // Try to list AVDs - this will fail if emulator is not available
    await emulator.listAvds();

    return {
      name: "Android Emulator",
      status: "pass",
      message: "Emulator is available",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Check if it's a "not found" error
    if (errorMsg.includes("not found") || errorMsg.includes("ENOENT")) {
      return {
        name: "Android Emulator",
        status: "warn",
        message: "Emulator not found",
        recommendation: "Install Android Emulator via SDK Manager or Homebrew: " +
          "brew install android-emulator",
      };
    }

    return {
      name: "Android Emulator",
      status: "warn",
      message: `Emulator check failed: ${errorMsg}`,
    };
  }
}

/**
 * Check connected Android devices
 */
export async function checkConnectedDevices(): Promise<CheckResult> {
  try {
    const adb = new AdbClient();
    const devices = await adb.getBootedAndroidDevices();

    if (devices.length === 0) {
      return {
        name: "Connected Devices",
        status: "warn",
        message: "No Android devices connected",
        value: 0,
        recommendation: "Connect a device via USB or start an emulator",
      };
    }

    const deviceNames = devices.map(d => d.deviceId).join(", ");
    return {
      name: "Connected Devices",
      status: "pass",
      message: `${devices.length} device(s) connected: ${deviceNames}`,
      value: devices.length,
    };
  } catch (error) {
    return {
      name: "Connected Devices",
      status: "warn",
      message: `Could not list devices: ${error instanceof Error ? error.message : String(error)}`,
      value: 0,
    };
  }
}

/**
 * Check available AVDs
 */
export async function checkAvailableAvds(): Promise<CheckResult> {
  try {
    const emulator = new AndroidEmulatorClient();
    const avds = await emulator.listAvds();

    if (avds.length === 0) {
      return {
        name: "Available AVDs",
        status: "warn",
        message: "No AVDs found",
        value: 0,
        recommendation: "Create an AVD using Android Studio or avdmanager",
      };
    }

    const avdNames = avds.map(a => a.name).join(", ");
    return {
      name: "Available AVDs",
      status: "pass",
      message: `${avds.length} AVD(s) available: ${avdNames}`,
      value: avds.length,
    };
  } catch (error) {
    logger.debug(`Failed to list AVDs: ${error}`);
    return {
      name: "Available AVDs",
      status: "skip",
      message: "Could not list AVDs (emulator may not be installed)",
      value: 0,
    };
  }
}

/**
 * Run all Android checks
 */
export async function runAndroidChecks(options: DoctorOptions = {}): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Run checks sequentially to avoid overwhelming the system
  results.push(await checkAndroidHome());
  results.push(await checkAndroidCommandLineTools(options));
  results.push(await checkJavaHome());
  results.push(await checkAdbInstallation());
  results.push(await checkAdbVersion());
  results.push(await checkEmulator());
  results.push(await checkConnectedDevices());
  results.push(await checkAvailableAvds());

  return results;
}
