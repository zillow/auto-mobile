import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, ImeActionResult, ObserveResult } from "../../models";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { XCTestServiceClient } from "../observe/XCTestServiceClient";
import { AccessibilityService } from "../observe/interfaces/AccessibilityService";
import { Timer } from "../../utils/interfaces/Timer";
import { defaultTimer } from "../../utils/SystemTimer";

export class ImeAction extends BaseVisualChange {
  private a11yService: AccessibilityService | null = null;
  private imeTimer: Timer;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    a11yService: AccessibilityService | null = null,
    timer: Timer = defaultTimer
  ) {
    super(device, adb, timer);
    this.a11yService = a11yService;
    this.imeTimer = timer;
  }

  async execute(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    progress?: ProgressCallback
  ): Promise<ImeActionResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("imeAction");

    // Validate action input
    if (!action) {
      perf.end();
      return {
        success: false,
        action: "",
        error: "No IME action provided"
      };
    }

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        try {
          // Platform-specific IME action execution
          switch (this.device.platform) {
            case "android":
              return await perf.track("androidImeAction", () =>
                this.executeAndroidImeAction(action, observeResult)
              );
            case "ios":
              return await perf.track("iOSImeAction", () =>
                this.executeiOSImeAction(action, observeResult)
              );
            default:
              perf.end();
              throw new Error(`Unsupported platform: ${this.device.platform}`);
          }
        } catch (error) {
          perf.end();
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            action,
            error: `Failed to execute IME action: ${errorMessage}`
          };
        }
      },
      {
        changeExpected: true,
        tolerancePercent: 0.00,
        timeoutMs: 3000, // IME actions should be quick
        progress,
        perf,
        skipUiStability: true // Skip UI stability wait - a11y service already waits for quiescence
      }
    );
  }

  /**
   * Execute Android-specific IME action using accessibility service.
   * Falls back to ADB key events if a11y service is unavailable.
   */
  private async executeAndroidImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    _observeResult: ObserveResult
  ): Promise<ImeActionResult> {
    // Use provided a11y service or get default instance
    const a11yClient = this.a11yService || AccessibilityServiceClient.getInstance(this.device, this.adb);
    const a11yResult = await a11yClient.requestImeAction(action);

    if (a11yResult.success) {
      logger.info(`[ImeAction] IME action '${action}' completed via accessibility service: ${a11yResult.totalTimeMs}ms`);
      return { success: true, action };
    }

    // Fall back to ADB key events
    logger.warn(`[ImeAction] Accessibility service IME action failed: ${a11yResult.error}, falling back to ADB`);
    return this.executeAdbImeAction(action);
  }

  /**
   * [LEGACY] Execute IME action using ADB key events.
   * Kept as fallback if accessibility service is unavailable.
   * NOTE: This approach has known issues - KEYCODE_TAB inserts tab characters
   * instead of moving focus between fields.
   */
  private async executeAdbImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous"
  ): Promise<ImeActionResult> {
    logger.info("Executing IME action via ADB", { action });

    // Map IME actions to Android key codes
    // NOTE: KEYCODE_TAB doesn't work correctly for "next" - it inserts a tab character
    // This fallback is only used if accessibility service is unavailable
    const imeKeyCodeMap: { [key: string]: string } = {
      "done": "KEYCODE_ENTER",
      "next": "KEYCODE_TAB", // WARNING: May insert tab character instead of moving focus
      "search": "KEYCODE_SEARCH",
      "send": "KEYCODE_ENTER",
      "go": "KEYCODE_ENTER",
      "previous": "KEYCODE_SHIFT_LEFT KEYCODE_TAB" // WARNING: May not work correctly
    };

    const keyCode = imeKeyCodeMap[action];
    if (!keyCode) {
      return {
        success: false,
        action,
        error: `Unsupported IME action: ${action}`
      };
    }

    try {
      // Small delay to ensure any preceding text input is processed
      await this.imeTimer.sleep(100);

      // Execute the key event(s)
      if (keyCode.includes(" ")) {
        // Handle multiple key combinations like Shift+Tab
        const keys = keyCode.split(" ");
        for (const key of keys) {
          await this.adb.executeCommand(`shell input keyevent ${key}`);
        }
      } else {
        await this.adb.executeCommand(`shell input keyevent ${keyCode}`);
      }

      return { success: true, action };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        action,
        error: `ADB key event failed: ${errorMessage}`
      };
    }
  }

  /**
   * Execute iOS-specific IME action using XCTestService.
   */
  private async executeiOSImeAction(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    _observeResult: ObserveResult
  ): Promise<ImeActionResult> {
    try {
      const client = XCTestServiceClient.getInstance(this.device);
      const result = await client.requestImeAction(action);

      if (result.success) {
        logger.info(`[ImeAction] IME action '${action}' completed via XCTestService`);
        return { success: true, action };
      }

      logger.warn(`[ImeAction] XCTestService IME action failed: ${result.error}`);
      return { success: false, action, error: result.error };
    } catch (error) {
      logger.error(`[ImeAction] XCTestService exception: ${error}`);
      return { success: false, action, error: String(error) };
    }
  }
}
