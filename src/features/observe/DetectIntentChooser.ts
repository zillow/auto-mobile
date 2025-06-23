import { logger } from "../../utils/logger";
import { DeepLinkManager } from "../../utils/deepLinkManager";
import { ObserveScreen } from "./ObserveScreen";
import { IntentChooserResult } from "../../models";

export class DetectIntentChooser {
  private deviceId: string | null;
  private deepLinkManager: DeepLinkManager;
  private observeScreen: ObserveScreen;

  constructor(deviceId: string | null = null) {
    this.deviceId = deviceId;
    this.deepLinkManager = new DeepLinkManager(deviceId);
    this.observeScreen = new ObserveScreen(deviceId);
  }

  /**
     * Execute intent chooser detection
     * @param viewHierarchy - Optional view hierarchy XML, will observe screen if not provided
     * @returns Promise with intent chooser detection results
     */
  async execute(viewHierarchy?: string): Promise<IntentChooserResult> {
    try {
      logger.info("[DetectIntentChooser] Starting intent chooser detection");

      let hierarchyXml = viewHierarchy;
      let observation = null;

      if (!hierarchyXml) {
        // Observe the screen to get current view hierarchy
        observation = await this.observeScreen.execute();
        if (!observation.viewHierarchy) {
          throw new Error("Could not get view hierarchy for intent chooser detection");
        }
        hierarchyXml = observation.viewHierarchy;
      }

      // Ensure hierarchyXml is a string before passing to detectIntentChooser
      if (typeof hierarchyXml !== "string") {
        throw new Error("View hierarchy must be a string");
      }

      const detected = this.deepLinkManager.detectIntentChooser(hierarchyXml);

      logger.info(`[DetectIntentChooser] Intent chooser detection completed. Detected: ${detected}`);

      return {
        success: true,
        detected,
        observation
      };
    } catch (error) {
      logger.error(`[DetectIntentChooser] Failed to detect intent chooser: ${error}`);

      return {
        success: false,
        detected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
