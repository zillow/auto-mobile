import path from "path";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice } from "../../models";

export class InstallApp {
  private adb: AdbUtils;

  /**
   * Create an InstallApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(device);
  }

  /**
   * Install an APK file
   * @param apkPath - Path to the APK file
   */
  async execute(apkPath: string): Promise<{ success: boolean; upgrade: boolean }> {
    if (!path.isAbsolute(apkPath)) {
      apkPath = path.resolve(process.cwd(), apkPath);
    }

    // Extract package name from APK
    const packageNameCmd = `dump badging "${apkPath}" | grep "package:" | grep -o "name='[^']*'" | cut -d= -f2 | tr -d "'"`;
    const packageName = await this.adb.executeCommand(packageNameCmd);

    // Check if app is already installed
    const isInstalledCmd = `shell pm list packages -f ${packageName.trim()} | grep -c ${packageName.trim()}`;
    const isInstalledOutput = await this.adb.executeCommand(isInstalledCmd, undefined, undefined, true);
    const isInstalled = parseInt(isInstalledOutput.trim(), 10) > 0;

    const installOutput = await this.adb.executeCommand(`install -r "${apkPath}"`);
    const success = installOutput.includes("Success");

    return {
      success: success,
      upgrade: isInstalled && success
    };
  }
}
