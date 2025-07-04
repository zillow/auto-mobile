import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { ImeActionResult } from "../../models";
import { logger } from "../../utils/logger";

export class ImeAction extends BaseVisualChange {
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  async execute(
    action: "done" | "next" | "search" | "send" | "go" | "previous",
    progress?: ProgressCallback
  ): Promise<ImeActionResult> {
    // Validate action input
    if (!action) {
      return {
        success: false,
        action: "",
        error: "No IME action provided"
      };
    }

    return this.observedInteraction(
      async () => {
        try {
          await this.executeImeAction(action);

          return {
            success: true,
            action
          };
        } catch (error) {
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
        progress
      }
    );
  }

  private async executeImeAction(imeAction: string): Promise<void> {
    logger.info("Executing IME action", { action: imeAction });

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
    if (!keyCode) {
      throw new Error(`Unsupported IME action: ${imeAction}`);
    }

    // Small delay to ensure any preceding text input is processed
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
