import { logger } from "../../utils/logger";
import { DeepLinkManager } from "../../utils/deepLinkManager";
import { BootedDevice, IntentChooserResult, ObserveResult } from "../../models";
import { BaseVisualChange } from "../action/BaseVisualChange";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";

export class DetectIntentChooser extends BaseVisualChange {
  private deepLinkManager: DeepLinkManager;

  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    super(device, adb);
    this.deepLinkManager = new DeepLinkManager(device);
  }

  /**
     * Execute intent chooser detection
     * @returns Promise with intent chooser detection results
     */
  async execute(): Promise<IntentChooserResult> {
    return this.observedInteraction(
      async (observeResult: ObserveResult) => {
        try {

          const viewHierarchy = observeResult.viewHierarchy;
          if (!viewHierarchy) {
            return { success: false, error: "View hierarchy not found" };
          }

          logger.info("[DetectIntentChooser] Starting intent chooser detection");
          const detected = this.deepLinkManager.detectIntentChooser(viewHierarchy);

          logger.info(`[DetectIntentChooser] Intent chooser detection completed. Detected: ${detected}`);

          return {
            success: true,
            detected
          };
        } catch (error) {
          logger.error(`[DetectIntentChooser] Failed to detect intent chooser: ${error}`);

          return {
            success: false,
            detected: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      },
      {
        changeExpected: false
      }
    );
  }
}
