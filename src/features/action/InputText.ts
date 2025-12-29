import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, SendTextResult } from "../../models";
import { logger } from "../../utils/logger";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";

export class InputText extends BaseVisualChange {
  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  async execute(
    text: string,
    imeAction?: "done" | "next" | "search" | "send" | "go" | "previous"
  ): Promise<SendTextResult & { method?: "a11y" }> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("inputText");

    // Validate text input
    if (text === undefined || text === null) {
      perf.end();
      return {
        success: false,
        text: "",
        error: "No text provided",
        method: "a11y"
      };
    }

    return this.observedInteraction(
      async () => {
        try {
          // Platform-specific text input execution
          switch (this.device.platform) {
            case "android":
              return await perf.track("androidTextInput", () =>
                this.executeAndroidTextInput(text, imeAction)
              );
            case "ios":
              return await perf.track("iOSTextInput", () =>
                this.executeiOSTextInput(text, imeAction)
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
            text,
            error: `Failed to send text input: ${errorMessage}`,
            method: "a11y"
          };
        }
      },
      {
        changeExpected: true,
        tolerancePercent: 0.00,
        timeoutMs: 5000,
        perf,
        skipUiStability: true // Skip UI stability wait - a11y service already waits 100ms for tree update
      }
    );
  }

  /**
   * Execute Android-specific text input using accessibility service
   * @param text - Text to input
   * @param imeAction - Optional IME action
   * @returns Result with method information
   */
  private async executeAndroidTextInput(
    text: string,
    imeAction?: "done" | "next" | "search" | "send" | "go" | "previous"
  ): Promise<SendTextResult & { method?: "a11y" }> {
    // Use accessibility service exclusively (fastest method, ~10-30ms vs ~200-300ms for ADB)
    // It also natively supports Unicode without needing virtual keyboard
    const a11yClient = AccessibilityServiceClient.getInstance(this.device, this.adb);
    const a11yResult = await a11yClient.requestSetText(text);

    if (a11yResult.success) {
      logger.info(`[InputText] Text input via accessibility service: ${a11yResult.totalTimeMs}ms`);

      // Handle IME action if specified
      if (imeAction) {
        await this.executeImeAction(imeAction);
      }

      return {
        success: true,
        text,
        imeAction,
        method: "a11y"
      };
    }

    // Return failure - no fallback methods
    logger.warn(`[InputText] Accessibility service setText failed: ${a11yResult.error}`);
    return {
      success: false,
      text,
      error: `Accessibility service setText failed: ${a11yResult.error}`,
      method: "a11y"
    };
  }

  /**
   * Execute iOS-specific text input
   * @param text - Text to input
   * @param imeAction - Optional IME action (ignored on iOS)
   * @returns Result with method information
   */
  private async executeiOSTextInput(
    text: string,
    imeAction?: "done" | "next" | "search" | "send" | "go" | "previous"
  ): Promise<SendTextResult & { method?: "a11y" }> {
    // iOS uses idb's inputText method which handles Unicode natively
    await this.axe.inputText(text);

    // Note: iOS IME actions are handled differently and imeAction parameter is ignored
    // The iOS keyboard handles actions through its own UI

    return {
      success: true,
      text,
      imeAction: imeAction, // Preserved for API compatibility but not used on iOS
      method: "a11y"
    };
  }

  private async executeImeAction(imeAction: string): Promise<void> {
    // Map IME actions to Android key codes
    const imeKeyCodeMap: { [key: string]: string } = {
      "done": "KEYCODE_ENTER",
      "next": "KEYCODE_TAB",
      "search": "KEYCODE_SEARCH",
      "send": "KEYCODE_ENTER",
      "go": "KEYCODE_ENTER",
      "previous": "KEYCODE_SHIFT_LEFT KEYCODE_TAB" // Shift+Tab for previous
    };

    const keyCode = imeKeyCodeMap[imeAction];
    if (keyCode) {
      // Small delay to ensure text input is processed
      await new Promise(resolve => setTimeout(resolve, 100));

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
    }
  }
}
