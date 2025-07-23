import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, PressButtonResult } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class PressButton extends BaseVisualChange {
  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb, idb);
    this.device = device;
  }

  async execute(
    button: string,
    progress?: ProgressCallback
  ): Promise<PressButtonResult> {
    return this.observedInteraction(
      async () => {
        try {
          // Platform-specific button press execution
          switch (this.device.platform) {
            case "android":
              return await this.executeAndroidButtonPress(button);
            case "ios":
              return await this.executeiOSButtonPress(button);
            default:
              throw new Error(`Unsupported platform: ${this.device.platform}`);
          }
        } catch (error) {
          return {
            success: false,
            button,
            keyCode: -1,
            error: `Failed to press button: ${error instanceof Error ? error.message : String(error)}`
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

  /**
   * Execute Android-specific button press
   * @param button - Button name to press
   * @returns Result of the button press operation
   */
  private async executeAndroidButtonPress(button: string): Promise<PressButtonResult> {
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

    await this.adb.executeCommand(`shell input keyevent ${keyCode}`);

    return {
      success: true,
      button,
      keyCode
    };
  }

  /**
   * Execute iOS-specific button press
   * @param button - Button name to press
   * @returns Result of the button press operation
   */
  private async executeiOSButtonPress(button: string): Promise<PressButtonResult> {
    // Map common button names to iOS IdbButton types
    const iOSButtonMap: Record<string, string> = {
      "home": "HOME",
      "power": "LOCK",
      "lock": "LOCK",
      "side_button": "SIDE_BUTTON",
      "siri": "SIRI",
      "apple_pay": "APPLE_PAY"
    };

    const iOSButton = iOSButtonMap[button.toLowerCase()];
    if (!iOSButton) {
      return {
        success: false,
        button,
        keyCode: -1,
        error: `Unsupported iOS button: ${button}. Supported buttons: ${Object.keys(iOSButtonMap).join(", ")}`
      };
    }

    await this.idb.pressButton(iOSButton as any);

    return {
      success: true,
      button,
      keyCode: 0, // iOS doesn't use keycodes, using 0 as placeholder
    };
  }
}
