import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, OpenURLResult } from "../../models";
import { Axe } from "../../utils/ios-cmdline-tools/axe";

export class OpenURL extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbUtils | null = null, axe: Axe | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  async execute(
    url: string,
  ): Promise<OpenURLResult> {
    // Validate URL
    if (!url || !url.trim()) {
      return {
        success: false,
        url: url || "",
        error: "Invalid URL provided"
      };
    }

    return this.observedInteraction(
      async () => {
        try {
          // Platform-specific URL opening execution
          switch (this.device.platform) {
            case "android":
              return await this.executeAndroidOpenURL(url);
            case "ios":
              return await this.executeiOSOpenURL(url);
            default:
              throw new Error(`Unsupported platform: ${this.device.platform}`);
          }
        } catch (error) {
          return {
            success: false,
            url,
            error: `Failed to open URL: ${error instanceof Error ? error.message : String(error)}`
          };
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
