import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, OpenURLResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";
import { logger } from "../../utils/logger";
import { LaunchApp } from "./LaunchApp";

export class OpenURL extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  async execute(
    url: string,
  ): Promise<OpenURLResult> {
    logger.info(`[OpenURL] Starting URL open request: ${url}`);

    // Validate URL
    if (!url || !url.trim()) {
      logger.error("[OpenURL] Invalid URL provided");
      return {
        success: false,
        url: url || "",
        error: "Invalid URL provided"
      };
    }

    const trimmedUrl = url.trim();
    logger.info(`[OpenURL] Processing URL: ${trimmedUrl}`);

    // Handle package: URLs specially - delegate to LaunchApp
    if (trimmedUrl.startsWith("package:")) {
      logger.info("[OpenURL] Detected package URL, extracting package name");
      const packageName = trimmedUrl.replace("package:", "");

      if (!packageName) {
        logger.error("[OpenURL] No package name found in package URL");
        return {
          success: false,
          url: trimmedUrl,
          error: "Invalid package URL - no package name specified"
        };
      }

      logger.info(`[OpenURL] Launching app with package name: ${packageName}`);

      try {
        // Use LaunchApp to properly launch the application
        const launchApp = new LaunchApp(this.device, this.adb);
        const launchResult = await launchApp.execute(packageName, false, true);

        if (launchResult.success) {
          logger.info(`[OpenURL] Successfully launched app ${packageName}`);
          return {
            success: true,
            url: trimmedUrl
          };
        } else {
          logger.error(`[OpenURL] Failed to launch app ${packageName}: ${launchResult.error}`);
          return {
            success: false,
            url: trimmedUrl,
            error: `Failed to launch app: ${launchResult.error}`
          };
        }
      } catch (error) {
        logger.error(`[OpenURL] Exception while launching app ${packageName}:`, error);
        return {
          success: false,
          url: trimmedUrl,
          error: `Failed to launch app: ${error}`
        };
      }
    }

    // Handle regular URLs (http, https, mailto, tel, etc.)
    logger.info(`[OpenURL] Processing as regular URL: ${trimmedUrl}`);

    return this.observedInteraction(
      async () => {
        // Platform-specific URL opening execution
        switch (this.device.platform) {
          case "android":
            return await this.executeAndroidOpenURL(url);
          case "ios":
            return await this.executeiOSOpenURL(url);
          default:
            throw new Error(`Unsupported platform: ${this.device.platform}`);
        }
      },
      {
        changeExpected: false,
        timeoutMs: 12000
      }
    );
  }

  /**
   * Execute Android-specific URL opening
   * @param url - URL to open
   * @returns Result of the URL opening operation
   */
  private async executeAndroidOpenURL(url: string): Promise<OpenURLResult> {
    await this.adb.executeCommand(`shell am start -a android.intent.action.VIEW -d "${url}"`);

    return {
      success: true,
      url
    };
  }

  /**
   * Execute iOS-specific URL opening
   * @param url - URL to open
   * @returns Result of the URL opening operation
   */
  private async executeiOSOpenURL(url: string): Promise<OpenURLResult> {
    await this.axe.openUrl(url);

    return {
      success: true,
      url
    };
  }
}
