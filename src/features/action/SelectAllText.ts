import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, SelectAllTextResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { CtrlProxyClient as AndroidCtrlProxyClient } from "../observe/android";
import { CtrlProxyClient as IOSCtrlProxyClient } from "../observe/ios";
import { logger } from "../../utils/logger";

export class SelectAllText extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    super(device, adb);
  }

  async execute(progress?: ProgressCallback): Promise<SelectAllTextResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("selectAllText");

    return this.observedInteraction(
      async () => {
        try {
          // Platform-specific select all execution
          switch (this.device.platform) {
            case "android":
              return await perf.track("androidSelectAll", () =>
                this.executeAndroidSelectAll()
              );
            case "ios":
              return await perf.track("iOSSelectAll", () =>
                this.executeiOSSelectAll()
              );
            default:
              perf.end();
              throw new Error(`Unsupported platform: ${this.device.platform}`);
          }
        } catch (error) {
          perf.end();
          return {
            success: false,
            error: `Failed to select all text: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      },
      {
        changeExpected: false,
        tolerancePercent: 0,
        timeoutMs: 500,
        progress,
        perf,
        skipUiStability: true // Skip UI stability wait - a11y service is fast
      }
    );
  }

  /**
   * Execute iOS-specific select all using CtrlProxy iOS.
   */
  private async executeiOSSelectAll(): Promise<SelectAllTextResult> {
    try {
      const client = IOSCtrlProxyClient.getInstance(this.device);
      const result = await client.requestSelectAll();

      if (result.success) {
        logger.info(`[SelectAllText] Select all via CtrlProxy iOS`);
        return { success: true };
      }

      logger.warn(`[SelectAllText] CtrlProxy iOS selectAll failed: ${result.error}`);
      return { success: false, error: result.error };
    } catch (error) {
      logger.error(`[SelectAllText] CtrlProxy iOS exception: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Execute Android-specific select all using accessibility service.
   * Uses ACTION_SET_SELECTION which is significantly faster than ADB double-tap.
   */
  private async executeAndroidSelectAll(): Promise<SelectAllTextResult> {
    const a11yClient = AndroidCtrlProxyClient.getInstance(this.device, this.adb);
    const a11yResult = await a11yClient.requestSelectAll();

    if (a11yResult.success) {
      logger.info(`[SelectAllText] Select all via accessibility service: ${a11yResult.totalTimeMs}ms`);
      return {
        success: true
      };
    }

    // Return failure
    logger.warn(`[SelectAllText] Accessibility service selectAll failed: ${a11yResult.error}`);
    return {
      success: false,
      error: `Accessibility service selectAll failed: ${a11yResult.error}`
    };
  }
}
