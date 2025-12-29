import { AdbClient } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, HomeScreenResult } from "../../models";
import { AxeClient } from "../../utils/ios-cmdline-tools/axe";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

/**
 * Navigates to the home screen using the hardware home button (keyevent 3).
 * This works universally on all Android devices regardless of navigation mode.
 */
export class HomeScreen extends BaseVisualChange {

  constructor(device: BootedDevice, adb: AdbClient | null = null, axe: AxeClient | null = null) {
    super(device, adb, axe);
    this.device = device;
  }

  async execute(progress?: ProgressCallback): Promise<HomeScreenResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("homeScreen");

    return await this.observedInteraction(
      async () => {
        // Press hardware home button (keycode 3) - works on all Android devices
        await perf.track("hardwareNavigation", () =>
          this.adb.executeCommand("shell input keyevent 3")
        );

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
}
