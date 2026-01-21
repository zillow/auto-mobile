import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, HomeScreenResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { XCTestServiceClient } from "../observe/XCTestServiceClient";

/**
 * Navigates to the home screen using the hardware home button (keyevent 3).
 * This works universally on all Android devices regardless of navigation mode.
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
            // Press hardware home button (keycode 3) - works on all Android devices
            await perf.track("hardwareNavigation", () =>
              this.adb.executeCommand("shell input keyevent 3")
            );
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

  private async executeIosHomeNavigation(): Promise<void> {
    const client = XCTestServiceClient.getInstance(this.device);
    const result = await client.requestPressHome();
    if (!result.success) {
      throw new Error(result.error ?? "Failed to press iOS home button");
    }
  }
}
