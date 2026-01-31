import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { BootedDevice, ClearAppDataResult } from "../../models";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

export class ClearAppData {
  private device: BootedDevice;
  private adb: AdbExecutor;

  constructor(device: BootedDevice, adbFactory: AdbClientFactory = defaultAdbClientFactory) {
    this.device = device;
    this.adb = adbFactory.create(device);
  }

  async execute(
    packageName: string,
    userId?: number
  ): Promise<ClearAppDataResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("clearAppData");

    // Auto-detect target user if not specified
    const targetUserId = await perf.track("detectTargetUser", async () => {
      if (userId !== undefined) {
        return userId;
      }

      // Check if app is in foreground and get its user
      const foregroundApp = await this.adb.getForegroundApp();
      if (foregroundApp && foregroundApp.packageName === packageName) {
        return foregroundApp.userId;
      }

      // Get list of users and prefer work profile
      const users = await this.adb.listUsers();

      // Find first work profile (userId > 0 and running)
      const workProfile = users.find(u => u.userId > 0 && u.running);
      if (workProfile) {
        return workProfile.userId;
      }

      // Fall back to primary user
      return 0;
    });

    try {
      // pm clear both clears data AND stops the app, no need for separate force-stop
      await perf.track("pmClear", async () => {
        await this.adb.executeCommand(`shell pm clear --user ${targetUserId} ${packageName}`);
        logger.info(`Clearing app data was successful for user ${targetUserId}`);
      });

      perf.end();
      return {
        success: true,
        packageName,
        userId: targetUserId
      };
    } catch {
      perf.end();
      return {
        success: false,
        packageName,
        userId: targetUserId,
        error: "Failed to clear application data"
      };
    }
  }
}
