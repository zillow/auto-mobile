import { AdbClient } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, SelectAllTextResult } from "../../models";
import { AxeClient } from "../../utils/ios-cmdline-tools/axe";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { logger } from "../../utils/logger";

export class SelectAllText extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null) {
    super(device, adb, axe);
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
              // iOS implementation could use similar accessibility approach
              // For now, fall back to error
              perf.end();
              throw new Error("Select all not yet implemented for iOS");
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
   * Execute Android-specific select all using accessibility service.
   * Uses ACTION_SET_SELECTION which is significantly faster than ADB double-tap.
   */
  private async executeAndroidSelectAll(): Promise<SelectAllTextResult> {
    const a11yClient = AccessibilityServiceClient.getInstance(this.device, this.adb);
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
