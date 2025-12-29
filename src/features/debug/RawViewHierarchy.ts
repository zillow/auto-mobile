import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { logger } from "../../utils/logger";
import { BootedDevice, RawViewHierarchyResult } from "../../models";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

export interface RawViewHierarchyOptions {
  /**
   * Source to use for hierarchy extraction
   * - uiautomator: Use uiautomator dump (slower but more reliable)
   * - accessibility-service: Use accessibility service WebSocket (faster but requires service)
   * - both: Get from both sources for comparison
   */
  source?: "uiautomator" | "accessibility-service" | "both";
}

/**
 * Feature to extract raw view hierarchy without parsing
 * Useful for debugging when parsed hierarchy doesn't match expected results
 */
export class RawViewHierarchy {
  private device: BootedDevice;
  private readonly adb: AdbClient;
  private viewHierarchy: ViewHierarchy;
  private accessibilityServiceClient: AccessibilityServiceClient;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null
  ) {
    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.viewHierarchy = new ViewHierarchy(device, this.adb);
    this.accessibilityServiceClient = AccessibilityServiceClient.getInstance(device, this.adb);
  }

  /**
   * Execute raw view hierarchy extraction
   * @param options - Options for extraction
   * @returns Raw hierarchy data
   */
  async execute(options: RawViewHierarchyOptions = {}): Promise<RawViewHierarchyResult> {
    const source = options.source || "both";
    const startTime = Date.now();

    const result: RawViewHierarchyResult = {
      source,
      timestamp: startTime,
      device: {
        deviceId: this.device.deviceId,
        platform: this.device.platform
      }
    };

    const errors: string[] = [];

    try {
      if (source === "uiautomator" || source === "both") {
        logger.info("[RawViewHierarchy] Extracting via uiautomator dump");
        try {
          const xml = await this.viewHierarchy.executeUiAutomatorDump();
          result.xml = xml;
          logger.info(`[RawViewHierarchy] Got XML (${xml.length} bytes)`);
        } catch (error) {
          const errorMsg = `uiautomator dump failed: ${error}`;
          errors.push(errorMsg);
          logger.warn(`[RawViewHierarchy] ${errorMsg}`);
        }
      }

      if (source === "accessibility-service" || source === "both") {
        logger.info("[RawViewHierarchy] Extracting via accessibility service");
        try {
          const perf = new NoOpPerformanceTracker();
          const hierarchy = await this.accessibilityServiceClient.getAccessibilityHierarchy(undefined, perf);

          if (hierarchy) {
            // Get the raw hierarchy data before conversion
            result.json = JSON.stringify(hierarchy, null, 2);
            logger.info(`[RawViewHierarchy] Got JSON (${result.json.length} bytes)`);
          } else {
            errors.push("accessibility-service returned no data");
          }
        } catch (error) {
          const errorMsg = `accessibility-service failed: ${error}`;
          errors.push(errorMsg);
          logger.warn(`[RawViewHierarchy] ${errorMsg}`);
        }
      }

      if (errors.length > 0) {
        result.error = errors.join("; ");
      }

      // Adjust source based on what we actually got
      if (source === "both") {
        if (result.xml && !result.json) {
          result.source = "uiautomator";
        } else if (!result.xml && result.json) {
          result.source = "accessibility-service";
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`[RawViewHierarchy] Completed in ${duration}ms`);

      return result;
    } catch (error) {
      logger.error(`[RawViewHierarchy] Failed: ${error}`);
      result.error = `${error}`;
      return result;
    }
  }
}
