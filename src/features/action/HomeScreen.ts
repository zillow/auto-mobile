import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, HomeScreenResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { CtrlProxyClient } from "../observe/ios";
import { CtrlProxyClient as AndroidCtrlProxyClient } from "../observe/android";
import { logger } from "../../utils/logger";

/**
 * Navigates to the home screen using the accessibility service global action
 * (preferred) or hardware home button keyevent (fallback).
 */
export class HomeScreen extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    super(device, adb);
    this.device = device;
  }

  async execute(progress?: ProgressCallback): Promise<HomeScreenResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("homeScreen");

    return await this.observedInteraction(
      async () => {
        switch (this.device.platform) {
          case "android":
            await perf.track("homeNavigation", () => this.executeAndroidHome());
            break;
          case "ios":
            await perf.track("iOSHomeNavigation", () => this.executeIosHomeNavigation());
            break;
          default:
            throw new Error(`Unsupported platform: ${this.device.platform}`);
        }

        return {
          success: true,
          navigationMethod: "hardware"
        };
      },
      {
        changeExpected: true,
        timeoutMs: 5000,
        progress,
        perf
      }
    );
  }

  private async executeAndroidHome(): Promise<void> {
    try {
      const client = AndroidCtrlProxyClient.getInstance(this.device, this.adbFactory);
      const result = await client.requestGlobalAction("home", 3000);
      if (result.success) {
        logger.debug("[HOME] Used accessibility service global action");
        return;
      }
      logger.debug(`[HOME] Global action failed (${result.error}), falling back to ADB keyevent`);
    } catch {
      // Fall through to ADB
    }
    await this.adb.executeCommand("shell input keyevent 3");
  }

  private async executeIosHomeNavigation(): Promise<void> {
    const client = CtrlProxyClient.getInstance(this.device);
    const result = await client.requestPressHome();
    if (!result.success) {
      throw new Error(result.error ?? "Failed to press iOS home button");
    }
  }
}
