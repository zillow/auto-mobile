import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, OpenURLResult } from "../../models";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { logger } from "../../utils/logger";
import { LaunchApp } from "./LaunchApp";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

export class OpenURL extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  async execute(
    url: string,
  ): Promise<OpenURLResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("openURL");

    logger.info(`[OpenURL] Starting URL open request: ${url}`);

    // Validate URL
    if (!url || !url.trim()) {
      logger.error("[OpenURL] Invalid URL provided");
      perf.end();
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
        perf.end();
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
        const launchResult = await perf.track("launchApp", () =>
          launchApp.execute(packageName, false, true)
        );

        perf.end();
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
        perf.end();
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
            return await perf.track("androidOpenURL", () =>
              this.executeAndroidOpenURL(url)
            );
          case "ios":
            return await perf.track("iOSOpenURL", () =>
              this.executeiOSOpenURL(url)
            );
          default:
            perf.end();
            throw new Error(`Unsupported platform: ${this.device.platform}`);
        }
      },
      {
        changeExpected: false,
        timeoutMs: 12000,
        perf
      }
    );
  }

  /**
   * Execute Android-specific URL opening
   * @param url - URL to open
   * @returns Result of the URL opening operation
   */
  private async executeAndroidOpenURL(url: string): Promise<OpenURLResult> {
    // Convert opaque URIs to hierarchical URIs to work around Android am start limitation
    // Example: automobile:playground/path -> automobile://playground/path
    // This is needed because am start -d truncates opaque URIs at the first colon
    let processedUrl = url;
    const opaqueUriMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):([^/])/);
    if (opaqueUriMatch) {
      // This looks like an opaque URI (scheme:ssp without //)
      // Convert to hierarchical format by adding //
      const scheme = opaqueUriMatch[1];
      const ssp = url.substring(scheme.length + 1);
      processedUrl = `${scheme}://${ssp}`;
      logger.info(`[OpenURL] Converted opaque URI to hierarchical: ${url} -> ${processedUrl}`);
    }

    await this.adb.executeCommand(`shell am start -a android.intent.action.VIEW -d "${processedUrl}"`);

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
