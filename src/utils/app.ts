import path from 'path';
import { AdbUtils } from './adb.ts';
import { logger } from './logger.ts';

export class AppUtils {
  private adb: AdbUtils;

  /**
   * Create an AppUtils instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adbUtils: AdbUtils | null = null) {
    this.adb = adbUtils || new AdbUtils(deviceId);
  }

  /**
   * List all installed packages on the device
   * @param systemApps - Whether to include system apps
   * @returns Promise with list of package names
   */
  async listInstalledApps(systemApps: boolean = false): Promise<string[]> {
    const flag = systemApps ? '-a' : '-3';
    const { stdout } = await this.adb.executeCommand(`shell pm list packages ${flag}`);
    
    return stdout
      .split('\n')
      .filter(line => line.startsWith('package:'))
      .map(line => line.replace('package:', '').trim());
  }

  /**
   * Launch an app by package name
   * @param packageName - The package name of the app to launch
   */
  async launchApp(packageName: string): Promise<void> {
    // First get the main activity of the app
    const { stdout } = await this.adb.executeCommand(
      `shell dumpsys package ${packageName} | grep -A 1 "MAIN" | grep ${packageName}`
    );
    
    // If we can't find the main activity, try a basic launch
    if (!stdout.trim()) {
      await this.adb.executeCommand(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
      return;
    }
    
    // Extract the activity name and launch it
    const match = stdout.match(/([^ ]+\/[^ ]+) filter/);
    if (match && match[1]) {
      const activity = match[1].trim();
      await this.adb.executeCommand(`shell am start -n ${activity}`);
    } else {
      // Fallback to monkey if regex fails
      await this.adb.executeCommand(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
    }
  }

  /**
   * Terminate an app by package name
   * @param packageName - The package name of the app to terminate
   */
  async terminateApp(packageName: string): Promise<void> {
    await this.adb.executeCommand(`shell am force-stop ${packageName}`);
  }

  /**
   * Clear app data for a specific package
   * @param packageName - The package name of the app to clear
   */
  async clearAppData(packageName: string): Promise<void> {
    await this.adb.executeCommand(`shell pm clear ${packageName}`);
  }

  /**
   * Install an APK file
   * @param apkPath - Path to the APK file
   */
  async installApp(apkPath: string): Promise<void> {
    if (!path.isAbsolute(apkPath)) {
      apkPath = path.resolve(process.cwd(), apkPath);
    }
    
    await this.adb.executeCommand(`install -r "${apkPath}"`);
  }

  /**
   * Uninstall an app by package name
   * @param packageName - The package name of the app to uninstall
   * @param keepData - Whether to keep the app data and cache directories
   */
  async uninstallApp(packageName: string, keepData: boolean = false): Promise<void> {
    const flag = keepData ? '-k' : '';
    await this.adb.executeCommand(`uninstall ${flag} ${packageName}`);
  }

  /**
   * Open a URL in the default browser
   * @param url - The URL to open
   */
  async openUrl(url: string): Promise<void> {
    await this.adb.executeCommand(`shell am start -a android.intent.action.VIEW -d "${url}"`);
  }
}