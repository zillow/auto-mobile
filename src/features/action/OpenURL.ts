import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, OpenURLResult } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class OpenURL extends BaseVisualChange {
  constructor(device: BootedDevice, adb: AdbUtils | null = null, idb: IdbPython | null = null) {
    super(device, adb, idb);
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
