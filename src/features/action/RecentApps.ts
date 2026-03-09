import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, RecentAppsResult, ViewHierarchyResult } from "../../models";
import { PressButton } from "./PressButton";
import type { ElementFinder } from "../../utils/interfaces/ElementFinder";
import type { ElementGeometry } from "../../utils/interfaces/ElementGeometry";
import { DefaultElementFinder } from "../utility/ElementFinder";
import { DefaultElementGeometry } from "../utility/ElementGeometry";
import { ObserveResult } from "../../models";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { CtrlProxyClient as AndroidCtrlProxyClient } from "../observe/android";
import { logger } from "../../utils/logger";

/**
 * Opens the recent apps screen using intelligent navigation detection
 */
export class RecentApps extends BaseVisualChange {
  private pressButton: PressButton;
  private finder: ElementFinder;
  private geometry: ElementGeometry;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    timer: Timer = defaultTimer,
    finder: ElementFinder = new DefaultElementFinder(),
    geometry: ElementGeometry = new DefaultElementGeometry()
  ) {
    super(device, adb, timer);
    this.pressButton = new PressButton(device, adb);
    this.finder = finder;
    this.geometry = geometry;
  }

  /**
   * Execute recent apps navigation with intelligent detection
   * @param progress - Optional progress callback
   * @returns Result of the recent apps operation
   */
  async execute(progress?: ProgressCallback): Promise<RecentAppsResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("recentApps");

    return this.observedInteraction(
      async (observeResult: ObserveResult) => {

        const viewHierarchy = observeResult.viewHierarchy;
        if (!viewHierarchy) {
          return { success: false, method: "unknown" };
        }

        const navigationMethod = this.detectNavigationStyle(viewHierarchy);

        switch (navigationMethod) {
          case "gesture":
            await perf.track("gestureNavigation", () =>
              this.executeGestureNavigation(observeResult)
            );
            return { success: true, method: "gesture" };
          case "legacy":
            await perf.track("legacyNavigation", () =>
              this.executeLegacyNavigation(observeResult)
            );
            return { success: true, method: "legacy" };
          case "hardware":
          default:
            await perf.track("hardwareNavigation", () =>
              this.executeHardwareNavigation()
            );
            return { success: true, method: "hardware" };
        }
      },
      {
        changeExpected: true,
        timeoutMs: 3000,
        progress,
        perf
      }
    );
  }

  /**
   * Detect navigation style from view hierarchy
   * @param viewHierarchy - Latest ViewHierarchyResult
   * @returns Navigation style type
   */
  private detectNavigationStyle(viewHierarchy: ViewHierarchyResult): "gesture" | "legacy" | "hardware" {
    // Look for common navigation bar elements
    const navigationBarIds = [
      "navigationBarBackground",
      "navigation_bar_frame",
      "navbar",
      "nav_bar"
    ];

    const recentAppsButtonIds = [
      "recent_apps",
      "recent",
      "overview",
      "recents_button",
      "overview_button"
    ];

    // Check for legacy navigation bar with recent apps button
    for (const buttonId of recentAppsButtonIds) {
      const element = this.finder.findElementByResourceId(
        viewHierarchy,
        buttonId,
        { elementId: "@android:id/content" },
        true
      );
      if (element) {
        return "legacy";
      }
    }

    // Check for navigation bar presence (indicates gesture navigation if no recent button found)
    for (const navId of navigationBarIds) {
      const element = this.finder.findElementByResourceId(
        viewHierarchy,
        navId,
        { elementId: "@android:id/content" },
        true
      );
      if (element) {
        return "gesture";
      }
    }

    // Check for common gesture navigation indicators
    const gestureIndicators = [
      "home_handle",
      "navigation_handle",
      "gesture_hint",
      "pill"
    ];

    for (const indicator of gestureIndicators) {
      const element = this.finder.findElementByResourceId(
        viewHierarchy,
        indicator,
        { elementId: "@android:id/content" },
        true
      );
      if (element) {
        return "gesture";
      }
    }

    // Default to hardware button if no navigation elements detected
    return "hardware";
  }

  /**
   * Execute gesture-based navigation (swipe up from bottom)
   * @param observeResult - Current observation result
   * @returns Recent apps result
   */
  private async executeGestureNavigation(observeResult: any): Promise<RecentAppsResult> {
    if (!observeResult.screenSize || !observeResult.systemInsets) {
      throw new Error("Screen size or system insets not available for gesture navigation");
    }

    // Calculate gesture coordinates for recent apps (swipe up and hold from bottom center)
    const screenWidth = observeResult.screenSize.width;
    const screenHeight = observeResult.screenSize.height;
    const insets = observeResult.systemInsets;

    const startX = Math.floor(screenWidth / 2);
    const startY = screenHeight - (insets.bottom > 0 ? Math.floor(insets.bottom / 2) : 20);
    const endX = startX;
    const endY = Math.floor(screenHeight * 0.5); // Swipe up to middle of screen

    // Execute swipe gesture with longer duration for recent apps
    await this.adb.executeCommand(
      `shell input swipe ${startX} ${startY} ${endX} ${endY} 500`
    );

    return {
      success: true,
      method: "gesture"
    };
  }

  /**
   * Execute legacy navigation (tap recent apps button)
   * @param observeResult - Current observation result
   * @returns Recent apps result
   */
  private async executeLegacyNavigation(observeResult: ObserveResult): Promise<RecentAppsResult> {
    const recentAppsButtonIds = [
      "recent_apps",
      "recent",
      "overview",
      "recents_button",
      "overview_button"
    ];


    const viewHierarchy = observeResult.viewHierarchy;
    if (!viewHierarchy) {
      return {
        success: false,
        method: "legacy",
        error: "View hierarchy not available"
      };
    }

    // Find the recent apps button
    let recentButton = null;
    for (const buttonId of recentAppsButtonIds) {
      const element = this.finder.findElementByResourceId(
        viewHierarchy,
        buttonId,
        { elementId: "@android:id/content" },
        true
      );
      if (element) {
        recentButton = element;
        break;
      }
    }

    if (!recentButton) {
      throw new Error("Recent apps button not found in navigation bar");
    }

    // Tap on the recent apps button
    const center = this.geometry.getElementCenter(recentButton);
    await this.adb.executeCommand(`shell input tap ${center.x} ${center.y}`);

    return {
      success: true,
      method: "legacy"
    };
  }

  /**
   * Execute hardware button navigation
   * @returns Recent apps result
   */
  private async executeHardwareNavigation(): Promise<RecentAppsResult> {
    // Try accessibility service global action first
    try {
      const client = AndroidCtrlProxyClient.getInstance(this.device);
      const result = await client.requestGlobalAction("recent", 3000);
      if (result.success) {
        logger.debug("[RECENT_APPS] Used accessibility service global action");
        return { success: true, method: "hardware" };
      }
      logger.debug(`[RECENT_APPS] Global action failed (${result.error}), falling back to ADB`);
    } catch {
      // Fall through to ADB
    }

    await this.adb.executeCommand("shell input keyevent 187");
    return { success: true, method: "hardware" };
  }
}
