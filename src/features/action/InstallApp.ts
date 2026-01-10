import path from "path";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { BootedDevice } from "../../models";
import { createGlobalPerformanceTracker, type PerformanceTracker } from "../../utils/PerformanceTracker";
import { DefaultHostCommandExecutor, type HostCommandExecutor } from "../../utils/HostCommandExecutor";
import { DefaultAndroidBuildToolsLocator, type AndroidBuildToolsLocator } from "../../utils/android-cmdline-tools/AndroidBuildToolsLocator";
import { OPERATION_CANCELLED_MESSAGE } from "../../utils/constants";

export class InstallApp {
  private adb: AdbExecutor;
  private hostExecutor: HostCommandExecutor;
  private buildToolsLocator: AndroidBuildToolsLocator;
  private createPerformanceTracker: () => PerformanceTracker;

  /**
   * Create an InstallApp instance
   * @param device - Optional device
   * @param adb - Optional AdbExecutor instance for testing
   * @param hostExecutor - Optional host command executor for testing
   * @param buildToolsLocator - Optional build tools locator for testing
   * @param performanceTrackerFactory - Optional performance tracker factory for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbExecutor | null = null,
    hostExecutor: HostCommandExecutor | null = null,
    buildToolsLocator: AndroidBuildToolsLocator | null = null,
    performanceTrackerFactory: () => PerformanceTracker = createGlobalPerformanceTracker
  ) {
    this.adb = adb || new AdbClient(device);
    this.hostExecutor = hostExecutor || new DefaultHostCommandExecutor();
    this.buildToolsLocator = buildToolsLocator || new DefaultAndroidBuildToolsLocator();
    this.createPerformanceTracker = performanceTrackerFactory;
  }

  /**
   * Install an APK file
   * @param apkPath - Path to the APK file
   * @param userId - Optional Android user ID (auto-detected if not provided)
   */
  async execute(
    apkPath: string,
    userId?: number,
    signal?: AbortSignal
  ): Promise<{ success: boolean; upgrade: boolean; userId: number; packageName?: string; warning?: string }> {
    const perf = this.createPerformanceTracker();
    perf.serial("installApp");

    if (!path.isAbsolute(apkPath)) {
      apkPath = path.resolve(process.cwd(), apkPath);
    }

    const warnings: string[] = [];

    // Extract package name from APK
    const packageNameResult = await perf.track("extractPackageName", async () => {
      return this.extractPackageName(apkPath, signal);
    });
    if (packageNameResult.warning) {
      warnings.push(packageNameResult.warning);
    }
    let packageName = packageNameResult.packageName?.trim();

    // Auto-detect target user if not specified
    const targetUserId = await perf.track("detectTargetUser", async () => {
      if (userId !== undefined) {
        return userId;
      }

      // Check if app is in foreground and get its user
      if (packageName) {
        const foregroundApp = await this.adb.getForegroundApp(signal);
        if (foregroundApp && foregroundApp.packageName === packageName) {
          return foregroundApp.userId;
        }
      }

      // Get list of users and prefer work profile
      const users = await this.adb.listUsers(signal);

      // Find first work profile (flags 30 typically indicates managed/work profile)
      const workProfile = users.find(u => u.userId > 0 && u.running);
      if (workProfile) {
        return workProfile.userId;
      }

      // Fall back to primary user
      return 0;
    });

    let isInstalled = false;
    if (packageName) {
      // Check if app is already installed for this user
      isInstalled = await perf.track("checkInstalled", async () => {
        const isInstalledCmd = `shell pm list packages --user ${targetUserId} -f ${packageName} | grep -c ${packageName}`;
        const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd, undefined, undefined, true, signal);
        return parseInt(isInstalledOutput.trim(), 10) > 0;
      });
    }

    let beforePackages: Set<string> | null = null;
    if (!packageName) {
      beforePackages = await perf.track("listPackagesBefore", async () => {
        return this.listPackagesForUser(targetUserId, signal);
      });
    }

    const success = await perf.track("adbInstall", async () => {
      const installOutput = await this.adb.executeCommand(`install --user ${targetUserId} -r "${apkPath}"`, undefined, undefined, undefined, signal);
      return installOutput.includes("Success");
    });

    if (!packageName && beforePackages) {
      const afterPackages = success ? await perf.track("listPackagesAfter", async () => {
        return this.listPackagesForUser(targetUserId, signal);
      }) : beforePackages;
      const newPackages = this.diffPackages(beforePackages, afterPackages);

      if (newPackages.length === 1) {
        packageName = newPackages[0];
      } else if (newPackages.length > 1) {
        warnings.push("Installed APK but multiple new packages were detected; unable to determine the package name reliably.");
      } else if (success) {
        warnings.push("Installed APK but package name could not be determined from the device package list.");
        isInstalled = true;
      }
    }

    perf.end();
    const warning = warnings.length > 0 ? warnings.join(" ") : undefined;
    return {
      success: success,
      upgrade: isInstalled && success,
      userId: targetUserId,
      packageName: packageName,
      warning: warning
    };
  }

  private async extractPackageName(
    apkPath: string,
    signal?: AbortSignal
  ): Promise<{ packageName?: string; warning?: string }> {
    if (signal?.aborted) {
      throw new Error(OPERATION_CANCELLED_MESSAGE);
    }

    const tool = await this.buildToolsLocator.findAaptTool();
    if (!tool) {
      return {
        warning: "aapt2 was not found. Install Android SDK build-tools (aapt2) for reliable package detection."
      };
    }

    const result = await this.hostExecutor.executeCommand(tool.path, ["dump", "badging", apkPath]);
    const output = `${result.stdout}\n${result.stderr}`;
    const match = output.match(/package:\s+name='([^']+)'/);
    if (!match) {
      throw new Error(`Failed to extract package name from ${tool.tool} output.`);
    }

    return { packageName: match[1] };
  }

  private async listPackagesForUser(userId: number, signal?: AbortSignal): Promise<Set<string>> {
    if (signal?.aborted) {
      throw new Error(OPERATION_CANCELLED_MESSAGE);
    }

    const result = await this.adb.executeCommand(
      `shell pm list packages --user ${userId}`,
      undefined,
      undefined,
      true,
      signal
    );
    const packages = new Set<string>();
    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("package:")) {
        continue;
      }
      const packageName = trimmed.slice("package:".length).trim();
      if (packageName) {
        packages.add(packageName);
      }
    }

    return packages;
  }

  private diffPackages(before: Set<string>, after: Set<string>): string[] {
    const newPackages: string[] = [];
    for (const packageName of after) {
      if (!before.has(packageName)) {
        newPackages.push(packageName);
      }
    }
    return newPackages.sort();
  }
}
