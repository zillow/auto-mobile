import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { OpenURLResult } from "../../models/OpenURLResult";

export class OpenURL extends BaseVisualChange {
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  async execute(
    url: string,
  ): Promise<OpenURLResult> {
    // Validate URL
    if (!url || !url.trim()) {
      return {
        success: false,
        url: url || "",
        error: "Invalid URL provided"
      };
    }

    return this.observedInteraction(
      async () => {
        try {
          await this.adb.executeCommand(`shell am start -a android.intent.action.VIEW -d "${url}"`);

          return {
            success: true,
            url
          };
        } catch (error) {
          return {
            success: false,
            url,
            error: "Failed to open URL"
          };
        }
      },
      {
        changeExpected: false,
        timeoutMs: 12000
      }
    );
  }
}
