import { DeepLinkManager } from "../../utils/deepLinkManager";
import { IntentChooserResult, ObserveResult } from "../../models";
import { BaseVisualChange } from "./BaseVisualChange";
import { AdbUtils } from "../../utils/adb";

export class HandleIntentChooser extends BaseVisualChange {
  private deviceId: string;
  private deepLinkManager: DeepLinkManager;

  /**
   * Create an TerminateApp instance
   * @param deviceId - Optional device ID
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
    this.deviceId = deviceId;
    this.deepLinkManager = new DeepLinkManager(deviceId);
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
