import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, PressButtonResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { XCTestServiceClient } from "../observe/XCTestServiceClient";

export class PressButton extends BaseVisualChange {
  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    super(device, adb);
    this.device = device;
  }

  async execute(
    button: string,
    progress?: ProgressCallback
  ): Promise<PressButtonResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("pressButton");

    return this.observedInteraction(
      async () => {
        try {
          // Platform-specific button press execution
          switch (this.device.platform) {
            case "android":
              return await perf.track("androidButtonPress", () =>
                this.executeAndroidButtonPress(button)
              );
            case "ios":
              return await perf.track("iOSButtonPress", () =>
                this.executeiOSButtonPress(button)
              );
            default:
              perf.end();
              throw new Error(`Unsupported platform: ${this.device.platform}`);
          }
        } catch (error) {
          perf.end();
          return {
            success: false,
            button,
            keyCode: -1,
            error: `Failed to press button: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      },
      {
        changeExpected: true,
        timeoutMs: 2000, // Reduce timeout for faster execution
        progress,
        perf
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
    const normalizedButton = button.toLowerCase();
    if (normalizedButton !== "home") {
      return {
        success: false,
        button,
        keyCode: -1,
        error: `Unsupported iOS button: ${button}`
      };
    }

    const client = XCTestServiceClient.getInstance(this.device);
    const result = await client.requestPressHome();

    if (!result.success) {
      return {
        success: false,
        button,
        keyCode: -1,
        error: result.error ?? "Failed to press iOS home button"
      };
    }

    return {
      success: true,
      button,
      keyCode: -1
    };
  }
}
