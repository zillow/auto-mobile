import { AdbUtils } from "../../utils/adb";
import { ActiveWindowInfo } from "../../models/ActiveWindowInfo";
import { logger } from "../../utils/logger";
import { CryptoUtils } from "../../utils/crypto";

export class Window {
  private adb: AdbUtils;

  /**
   * Create a Window instance
   * @param deviceId - Optional device ID
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
  }

  /**
   * Get information about the active window
   * @returns Promise with active window information
   */
  async getActive(): Promise<ActiveWindowInfo> {
    try {
      const { stdout } = await this.adb.executeCommand(`shell "dumpsys window windows"`);

      // Default values
      let activityName = "";
      let packageName = "";
      let layoutSeqSum = 0;

      // First try to get from imeControlTarget (original approach)
      const imeControlMatch = stdout.match(/imeControlTarget in display# 0 Window\{[^}]+\s+([\w\.]+)\/([\w\.]+)\}/);

      if (imeControlMatch && imeControlMatch.length >= 3) {
        packageName = imeControlMatch[1];
        activityName = imeControlMatch[2];
      } else {
        // Handle Pop-Up Window case
        const popupControlMatch = stdout.match(/imeControlTarget in display# 0 Window\{([a-f0-9]+) u0 Pop-Up Window\}/);

        if (popupControlMatch) {
          const hexRef = popupControlMatch[1];
          // Find the corresponding Window entry for this hex reference
          const windowRegex = new RegExp(`Window #\\d+ Window\\{${hexRef} u0 Pop-Up Window\\}:([\\s\\S]*?)(?=Window #\\d+|$)`);
          const windowMatch = stdout.match(windowRegex);

          if (windowMatch) {
            // Look for mActivityRecord line within this window block
            const activityRecordMatch = windowMatch[1].match(/mActivityRecord=ActivityRecord\{[^}]+ u0 ([\w\.]+)\/([\w\.]+) t\d+\}/);

            if (activityRecordMatch && activityRecordMatch.length >= 3) {
              packageName = activityRecordMatch[1];
              activityName = activityRecordMatch[2];
            }
          }
        }

        // If still no match, try fallback approaches
        if (!packageName || !activityName) {
          // Fallback: Look for visible application windows (not system UI)
          const visibleAppMatches = stdout.matchAll(/Window\{[^}]+ u0 ([\w\.]+)\/([\w\.]+)\}:[^}]+?mViewVisibility=0x0[^}]+?isOnScreen=true[^}]+?isVisible=true/gs);

          for (const match of visibleAppMatches) {
            if (match[1] && match[2] && !match[1].includes("android.systemui") && !match[1].includes("nexuslauncher")) {
              packageName = match[1];
              activityName = match[2];
              break; // Use the first visible app window found
            }
          }

          // If still no match, try a broader pattern for any application window
          if (!packageName || !activityName) {
            const anyAppMatch = stdout.match(/Window\{[^}]+ u0 ([\w\.]+)\/([\w\.]+)\}:[^}]+?ty=BASE_APPLICATION/);
            if (anyAppMatch && anyAppMatch.length >= 3) {
              packageName = anyAppMatch[1];
              activityName = anyAppMatch[2];
            }
          }
        }
      }

      // Extract layout sequence sum from all windows
      const layoutSeqMatches = stdout.matchAll(/mLayoutSeq=([\d\.]+)/g);

      if (layoutSeqMatches) {
        // for each layoutSeqMatch, add up into layoutSeqSum
        for (const match of layoutSeqMatches) {
          // if layoutSeq is an integer
          const layoutSeqInt = parseInt(match[1], 10);
          if (!isNaN(layoutSeqInt)) {
            layoutSeqSum += layoutSeqInt;
          }
        }
      }

      return { appId: packageName, activityName, layoutSeqSum };
    } catch (err) {
      logger.error(`Failed to get active window information: ${err}`);
      return {
        appId: "",
        activityName: "",
        layoutSeqSum: 0
      };
    }
  }

  /**
   * Get a hash of the current activity name
   * @returns Promise with activity name hash
   */
  async getActiveHash(): Promise<string> {
    const activeWindow = await this.getActive();
    const activityString = JSON.stringify(activeWindow);
    return CryptoUtils.generateCacheKey(activityString);
  }
}
