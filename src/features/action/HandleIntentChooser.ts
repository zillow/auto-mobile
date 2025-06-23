import { logger } from "../../utils/logger";
import { DeepLinkManager } from "../../utils/deepLinkManager";
import { ObserveScreen } from "../observe/ObserveScreen";
import { IntentChooserResult } from "../../models";

export class HandleIntentChooser {
  private deviceId: string | null;
  private deepLinkManager: DeepLinkManager;
  private observeScreen: ObserveScreen;

  constructor(deviceId: string | null = null) {
    this.deviceId = deviceId;
    this.deepLinkManager = new DeepLinkManager(deviceId);
    this.observeScreen = new ObserveScreen(deviceId);
  }

  /**
   * Execute intent chooser handling
   * @param preference - User preference for handling ("always", "just_once", or "custom")
   * @param customAppPackage - Optional specific app package to select for custom preference
   * @param viewHierarchy - Optional view hierarchy XML, will observe screen if not provided
   * @returns Promise with intent chooser handling results
   */
  async execute(
    preference: "always" | "just_once" | "custom" = "just_once",
    customAppPackage?: string,
    viewHierarchy?: string
  ): Promise<IntentChooserResult> {
    try {
      logger.info(`[HandleIntentChooser] Starting intent chooser handling with preference: ${preference}`);

      let hierarchyXml = viewHierarchy;
      let observation = null;

      if (!hierarchyXml) {
        // Observe the screen to get current view hierarchy
        observation = await this.observeScreen.execute();
        if (!observation.viewHierarchy) {
          throw new Error("Could not get view hierarchy for intent chooser handling");
        }
        hierarchyXml = observation.viewHierarchy;
      }

      // Ensure hierarchyXml is a string before passing to handleIntentChooser
      if (typeof hierarchyXml !== "string") {
        throw new Error("View hierarchy must be a string");
      }

      const result = await this.deepLinkManager.handleIntentChooser(hierarchyXml, preference, customAppPackage);

      // Get updated observation after handling
      if (result.success && result.detected) {
        try {
          const updatedObservation = await this.observeScreen.execute();
          result.observation = updatedObservation;
        } catch (observeError) {
          logger.warn(`[HandleIntentChooser] Failed to get updated observation: ${observeError}`);
          result.observation = observation;
        }
      } else {
        result.observation = observation;
      }

      logger.info(`[HandleIntentChooser] Intent chooser handling completed. Success: ${result.success}, Detected: ${result.detected}`);

      return result;
    } catch (error) {
      logger.error(`[HandleIntentChooser] Failed to handle intent chooser: ${error}`);

      return {
        success: false,
        detected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
