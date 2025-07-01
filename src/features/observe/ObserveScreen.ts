import { logger } from "../../utils/logger";
import { ActiveWindowInfo, ObserveResult } from "../../models";
import { GetScreenSize } from "./GetScreenSize";
import { GetSystemInsets } from "./GetSystemInsets";
import { ViewHierarchy } from "./ViewHierarchy";
import { Window } from "./Window";
import { TakeScreenshot } from "./TakeScreenshot";
import { AdbUtils } from "../../utils/adb";
import { DeepLinkManager } from "../../utils/deepLinkManager";
import { AccessibilityServiceClient } from "./AccessibilityServiceClient";

/**
 * Observe command class that combines screen details, view hierarchy and screenshot
 */
export class ObserveScreen {
  private screenSize: GetScreenSize;
  private systemInsets: GetSystemInsets;
  private viewHierarchy: ViewHierarchy;
  private window: Window;
  private screenshotUtil: TakeScreenshot;
  private adb: AdbUtils;
  private deepLinkManager: DeepLinkManager;

  // Static cache for accessibility service availability (session-wide)
  private static accessibilityServiceAvailable: boolean | null = null;

  // Instance cache for dumpsys window output (per execute call)
  private cachedDumpsysWindow: string | null = null;
  private pendingDumpsysWindow: Promise<string> | null = null;

  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
    this.screenSize = new GetScreenSize(deviceId, this.adb);
    this.systemInsets = new GetSystemInsets(deviceId, this.adb);
    this.viewHierarchy = new ViewHierarchy(deviceId, this.adb);
    this.window = new Window(deviceId, this.adb);
    this.screenshotUtil = new TakeScreenshot(deviceId, this.adb);
    this.deepLinkManager = new DeepLinkManager(deviceId);
  }

  /**
   * Clear the accessibility service availability cache (e.g., on failure)
   */
  public static clearAccessibilityServiceCache(): void {
    ObserveScreen.accessibilityServiceAvailable = null;
    AccessibilityServiceClient.clearAvailabilityCache();
  }

  /**
   * Get cached dumpsys window output or fetch if not available
   */
  private async getCachedDumpsysWindow(): Promise<string> {
    if (this.cachedDumpsysWindow) {
      logger.debug("Using cached dumpsys window output");
      return this.cachedDumpsysWindow;
    }

    // If a fetch is already in progress, wait for it
    if (this.pendingDumpsysWindow) {
      logger.debug("Waiting for pending dumpsys window fetch");
      return this.pendingDumpsysWindow;
    }

    // Start a new fetch and cache the promise
    logger.debug("Fetching fresh dumpsys window output");
    this.pendingDumpsysWindow = this.adb.executeCommand('shell "dumpsys window"')
      .then(result => {
        this.cachedDumpsysWindow = result.stdout;
        this.pendingDumpsysWindow = null;
        return result.stdout;
      })
      .catch(error => {
        this.pendingDumpsysWindow = null;
        throw error;
      });

    return this.pendingDumpsysWindow;
  }

  /**
   * Set cached active window from external source (e.g., UI stability waiting)
   * This now delegates to the Window class
   */
  public setCachedActiveWindow(activeWindow: ActiveWindowInfo): void {
    this.window.setCachedActiveWindow(activeWindow);
  }

  public getCachedActiveWindow(): ActiveWindowInfo | null {
    return this.window.getCachedActiveWindow();
  }

  /**
   * Collect screen size and handle errors
   * @param result - ObserveResult to update
   */
  public async collectScreenSize(result: ObserveResult): Promise<void> {
    try {
      const screenSizeStart = Date.now();
      result.screenSize = await this.screenSize.execute();
      logger.debug(`Screen size retrieval took ${Date.now() - screenSizeStart}ms`);
    } catch (error) {
      logger.warn("Failed to get screen size:", error);
      this.appendError(result, "Failed to retrieve screen dimensions");
    }
  }

  /**
   * Collect system insets using cached dumpsys window output
   * @param result - ObserveResult to update
   */
  public async collectSystemInsets(result: ObserveResult): Promise<void> {
    try {
      const insetsStart = Date.now();
      // Pass cached dumpsys window output to avoid duplicate call
      const dumpsysWindow = await this.getCachedDumpsysWindow();
      result.systemInsets = await this.systemInsets.executeWithCache(dumpsysWindow);
      logger.debug(`System insets retrieval took ${Date.now() - insetsStart}ms`);
    } catch (error) {
      logger.warn("Failed to get system insets:", error);
      this.appendError(result, "Failed to retrieve system insets");
    }
  }

  /**
   * Collect rotation info using cached dumpsys window output
   * @param result - ObserveResult to update
   */
  public async collectRotationInfo(result: ObserveResult): Promise<void> {
    try {
      const rotationStart = Date.now();
      const dumpsysWindow = await this.getCachedDumpsysWindow();
      // Extract rotation from cached output
      const rotationMatch = dumpsysWindow.match(/mRotation=(\d)/);
      if (rotationMatch) {
        result.rotation = parseInt(rotationMatch[1], 10);
      }
      logger.debug(`Rotation info retrieval took ${Date.now() - rotationStart}ms`);
    } catch (error) {
      logger.warn("Failed to get rotation info:", error);
    }
  }

  /**
   * Collect screenshot and handle errors
   * @param result - ObserveResult to update
   */
  public async collectScreenshot(result: ObserveResult): Promise<void> {
    try {
      const screenshotStart = Date.now();
      const activeHash = await this.window.getActiveHash();
      const screenshotResult = await this.screenshotUtil.execute(activeHash, {
        format: "webp",
      });
      if (screenshotResult.success && screenshotResult.path) {
        result.screenshotPath = screenshotResult.path;
      } else if (screenshotResult.error) {
        logger.warn("Failed to take screenshot for view hierarchy:", screenshotResult.error);
        this.appendError(result, "Failed to capture screenshot");
      }
      logger.debug(`Screenshot took ${Date.now() - screenshotStart}ms`);
    } catch (error) {
      logger.warn("Failed to take screenshot:", error);
      this.appendError(result, "Failed to capture screenshot");
    }
  }

  /**
   * Collect view hierarchy and handle errors with accessibility service caching
   * @param result - ObserveResult to update
   * @param withViewHierarchy - Whether to collect view hierarchy
   */
  public async collectViewHierarchy(result: ObserveResult, withViewHierarchy: boolean): Promise<void> {
    if (!withViewHierarchy) {
      return;
    }

    try {
      const viewHierarchyStart = Date.now();

      // Check cached accessibility service availability
      if (ObserveScreen.accessibilityServiceAvailable === null) {
        // First time check or after cache clear
        try {
          const viewHierarchy = await this.viewHierarchy.getViewHierarchy(result.screenshotPath, false);
          ObserveScreen.accessibilityServiceAvailable = true; // Successfully used
          logger.debug("Accessibility service availability cached as: true");

          if (viewHierarchy) {
            result.viewHierarchy = viewHierarchy;
            const focusedElement = this.viewHierarchy.findFocusedElement(viewHierarchy);
            if (focusedElement) {
              result.focusedElement = focusedElement;
              logger.debug(`Found focused element: ${focusedElement.text || focusedElement["resource-id"] || "no text/id"}`);
            }
            const hierarchyXml = typeof viewHierarchy === "string" ? viewHierarchy : JSON.stringify(viewHierarchy);
            await this.detectIntentChooser(result, hierarchyXml);
          }
        } catch (error) {
          // If it fails, mark as unavailable and handle error
          ObserveScreen.accessibilityServiceAvailable = false;
          logger.debug("Accessibility service availability cached as: false");
          throw error;
        }
      } else if (ObserveScreen.accessibilityServiceAvailable) {
        // Use accessibility service (we know it's available)
        logger.debug("Using cached accessibility service availability: true");
        const viewHierarchy = await this.viewHierarchy.getViewHierarchy(result.screenshotPath, false);
        if (viewHierarchy) {
          result.viewHierarchy = viewHierarchy;
          const focusedElement = this.viewHierarchy.findFocusedElement(viewHierarchy);
          if (focusedElement) {
            result.focusedElement = focusedElement;
            logger.debug(`Found focused element: ${focusedElement.text || focusedElement["resource-id"] || "no text/id"}`);
          }
          const hierarchyXml = typeof viewHierarchy === "string" ? viewHierarchy : JSON.stringify(viewHierarchy);
          await this.detectIntentChooser(result, hierarchyXml);
        }
      } else {
        // Accessibility service is not available, skip
        logger.debug("Using cached accessibility service availability: false, trying fallback");
        // Try without accessibility service
        try {
          const viewHierarchy = await this.viewHierarchy.getViewHierarchy(result.screenshotPath, true);
          if (viewHierarchy) {
            result.viewHierarchy = viewHierarchy;
            const focusedElement = this.viewHierarchy.findFocusedElement(viewHierarchy);
            if (focusedElement) {
              result.focusedElement = focusedElement;
              logger.debug(`Found focused element: ${focusedElement.text || focusedElement["resource-id"] || "no text/id"}`);
            }
            const hierarchyXml = typeof viewHierarchy === "string" ? viewHierarchy : JSON.stringify(viewHierarchy);
            await this.detectIntentChooser(result, hierarchyXml);
          }
        } catch (fallbackError) {
          this.appendError(result, "Accessibility service not available and fallback failed");
        }
      }

      logger.debug(`View hierarchy retrieval took ${Date.now() - viewHierarchyStart}ms`);
    } catch (error) {
      logger.warn("Failed to get view hierarchy:", error);

      // Clear cache on failure
      ObserveScreen.clearAccessibilityServiceCache();

      // Check if the error is due to screen being off
      const errorStr = String(error);
      if (
        errorStr.includes("null root node returned by UiTestAutomationBridge") ||
        (errorStr.includes("cat:") && errorStr.includes("No such file or directory")) ||
        (errorStr.includes("screen appears to be off"))
      ) {
        this.appendError(result, "Screen appears to be off or device is locked");
      } else {
        this.appendError(result, "Failed to retrieve view hierarchy");
      }
    }
  }

  /**
   * Detect intent chooser dialog in the view hierarchy
   * @param result - ObserveResult to update
   * @param viewHierarchy - View hierarchy to analyze
   */
  private async detectIntentChooser(result: ObserveResult, viewHierarchy: string): Promise<void> {
    try {
      const intentChooserDetected = this.deepLinkManager.detectIntentChooser(viewHierarchy);

      // Add intent chooser detection to result
      result.intentChooserDetected = intentChooserDetected;

      if (intentChooserDetected) {
        logger.info("[ObserveScreen] Intent chooser dialog detected in view hierarchy");
      }
    } catch (error) {
      logger.warn(`[ObserveScreen] Failed to detect intent chooser: ${error}`);
      // Don't fail the observation if intent chooser detection fails
    }
  }

  /**
   * Collect active window information using cache if available
   * @param result - ObserveResult to update
   */
  public async collectActiveWindow(result: ObserveResult): Promise<void> {
    try {
      logger.info("[OBSERVER] collectActiveWindow");
      const windowStart = Date.now();

      const activeWindow = await this.window.getActive();

      logger.info(`Active window retrieval took ${Date.now() - windowStart}ms`);
      if (activeWindow) {
        result.activeWindow = activeWindow;
      }
    } catch (error) {
      logger.warn("Failed to get active window:", error);
      this.appendError(result, "Failed to retrieve active window information");
    }
  }

  /**
   * Collect all observation data with parallelization
   * @param result - ObserveResult to update
   * @param withViewHierarchy - Whether to collect view hierarchy
   */
  public async collectAllData(result: ObserveResult, withViewHierarchy: boolean): Promise<void> {
    // Pre-fetch dumpsys window to ensure cache is populated before parallel operations
    await this.getCachedDumpsysWindow();

    // Now run all operations in parallel (they'll use the cached dumpsys)
    const parallelPromises: Promise<void>[] = [
      this.collectScreenSize(result),
      this.collectSystemInsets(result),
      this.collectRotationInfo(result),
      this.collectActiveWindow(result),
    ];

    // View hierarchy can run in parallel with others
    if (withViewHierarchy) {
      parallelPromises.push(this.collectViewHierarchy(result, withViewHierarchy));
    }

    // Execute all operations in parallel
    await Promise.all(parallelPromises);
  }

  /**
   * Append error message to result
   * @param result - ObserveResult to update
   * @param newError - Error message to append
   */
  appendError(result: ObserveResult, newError: string): void {
    if (result.error) {
      result.error += `; ${newError}`;
    } else {
      result.error = newError;
    }
  }

  /**
   * Create base observe result object
   * @returns Base ObserveResult with timestamp and default values
   */
  createBaseResult(): ObserveResult {
    return {
      timestamp: new Date().toISOString(),
      screenSize: { width: 0, height: 0 },
      systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
    };
  }

  /**
   * Execute the observe command
   * @param options - Command options
   * @returns The observation result
   */
  async execute(): Promise<ObserveResult> {
    try {
      logger.debug("Executing observe command");
      const startTime = Date.now();

      // Clear instance-level caches for this execution
      this.cachedDumpsysWindow = null;
      this.pendingDumpsysWindow = null;
      // Note: cachedActiveWindow is now managed by the Window class

      // Create base result object with timestamp
      const result = this.createBaseResult();

      // Collect all data components with parallelization
      await this.collectAllData(result, true);

      logger.debug("Observe command completed");
      logger.debug(`Total observe command execution took ${Date.now() - startTime}ms`);
      return result;
    } catch (err) {
      logger.error("Critical error in observe command:", err);
      return {
        timestamp: new Date().toISOString(),
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Observation failed due to device access error"
      };
    }
  }
}
