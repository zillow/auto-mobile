import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "../../utils/logger";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { BootedDevice, RawViewHierarchyResult } from "../../models";
import { ViewHierarchy } from "../observe/ViewHierarchy";
import { AccessibilityServiceClient } from "../observe/AccessibilityServiceClient";
import { XCTestServiceClient } from "../observe/XCTestServiceClient";
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
  private readonly adb: AdbExecutor;
  private viewHierarchy: ViewHierarchy;
  private accessibilityServiceClient: AccessibilityServiceClient;
  private timer: Timer;

  constructor(
    device: BootedDevice,
    adbFactory: AdbClientFactory = defaultAdbClientFactory,
    timer: Timer = defaultTimer
  ) {
    this.device = device;
    this.adb = adbFactory.create(device);
    this.viewHierarchy = new ViewHierarchy(device, adbFactory);
    this.accessibilityServiceClient = AccessibilityServiceClient.getInstance(device, adbFactory);
    this.timer = timer;
  }

  /**
   * Execute raw view hierarchy extraction
   * @param options - Options for extraction
   * @returns Raw hierarchy data
   */
  async execute(options: RawViewHierarchyOptions = {}): Promise<RawViewHierarchyResult> {
    const startTime = this.timer.now();

    const result: RawViewHierarchyResult = {
      source: this.device.platform === "ios" ? "xcuitest" : (options.source || "both"),
      timestamp: startTime,
      device: {
        deviceId: this.device.deviceId,
        platform: this.device.platform
      }
    };

    const errors: string[] = [];

    try {
      if (this.device.platform === "ios") {
        // iOS: Get raw XCUITest hierarchy (ignore source parameter)
        logger.info("[RawViewHierarchy] Extracting via XCTestService");
        try {
          const xcTestClient = XCTestServiceClient.getInstance(this.device);
          const hierarchyResult = await xcTestClient.requestHierarchySync(
            new NoOpPerformanceTracker(),
            true // disableAllFiltering = true
          );
          if (hierarchyResult?.hierarchy) {
            result.xcuitest = JSON.stringify(hierarchyResult.hierarchy, null, 2);
            logger.info(`[RawViewHierarchy] Got XCUITest JSON (${result.xcuitest.length} bytes)`);
          } else {
            errors.push("XCTestService returned no data");
          }
        } catch (error) {
          const errorMsg = `XCTestService failed: ${error}`;
          errors.push(errorMsg);
          logger.warn(`[RawViewHierarchy] ${errorMsg}`);
        }
      } else {
        // Android: Use existing implementation
        const source = options.source || "both";

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
            const hierarchy = await this.accessibilityServiceClient.getAccessibilityHierarchy(
              undefined,
              perf,
              false,
              0,
              true // disableAllFiltering - get unfiltered/unoptimized hierarchy
            );

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

        // Adjust source based on what we actually got
        if (source === "both") {
          if (result.xml && !result.json) {
            result.source = "uiautomator";
          } else if (!result.xml && result.json) {
            result.source = "accessibility-service";
          }
        }
      }

      if (errors.length > 0) {
        result.error = errors.join("; ");
      }

      const duration = this.timer.now() - startTime;
      logger.info(`[RawViewHierarchy] Completed in ${duration}ms`);

      return result;
    } catch (error) {
      logger.error(`[RawViewHierarchy] Failed: ${error}`);
      result.error = `${error}`;
      return result;
    }
  }
}
