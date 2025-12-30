import path from "path";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

export class InstallApp {
  private adb: AdbClient;

  /**
   * Create an InstallApp instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   */
  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.adb = adb || new AdbClient(device);
  }

  /**
   * Install an APK file
   * @param apkPath - Path to the APK file
   * @param userId - Optional Android user ID (auto-detected if not provided)
   */
  async execute(apkPath: string, userId?: number): Promise<{ success: boolean; upgrade: boolean; userId: number }> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("installApp");

    if (!path.isAbsolute(apkPath)) {
      apkPath = path.resolve(process.cwd(), apkPath);
    }

    // Extract package name from APK
    const packageName = await perf.track("extractPackageName", async () => {
      const packageNameCmd = `dump badging "${apkPath}" | grep "package:" | grep -o "name='[^']*'" | cut -d= -f2 | tr -d "'"`;
      return this.adb.executeCommand(packageNameCmd);
    });

    // Auto-detect target user if not specified
    const targetUserId = await perf.track("detectTargetUser", async () => {
      if (userId !== undefined) {
        return userId;
      }

      // Check if app is in foreground and get its user
      const foregroundApp = await this.adb.getForegroundApp();
      if (foregroundApp && foregroundApp.packageName === packageName.trim()) {
        return foregroundApp.userId;
      }

      // Get list of users and prefer work profile
      const users = await this.adb.listUsers();

      // Find first work profile (flags 30 typically indicates managed/work profile)
      const workProfile = users.find(u => u.userId > 0 && u.running);
      if (workProfile) {
        return workProfile.userId;
      }

      // Fall back to primary user
      return 0;
    });

    // Check if app is already installed for this user
    const isInstalled = await perf.track("checkInstalled", async () => {
      const isInstalledCmd = `shell pm list packages --user ${targetUserId} -f ${packageName.trim()} | grep -c ${packageName.trim()}`;
      const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd, undefined, undefined, true);
      return parseInt(isInstalledOutput.trim(), 10) > 0;
    });

    const success = await perf.track("adbInstall", async () => {
      const installOutput = await this.adb.executeCommand(`install --user ${targetUserId} -r "${apkPath}"`);
      return installOutput.includes("Success");
    });

    perf.end();
    return {
      success: success,
      upgrade: isInstalled && success,
      userId: targetUserId
    };
  }
}
