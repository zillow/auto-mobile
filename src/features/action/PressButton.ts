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

  // Buttons that typically cause UI/navigation changes (dismiss keyboard, go home, lock screen, etc.)
  // These should wait for hierarchy changes to ensure fresh observation data
  private static readonly NAVIGATION_BUTTONS = new Set(["back", "home", "recent", "power"]);

  async execute(
    button: string,
    progress?: ProgressCallback
  ): Promise<PressButtonResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("pressButton");

    // Navigation buttons (back, home, recent, power) typically cause UI changes like
    // dismissing keyboard, navigating screens, or showing lock screen. We set
    // changeExpected=true so the observation waits for the hierarchy to actually change.
    // Hardware buttons (volume, menu) don't change the hierarchy.
    const isNavigationButton = PressButton.NAVIGATION_BUTTONS.has(button.toLowerCase());

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
        changeExpected: isNavigationButton,
        timeoutMs: 2000,
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
