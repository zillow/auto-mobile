import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { PressButtonResult } from "../../models/PressButtonResult";

export class PressButton extends BaseVisualChange {
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  async execute(
    button: string,
    progress?: ProgressCallback
  ): Promise<PressButtonResult> {
    const keyCodeMap: Record<string, number> = {
      "home": 3,
      "back": 4,
      "menu": 82,
      "power": 26,
      "volume_up": 24,
      "volume_down": 25,
      "recent": 187,
    };

    const keyCode = keyCodeMap[button.toLowerCase()];
    if (!keyCode) {
      return {
        success: false,
        button,
        keyCode: -1,
        error: `Unsupported button: ${button}`
      };
    }

    return this.observedChange(
      async () => {
        try {
          await this.adb.executeCommand(`shell input keyevent ${keyCode}`);

          return {
            success: true,
            button,
            keyCode
          };
        } catch (error) {
          return {
            success: false,
            button,
            keyCode,
            error: "Failed to press button"
          };
        }
      },
      {
        changeExpected: false,
        timeoutMs: 2000, // Reduce timeout for faster execution
        progress
      }
    );
  }
}
