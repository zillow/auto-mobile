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
   */
  async execute(apkPath: string): Promise<{ success: boolean; upgrade: boolean }> {
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

    // Check if app is already installed
    const isInstalled = await perf.track("checkInstalled", async () => {
      const isInstalledCmd = `shell pm list packages -f ${packageName.trim()} | grep -c ${packageName.trim()}`;
      const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd, undefined, undefined, true);
      return parseInt(isInstalledOutput.trim(), 10) > 0;
    });

    const success = await perf.track("adbInstall", async () => {
      const installOutput = await this.adb.executeCommand(`install -r "${apkPath}"`);
      return installOutput.includes("Success");
    });

    perf.end();
    return {
      success: success,
      upgrade: isInstalled && success
    };
  }
}
