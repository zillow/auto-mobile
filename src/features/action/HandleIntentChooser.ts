import { DeepLinkManager } from "../../utils/deepLinkManager";
import { BootedDevice, IntentChooserResult, ObserveResult } from "../../models";
import { BaseVisualChange } from "./BaseVisualChange";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class HandleIntentChooser extends BaseVisualChange {
  private device: BootedDevice;
  private deepLinkManager: DeepLinkManager;

  /**
   * Create an TerminateApp instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param idb - Optional IdbPython instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb, idb);
    this.device = device;
    this.deepLinkManager = new DeepLinkManager(device);
  }

  /**
   * Execute intent chooser handling
   * @param preference - User preference for handling ("always", "just_once", or "custom")
   * @param customAppPackage - Optional specific app package to select for custom preference
   * @returns Promise with intent chooser handling results
   */
  async execute(
    preference: "always" | "just_once" | "custom" = "just_once",
    customAppPackage?: string
  ): Promise<IntentChooserResult> {

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {

        const viewHierarchy = observeResult.viewHierarchy;
        if (!viewHierarchy) {
          return { success: false, error: "View hierarchy not found" };
        }

        return await this.deepLinkManager.handleIntentChooser(
          viewHierarchy,
          preference,
          customAppPackage
        );
      },
      {
        changeExpected: false,
        timeoutMs: 500,
      }
    );
  }
}
