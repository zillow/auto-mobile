/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ExecResult } from "../../models";
import { CheckResult, DoctorOptions } from "../types";
import { SimCtl, SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";

const MIN_XCODE_VERSION = "15.0";

const execFileAsync = promisify(execFile);

export interface IosDoctorDependencies {
  platform: () => NodeJS.Platform;
  execFile: (file: string, args: string[]) => Promise<ExecResult>;
  fileExists: (path: string) => boolean;
  readDir: (path: string) => Promise<string[]>;
  homedir: () => string;
  createSimctlClient: () => SimCtl;
}

const createExecResult = (stdout: string, stderr: string): ExecResult => ({
  stdout,
  stderr,
  toString() {
    return this.stdout;
  },
  trim() {
    return this.stdout.trim();
  },
  includes(searchString: string) {
    return this.stdout.includes(searchString);
  }
});

const createIosDoctorDependencies = (): IosDoctorDependencies => ({
  platform: () => process.platform,
  execFile: async (file, args) => {
    const result = await execFileAsync(file, args);
    const stdout = typeof result.stdout === "string" ? result.stdout : result.stdout.toString();
    const stderr = typeof result.stderr === "string" ? result.stderr : result.stderr.toString();
    return createExecResult(stdout, stderr);
  },
  fileExists: existsSync,
  readDir: async path => fs.readdir(path),
  homedir,
  createSimctlClient: () => new SimCtlClient()
});

function parseXcodeVersion(output: string): string | null {
  const match = output.match(/Xcode\s+([0-9]+(?:\.[0-9]+)*)/);
  return match ? match[1] : null;
}

function compareVersions(current: string, minimum: string): number {
  const currentParts = current.split(".").map(part => Number(part));
  const minimumParts = minimum.split(".").map(part => Number(part));
  const length = Math.max(currentParts.length, minimumParts.length);

  for (let i = 0; i < length; i++) {
    const currentValue = currentParts[i] ?? 0;
    const minimumValue = minimumParts[i] ?? 0;
    if (currentValue > minimumValue) {
      return 1;
    }
    if (currentValue < minimumValue) {
      return -1;
    }
  }

  return 0;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function errorOutput(error: unknown): string {
  const stdout = typeof (error as { stdout?: string })?.stdout === "string"
    ? (error as { stdout?: string }).stdout
    : "";
  const stderr = typeof (error as { stderr?: string })?.stderr === "string"
    ? (error as { stderr?: string }).stderr
    : "";
  return [stdout, stderr, normalizeErrorMessage(error)].join("\n");
}

/**
 * Check Xcode installation and minimum version
 */
export async function checkXcodeInstallation(
  minimumVersion: string = MIN_XCODE_VERSION,
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  if (dependencies.platform() !== "darwin") {
    return {
      name: "Xcode",
      status: "skip",
      message: "iOS development requires macOS",
    };
  }

  try {
    const result = await dependencies.execFile("xcodebuild", ["-version"]);
    const version = parseXcodeVersion(result.stdout);

    if (!version) {
      return {
        name: "Xcode",
        status: "fail",
        message: "Unable to determine Xcode version",
        recommendation: `Install Xcode ${minimumVersion}+ from the App Store.`,
      };
    }

    if (compareVersions(version, minimumVersion) < 0) {
      return {
        name: "Xcode",
        status: "fail",
        message: `Xcode ${version} installed (requires ${minimumVersion}+)`,
        recommendation: `Update Xcode to ${minimumVersion}+ and re-run doctor.`,
        value: version,
      };
    }

    return {
      name: "Xcode",
      status: "pass",
      message: `Xcode ${version} installed`,
      value: version,
    };
  } catch (error) {
    return {
      name: "Xcode",
      status: "fail",
      message: `Xcode not detected: ${normalizeErrorMessage(error)}`,
      recommendation: `Install Xcode ${minimumVersion}+ from the App Store.`,
    };
  }
}

/**
 * Check Xcode Command Line Tools (with optional auto-install)
 */
export async function checkXcodeCommandLineTools(
  options: DoctorOptions = {},
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  const name = "Command Line Tools";

  if (dependencies.platform() !== "darwin") {
    return {
      name,
      status: "skip",
      message: "iOS development requires macOS",
    };
  }

  if (options.installXcodeCommandLineTools) {
    try {
      await dependencies.execFile("xcode-select", ["--install"]);
      return {
        name,
        status: "pass",
        message: "Command Line Tools installation started",
        recommendation: "Follow the installer prompt and re-run doctor.",
      };
    } catch (error) {
      const output = errorOutput(error).toLowerCase();
      if (output.includes("already installed")) {
        return {
          name,
          status: "pass",
          message: "Command Line Tools already installed",
        };
      }

      return {
        name,
        status: "fail",
        message: `Command Line Tools install failed: ${normalizeErrorMessage(error)}`,
        recommendation: "Run: xcode-select --install",
      };
    }
  }

  try {
    const result = await dependencies.execFile("xcode-select", ["-p"]);
    const developerDir = result.stdout.trim();

    if (!developerDir) {
      return {
        name,
        status: "fail",
        message: "Command Line Tools path not configured",
        recommendation: "Run: xcode-select --install",
      };
    }

    if (!dependencies.fileExists(developerDir)) {
      return {
        name,
        status: "fail",
        message: `Command Line Tools path missing: ${developerDir}`,
        recommendation: "Run: xcode-select --install",
      };
    }

    const message = developerDir.includes("CommandLineTools")
      ? "Command Line Tools installed"
      : "Xcode developer directory selected";

    return {
      name,
      status: "pass",
      message,
      value: developerDir,
    };
  } catch (error) {
    return {
      name,
      status: "fail",
      message: `Command Line Tools not available: ${normalizeErrorMessage(error)}`,
      recommendation: "Run: xcode-select --install",
    };
  }
}

/**
 * Check xcrun availability
 */
export async function checkXcrunAvailable(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  if (dependencies.platform() !== "darwin") {
    return {
      name: "xcrun",
      status: "skip",
      message: "iOS development requires macOS",
    };
  }

  try {
    await dependencies.execFile("xcrun", ["--version"]);
    return {
      name: "xcrun",
      status: "pass",
      message: "xcrun functional",
    };
  } catch (error) {
    return {
      name: "xcrun",
      status: "fail",
      message: `xcrun not functional: ${normalizeErrorMessage(error)}`,
      recommendation: "Install Xcode Command Line Tools: xcode-select --install",
    };
  }
}

/**
 * Check if simctl is available (requires Xcode)
 */
export async function checkSimctlAvailable(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  if (dependencies.platform() !== "darwin") {
    return {
      name: "simctl",
      status: "skip",
      message: "iOS development requires macOS",
    };
  }

  try {
    const simctl = dependencies.createSimctlClient();
    const available = await simctl.isAvailable();

    if (available) {
      return {
        name: "simctl",
        status: "pass",
        message: "simctl functional",
      };
    }

    return {
      name: "simctl",
      status: "fail",
      message: "simctl not available",
      recommendation: "Install Xcode Command Line Tools: xcode-select --install",
    };
  } catch (error) {
    return {
      name: "simctl",
      status: "fail",
      message: `simctl check failed: ${normalizeErrorMessage(error)}`,
      recommendation: "Install Xcode Command Line Tools: xcode-select --install",
    };
  }
}

/**
 * Check available iOS simulator runtimes
 */
export async function checkSimulatorRuntimes(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  const name = "iOS Simulator Runtimes";

  if (dependencies.platform() !== "darwin") {
    return {
      name,
      status: "skip",
      message: "iOS simulators only available on macOS",
    };
  }

  const simctl = dependencies.createSimctlClient();
  if (!(await simctl.isAvailable())) {
    return {
      name,
      status: "skip",
      message: "simctl not available",
    };
  }

  try {
    const runtimes = await simctl.getRuntimes();
    const iosRuntimes = runtimes.filter(runtime => runtime.name.startsWith("iOS"));

    if (iosRuntimes.length === 0) {
      return {
        name,
        status: "fail",
        message: "No iOS simulator runtimes available",
        recommendation: "Install an iOS Simulator runtime in Xcode Settings > Platforms.",
      };
    }

    const runtimeNames = iosRuntimes.map(runtime => runtime.name).join(", ");
    return {
      name,
      status: "pass",
      message: `iOS runtimes available: ${runtimeNames}`,
      value: iosRuntimes.length,
    };
  } catch (error) {
    return {
      name,
      status: "fail",
      message: `Failed to list runtimes: ${normalizeErrorMessage(error)}`,
      recommendation: "Install an iOS Simulator runtime in Xcode Settings > Platforms.",
    };
  }
}

/**
 * Check code signing identities (optional)
 */
export async function checkCodeSigning(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  const name = "Code Signing Identity";

  if (dependencies.platform() !== "darwin") {
    return {
      name,
      status: "skip",
      message: "Code signing only available on macOS",
    };
  }

  try {
    const result = await dependencies.execFile("security", ["find-identity", "-v", "-p", "codesigning"]);
    const match = result.stdout.match(/(\d+)\s+valid identities found/);
    const count = match ? Number(match[1]) : 0;

    if (count > 0) {
      return {
        name,
        status: "pass",
        message: `${count} code signing identity(ies) available`,
        value: count,
      };
    }

    return {
      name,
      status: "warn",
      message: "No code signing identities found",
      recommendation: "Sign in to Xcode and install a development certificate for device testing.",
    };
  } catch (error) {
    return {
      name,
      status: "warn",
      message: `Code signing check failed: ${normalizeErrorMessage(error)}`,
      recommendation: "Sign in to Xcode and install a development certificate for device testing.",
    };
  }
}

/**
 * Check Apple Developer account presence (optional)
 */
export async function checkAppleDeveloperAccount(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  const name = "Apple Developer Account";

  if (dependencies.platform() !== "darwin") {
    return {
      name,
      status: "skip",
      message: "Apple Developer accounts only available on macOS",
    };
  }

  const accountsPath = join(dependencies.homedir(), "Library", "Developer", "Xcode", "Accounts");
  try {
    const entries = await dependencies.readDir(accountsPath);
    const visibleEntries = entries.filter(entry => entry.trim().length > 0);
    if (visibleEntries.length > 0) {
      return {
        name,
        status: "pass",
        message: "Apple Developer account configured",
      };
    }

    return {
      name,
      status: "warn",
      message: "No Apple Developer account configured",
      recommendation: "Sign in to Xcode to enable device testing.",
    };
  } catch (error) {
    return {
      name,
      status: "warn",
      message: "No Apple Developer account configured",
      recommendation: "Sign in to Xcode to enable device testing.",
    };
  }
}

/**
 * Check provisioning profiles (optional)
 */
export async function checkProvisioningProfiles(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  const name = "Provisioning Profiles";

  if (dependencies.platform() !== "darwin") {
    return {
      name,
      status: "skip",
      message: "Provisioning profiles only available on macOS",
    };
  }

  const profilesPath = join(dependencies.homedir(), "Library", "MobileDevice", "Provisioning Profiles");
  try {
    const entries = await dependencies.readDir(profilesPath);
    const profiles = entries.filter(entry => entry.endsWith(".mobileprovision"));

    if (profiles.length > 0) {
      return {
        name,
        status: "pass",
        message: `${profiles.length} provisioning profile(s) available`,
        value: profiles.length,
      };
    }

    return {
      name,
      status: "warn",
      message: "No provisioning profiles found",
      recommendation: "Create a provisioning profile in Xcode to enable device testing.",
    };
  } catch (error) {
    return {
      name,
      status: "warn",
      message: "No provisioning profiles found",
      recommendation: "Create a provisioning profile in Xcode to enable device testing.",
    };
  }
}

/**
 * Check booted iOS simulators
 */
export async function checkBootedSimulators(
  dependencies = createIosDoctorDependencies()
): Promise<CheckResult> {
  if (dependencies.platform() !== "darwin") {
    return {
      name: "Booted Simulators",
      status: "skip",
      message: "iOS simulators only available on macOS",
    };
  }

  try {
    const simctl = dependencies.createSimctlClient();

    if (!(await simctl.isAvailable())) {
      return {
        name: "Booted Simulators",
        status: "skip",
        message: "simctl not available",
      };
    }

    const simulators = await simctl.getBootedSimulators();

    if (simulators.length === 0) {
      return {
        name: "Booted Simulators",
        status: "pass",
        message: "No simulators currently running",
        value: 0,
      };
    }

    const simNames = simulators.map(s => s.name).join(", ");
    return {
      name: "Booted Simulators",
      status: "pass",
      message: `${simulators.length} simulator(s) running: ${simNames}`,
      value: simulators.length,
    };
  } catch (error) {
    return {
      name: "Booted Simulators",
      status: "skip",
      message: `Could not check simulators: ${normalizeErrorMessage(error)}`,
      value: 0,
    };
  }
}

/**
 * Run all iOS checks
 */
export async function runIosChecks(options: DoctorOptions = {}): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(await checkXcodeInstallation());
  results.push(await checkXcodeCommandLineTools(options));
  results.push(await checkXcrunAvailable());
  results.push(await checkSimctlAvailable());
  results.push(await checkSimulatorRuntimes());
  results.push(await checkCodeSigning());
  results.push(await checkAppleDeveloperAccount());
  results.push(await checkProvisioningProfiles());
  results.push(await checkBootedSimulators());

  return results;
}
