/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckResult } from "../types";
import { DaemonManager } from "../../daemon/manager";
import { getDaemonHealthReport } from "../../daemon/debugTools";
import { RELEASE_VERSION } from "../../constants/release";
import { defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import { AndroidAccessibilityServiceManager } from "../../utils/AccessibilityServiceManager";
import { logger } from "../../utils/logger";

const RELEASES_URL = "https://github.com/kaeawc/auto-mobile/releases";

/**
 * Check AutoMobile version
 */
export function checkVersion(): CheckResult {
  return {
    name: "AutoMobile Version",
    status: "pass",
    message: `Version ${RELEASE_VERSION}`,
    value: RELEASE_VERSION,
  };
}

/**
 * Check daemon status
 */
export async function checkDaemonStatus(): Promise<CheckResult> {
  try {
    const manager = new DaemonManager();
    const status = await manager.status();

    if (status.running) {
      return {
        name: "Daemon Status",
        status: "pass",
        message: `Running (PID ${status.pid})`,
        value: status.pid,
      };
    }

    return {
      name: "Daemon Status",
      status: "warn",
      message: "Daemon is not running",
      recommendation: "Start the daemon with: npx -y @kaeawc/auto-mobile@latest --daemon start",
    };
  } catch (error) {
    return {
      name: "Daemon Status",
      status: "warn",
      message: `Could not check daemon: ${error instanceof Error ? error.message : String(error)}`,
      recommendation: "Try: npx -y @kaeawc/auto-mobile@latest --daemon start",
    };
  }
}

/**
 * Check daemon connectivity
 */
export async function checkDaemonConnectivity(): Promise<CheckResult> {
  try {
    const report = await getDaemonHealthReport();

    if (report.socketConnectable) {
      return {
        name: "Daemon Connectivity",
        status: "pass",
        message: "Daemon is responsive",
      };
    }

    if (!report.daemonRunning) {
      return {
        name: "Daemon Connectivity",
        status: "skip",
        message: "Daemon is not running",
      };
    }

    return {
      name: "Daemon Connectivity",
      status: "warn",
      message: "Daemon running but not responding",
      recommendation: report.recommendations.join("; ") || "Try: npx -y @kaeawc/auto-mobile@latest --daemon restart",
    };
  } catch (error) {
    return {
      name: "Daemon Connectivity",
      status: "warn",
      message: `Connectivity check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check accessibility service status on connected devices
 */
export async function checkAccessibilityService(
  adbFactory: AdbClientFactory = defaultAdbClientFactory
): Promise<CheckResult> {
  try {
    const adb = adbFactory.create();
    const devices = await adb.getBootedAndroidDevices();

    if (devices.length === 0) {
      return {
        name: "Accessibility Service",
        status: "skip",
        message: "No Android devices connected",
      };
    }

    // Check first connected device
    const device = devices[0];
    // Reset cached instances to ensure fresh ADB reads for doctor diagnostics
    // (getInstance memoizes isInstalled/isEnabled for 30 minutes which can report stale state)
    AndroidAccessibilityServiceManager.resetInstances();
    const serviceManager = AndroidAccessibilityServiceManager.getInstance(device);

    const versionResult = await serviceManager.ensureCompatibleVersion();
    const isInstalled = await serviceManager.isInstalled();
    const isEnabled = await serviceManager.isEnabled();

    const diagnostics: string[] = [
      `device=${device.deviceId}`,
      `installed=${isInstalled}`,
      `enabled=${isEnabled}`
    ];

    if (versionResult.expectedSha256 !== undefined) {
      diagnostics.push(`expectedSha256=${versionResult.expectedSha256 || "n/a"}`);
    }

    if (versionResult.installedSha256 !== undefined) {
      const source = versionResult.installedShaSource || "unknown";
      diagnostics.push(`installedSha256=${versionResult.installedSha256 || "unknown"} (${source})`);
    }

    diagnostics.push(`versionStatus=${versionResult.status}`);

    if (versionResult.error || versionResult.upgradeError || versionResult.reinstallError) {
      diagnostics.push(`versionError=${versionResult.error || versionResult.upgradeError || versionResult.reinstallError}`);
    }

    const attemptedDownloadOrInstall = Boolean(
      versionResult.attemptedDownload || versionResult.attemptedInstall || versionResult.attemptedReinstall
    );
    const downloadUnavailable = Boolean(versionResult.downloadUnavailable);
    if (downloadUnavailable) {
      diagnostics.push("downloadUnavailable=offline");
    }

    if (downloadUnavailable) {
      return {
        name: "Accessibility Service",
        status: "warn",
        message: diagnostics.join("; "),
        recommendation: "Newer accessibility service APK unavailable while offline. Connect to the internet and re-run doctor."
      };
    }

    if (isInstalled && isEnabled && (versionResult.status === "compatible" || versionResult.status === "upgraded" || versionResult.status === "installed" || versionResult.status === "reinstalled" || versionResult.status === "skipped")) {
      return {
        name: "Accessibility Service",
        status: "pass",
        message: diagnostics.join("; "),
        recommendation: attemptedDownloadOrInstall
          ? `If you need the latest APK, download from ${RELEASES_URL}`
          : undefined,
      };
    }

    if (isInstalled && !isEnabled) {
      return {
        name: "Accessibility Service",
        status: "warn",
        message: diagnostics.join("; "),
        recommendation: attemptedDownloadOrInstall
          ? `Enable the accessibility service in device settings. If you need the latest APK, download from ${RELEASES_URL}`
          : "Enable the accessibility service in device settings",
      };
    }

    if (!isInstalled) {
      return {
        name: "Accessibility Service",
        status: "warn",
        message: diagnostics.join("; "),
        recommendation: "The accessibility service will be installed automatically when needed",
      };
    }

    return {
      name: "Accessibility Service",
      status: "warn",
      message: diagnostics.join("; "),
      recommendation: attemptedDownloadOrInstall
        ? `If you need the latest APK, download from ${RELEASES_URL}`
        : "Review accessibility service installation status",
    };
  } catch (error) {
    logger.debug(`Accessibility service check failed: ${error}`);
    return {
      name: "Accessibility Service",
      status: "skip",
      message: `Could not check: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check work profile accessibility service status
 * Warns if work profiles exist but accessibility service is not enabled for them
 */
export async function checkWorkProfileAccessibility(
  adbFactory: AdbClientFactory = defaultAdbClientFactory
): Promise<CheckResult> {
  try {
    const adb = adbFactory.create();
    const devices = await adb.getBootedAndroidDevices();

    if (devices.length === 0) {
      return {
        name: "Work Profile Accessibility",
        status: "skip",
        message: "No Android devices connected",
      };
    }

    // Check first connected device
    const device = devices[0];
    const deviceAdb = adbFactory.create(device);
    const users = await deviceAdb.listUsers();

    // Filter to work profiles: userId > 0, running, and flags indicate managed profile (0x30 = 48)
    // Work profiles have FLAG_MANAGED_PROFILE (0x20) in their flags
    const workProfiles = users.filter(
      user => user.userId > 0 && user.running && (user.flags & 0x20) !== 0
    );

    if (workProfiles.length === 0) {
      return {
        name: "Work Profile Accessibility",
        status: "pass",
        message: "No work profiles detected",
      };
    }

    // Check accessibility service status for each work profile
    const profilesWithoutService: { userId: number; name: string }[] = [];

    for (const profile of workProfiles) {
      const result = await deviceAdb.executeCommand(
        `shell settings --user ${profile.userId} get secure enabled_accessibility_services`,
        undefined,
        undefined,
        true
      );
      const isEnabled = result.stdout.includes(AndroidAccessibilityServiceManager.PACKAGE);
      if (!isEnabled) {
        profilesWithoutService.push({ userId: profile.userId, name: profile.name });
      }
    }

    if (profilesWithoutService.length === 0) {
      return {
        name: "Work Profile Accessibility",
        status: "pass",
        message: `Accessibility service enabled for ${workProfiles.length} work profile(s)`,
      };
    }

    const profileList = profilesWithoutService
      .map(p => `${p.name} (user ${p.userId})`)
      .join(", ");

    return {
      name: "Work Profile Accessibility",
      status: "warn",
      message: `Accessibility service not enabled for work profile(s): ${profileList}`,
      recommendation: "The accessibility service needs to be enabled in each work profile for full app install tracking. Run npx -y @kaeawc/auto-mobile@latest --cli doctor or enable manually in Settings > Accessibility.",
    };
  } catch (error) {
    logger.debug(`Work profile accessibility check failed: ${error}`);
    return {
      name: "Work Profile Accessibility",
      status: "skip",
      message: `Could not check: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run all AutoMobile checks
 */
export async function runAutoMobileChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(checkVersion());
  results.push(await checkDaemonStatus());
  results.push(await checkDaemonConnectivity());
  results.push(await checkAccessibilityService());
  results.push(await checkWorkProfileAccessibility());

  return results;
}
