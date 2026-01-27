import type { BootedDevice } from "../../models";
import type { AdbExecutor } from "../android-cmdline-tools/interfaces/AdbExecutor";
import type {
  CrashDetector,
  CrashEvent,
  AnrEvent,
  CrashEventListener,
  AnrEventListener,
} from "../interfaces/CrashMonitor";
import { AdbClient } from "../android-cmdline-tools/AdbClient";
import { logger } from "../logger";

/**
 * Detects crashes and ANRs by looking for system dialogs in the UI hierarchy.
 * When an app crashes or ANRs, Android shows a dialog to the user.
 */
export class AccessibilityDialogDetector implements CrashDetector {
  readonly name = "accessibility";

  private adb: AdbExecutor;
  private device: BootedDevice | null = null;
  private packageName: string | null = null;
  private running = false;
  private lastCrashDialogTime = 0;
  private lastAnrDialogTime = 0;
  private crashListeners: CrashEventListener[] = [];
  private anrListeners: AnrEventListener[] = [];

  // Dialog detection debounce to prevent duplicate events
  private readonly DIALOG_DEBOUNCE_MS = 5000;

  constructor(adb?: AdbExecutor) {
    this.adb = adb ?? new AdbClient();
  }

  async start(device: BootedDevice, packageName: string): Promise<void> {
    this.device = device;
    this.packageName = packageName;
    this.running = true;
    this.lastCrashDialogTime = 0;
    this.lastAnrDialogTime = 0;

    if (this.adb instanceof AdbClient) {
      this.adb.setDevice(device);
    }

    logger.info(
      `AccessibilityDialogDetector started for package ${packageName} on device ${device.deviceId}`
    );
  }

  async stop(): Promise<void> {
    this.running = false;
    this.device = null;
    this.packageName = null;
    logger.info("AccessibilityDialogDetector stopped");
  }

  async checkForCrashes(): Promise<CrashEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const crashes: CrashEvent[] = [];
    const now = Date.now();

    // Debounce dialog detection
    if (now - this.lastCrashDialogTime < this.DIALOG_DEBOUNCE_MS) {
      return [];
    }

    try {
      const crashDialog = await this.detectCrashDialog();

      if (crashDialog && this.matchesPackage(crashDialog.packageName, this.packageName)) {
        this.lastCrashDialogTime = now;

        const event: CrashEvent = {
          deviceId: this.device.deviceId,
          packageName: crashDialog.packageName,
          crashType: "java",
          timestamp: now,
          processName: crashDialog.packageName,
          exceptionMessage: crashDialog.message,
          detectionSource: "accessibility",
        };

        crashes.push(event);
        this.notifyCrashListeners(event);
      }
    } catch (error) {
      logger.debug(`Error checking for crash dialogs: ${error}`);
    }

    return crashes;
  }

  async checkForAnrs(): Promise<AnrEvent[]> {
    if (!this.running || !this.device || !this.packageName) {
      return [];
    }

    const anrs: AnrEvent[] = [];
    const now = Date.now();

    // Debounce dialog detection
    if (now - this.lastAnrDialogTime < this.DIALOG_DEBOUNCE_MS) {
      return [];
    }

    try {
      const anrDialog = await this.detectAnrDialog();

      if (anrDialog && this.matchesPackage(anrDialog.packageName, this.packageName)) {
        this.lastAnrDialogTime = now;

        const event: AnrEvent = {
          deviceId: this.device.deviceId,
          packageName: anrDialog.packageName,
          timestamp: now,
          processName: anrDialog.packageName,
          reason: anrDialog.message,
          detectionSource: "accessibility",
        };

        anrs.push(event);
        this.notifyAnrListeners(event);
      }
    } catch (error) {
      logger.debug(`Error checking for ANR dialogs: ${error}`);
    }

    return anrs;
  }

  isRunning(): boolean {
    return this.running;
  }

  addCrashListener(listener: CrashEventListener): void {
    this.crashListeners.push(listener);
  }

  removeCrashListener(listener: CrashEventListener): void {
    const index = this.crashListeners.indexOf(listener);
    if (index !== -1) {
      this.crashListeners.splice(index, 1);
    }
  }

  addAnrListener(listener: AnrEventListener): void {
    this.anrListeners.push(listener);
  }

  removeAnrListener(listener: AnrEventListener): void {
    const index = this.anrListeners.indexOf(listener);
    if (index !== -1) {
      this.anrListeners.splice(index, 1);
    }
  }

  /**
   * Detect crash dialog in the UI hierarchy
   */
  private async detectCrashDialog(): Promise<{
    packageName: string;
    message: string;
  } | null> {
    try {
      // Dump UI hierarchy
      const result = await this.adb.executeCommand(
        "shell uiautomator dump /dev/tty 2>/dev/null",
        10000
      );

      if (!result.stdout) {
        return null;
      }

      const xml = result.stdout;

      // Look for crash dialog patterns
      // Common patterns:
      // - "has stopped" dialog
      // - "keeps stopping" dialog
      // - "Unfortunately, X has stopped"

      // Check for crash dialog title
      const stoppedMatch = xml.match(
        /text="([^"]+)\s+(?:has stopped|keeps stopping|isn't responding)"/i
      );

      if (stoppedMatch) {
        const appName = stoppedMatch[1];
        // Try to find the package name
        const packageMatch = await this.findPackageForAppName(appName);

        return {
          packageName: packageMatch || appName,
          message: `${appName} has stopped`,
        };
      }

      // Check for "App isn't responding" which appears for ANRs but sometimes for crashes too
      const notRespondingMatch = xml.match(
        /text="([^"]+)\s+isn't responding"/i
      );

      // If it's a crash dialog (not ANR), there won't be a "Wait" button
      if (notRespondingMatch && !xml.includes('text="Wait"')) {
        const appName = notRespondingMatch[1];
        const packageMatch = await this.findPackageForAppName(appName);

        return {
          packageName: packageMatch || appName,
          message: `${appName} crashed`,
        };
      }

      // Check for system crash dialog package
      if (
        xml.includes('package="android"') &&
        (xml.includes("has stopped") || xml.includes("keeps stopping"))
      ) {
        // Try to extract app name from dialog content
        const appNameMatch = xml.match(
          /resource-id="android:id\/message"[^>]*text="([^"]+)"/
        );

        if (appNameMatch) {
          const message = appNameMatch[1];
          const nameMatch = message.match(/^([^"]+?)\s+(?:has stopped|keeps)/);
          if (nameMatch) {
            const appName = nameMatch[1];
            const packageMatch = await this.findPackageForAppName(appName);
            return {
              packageName: packageMatch || appName,
              message: message,
            };
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect ANR dialog in the UI hierarchy
   */
  private async detectAnrDialog(): Promise<{
    packageName: string;
    message: string;
  } | null> {
    try {
      const result = await this.adb.executeCommand(
        "shell uiautomator dump /dev/tty 2>/dev/null",
        10000
      );

      if (!result.stdout) {
        return null;
      }

      const xml = result.stdout;

      // ANR dialog has "Wait" and "Close app" buttons
      const isAnrDialog =
        xml.includes('text="Wait"') &&
        (xml.includes('text="Close app"') || xml.includes('text="OK"'));

      if (!isAnrDialog) {
        return null;
      }

      // Look for "isn't responding" pattern
      const notRespondingMatch = xml.match(
        /text="([^"]+)\s+isn't responding"/i
      );

      if (notRespondingMatch) {
        const appName = notRespondingMatch[1];
        const packageMatch = await this.findPackageForAppName(appName);

        return {
          packageName: packageMatch || appName,
          message: `${appName} isn't responding`,
        };
      }

      // Try system dialog content
      const messageMatch = xml.match(
        /resource-id="android:id\/message"[^>]*text="([^"]+)"/
      );

      if (messageMatch) {
        const message = messageMatch[1];
        if (message.includes("isn't responding") || message.includes("not responding")) {
          const nameMatch = message.match(/^([^"]+?)\s+(?:isn't|is not)/);
          if (nameMatch) {
            const appName = nameMatch[1];
            const packageMatch = await this.findPackageForAppName(appName);
            return {
              packageName: packageMatch || appName,
              message: message,
            };
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Try to find the package name for a given app name
   */
  private async findPackageForAppName(appName: string): Promise<string | null> {
    try {
      // Use pm list packages to search for the app
      const result = await this.adb.executeCommand(
        `shell pm list packages -f | grep -i "${appName.toLowerCase().replace(/\s+/g, "")}"`,
        5000
      );

      if (result.stdout) {
        // Extract package name from output like "package:/path/to/app.apk=com.example.app"
        const match = result.stdout.match(/=([^\s]+)$/m);
        if (match) {
          return match[1];
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private matchesPackage(
    detectedPackage: string | undefined,
    targetPackage: string
  ): boolean {
    if (!detectedPackage) {return false;}

    // Normalize for comparison (remove spaces, lowercase)
    const normalizedDetected = detectedPackage.toLowerCase().replace(/\s+/g, "");
    const normalizedTarget = targetPackage.toLowerCase().replace(/\s+/g, "");

    return (
      normalizedDetected === normalizedTarget ||
      normalizedDetected.startsWith(normalizedTarget + ":") ||
      normalizedDetected.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedDetected)
    );
  }

  private notifyCrashListeners(event: CrashEvent): void {
    for (const listener of this.crashListeners) {
      try {
        void listener(event);
      } catch (error) {
        logger.error(`Error in crash listener: ${error}`);
      }
    }
  }

  private notifyAnrListeners(event: AnrEvent): void {
    for (const listener of this.anrListeners) {
      try {
        void listener(event);
      } catch (error) {
        logger.error(`Error in ANR listener: ${error}`);
      }
    }
  }
}
