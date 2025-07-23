import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice, SystemInsets } from "../../models";
import { ExecResult } from "../../models";
import { IdbPython } from "../../utils/ios-cmdline-tools/idbPython";

export class GetSystemInsets {
  private adb: AdbUtils;
  private idb: IdbPython;

  /**
   * Create a Window instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   * @param idb - Optional IdbPython instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbUtils | null = null,
    idb: IdbPython | null = null
  ) {
    this.adb = adb || new AdbUtils(device);
    this.idb = idb || new IdbPython(device);
  }

  /**
   * Parse status bar height from dumpsys output
   * @param stdout - dumpsys window output
   * @returns Status bar height in pixels
   */
  public parseStatusBarHeight(stdout: string): number {
    const statusBarMatch = stdout.match(/statusBars.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return statusBarMatch ? parseInt(statusBarMatch[4], 10) - parseInt(statusBarMatch[2], 10) : 0;
  }

  /**
   * Parse navigation bar height from dumpsys output
   * @param stdout - dumpsys window output
   * @returns Navigation bar height in pixels
   */
  public parseNavigationBarHeight(stdout: string): number {
    const navBarMatch = stdout.match(/navigationBars.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    return navBarMatch ? parseInt(navBarMatch[4], 10) - parseInt(navBarMatch[2], 10) : 0;
  }

  /**
   * Parse gesture insets from dumpsys output
   * @param stdout - dumpsys window output
   * @returns Object with left and right inset values
   */
  public parseGestureInsets(stdout: string): { left: number; right: number } {
    const leftGestureMatch = stdout.match(/systemGestures.*?sideHint=LEFT.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    const leftInset = leftGestureMatch ? parseInt(leftGestureMatch[3], 10) - parseInt(leftGestureMatch[1], 10) : 0;

    const rightGestureMatch = stdout.match(/systemGestures.*?sideHint=RIGHT.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    const rightInset = rightGestureMatch ? parseInt(rightGestureMatch[3], 10) - parseInt(rightGestureMatch[1], 10) : 0;

    return { left: leftInset, right: rightInset };
  }

  /**
   * Parse frame dimensions from frame string
   * @param frameString - Frame coordinate string like [x1,y1][x2,y2]
   * @returns Width and height calculated from frame coordinates
   */
  public parseFrameDimensions(frameString: string): { width: number; height: number } {
    const match = frameString.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) {
      return { width: 0, height: 0 };
    }
    const width = parseInt(match[3], 10) - parseInt(match[1], 10);
    const height = parseInt(match[4], 10) - parseInt(match[2], 10);
    return { width, height };
  }

  /**
   * Get the system UI insets using cached dumpsys window output
   * @param dumpsysWindow - Pre-fetched dumpsys window output
   * @returns Promise with inset values
   */
  async execute(dumpsysWindow: ExecResult): Promise<SystemInsets> {
    try {
      // Use the full dumpsys output since we need to find status bar, nav bar, and gesture lines
      const fullOutput = dumpsysWindow.stdout;

      const statusBarHeight = this.parseStatusBarHeight(fullOutput);
      const navBarHeight = this.parseNavigationBarHeight(fullOutput);
      const { left: leftInset, right: rightInset } = this.parseGestureInsets(fullOutput);

      logger.debug("System insets detected from cache: %o", {
        top: statusBarHeight,
        bottom: navBarHeight,
        left: leftInset,
        right: rightInset
      });

      return {
        top: statusBarHeight,
        right: rightInset,
        bottom: navBarHeight,
        left: leftInset
      };
    } catch (error) {
      logger.warn("Failed to parse insets from cached dumpsys, falling back to separate query");
      return this.getFallbackInsets(dumpsysWindow);
    }
  }

  /**
   * Get fallback insets from alternative dumpsys output
   * @returns Promise with fallback system insets
   */
  private async getFallbackInsets(dumpsysWindow: ExecResult): Promise<SystemInsets> {
    try {
      // Try to find status bar height
      const statusBarHeightMatch = dumpsysWindow.stdout.match(/mStatusBarHeight=(\d+)/);
      const statusBarHeight = statusBarHeightMatch ? parseInt(statusBarHeightMatch[1], 10) : 0;

      // Try to find navigation bar height
      const navBarHeightMatch = dumpsysWindow.stdout.match(/mNavigationBarHeight=(\d+)/);
      const navBarHeight = navBarHeightMatch ? parseInt(navBarHeightMatch[1], 10) : 0;

      logger.debug("Using fallback system insets: %o", {
        top: statusBarHeight,
        bottom: navBarHeight,
        left: 0,
        right: 0
      });

      return {
        top: statusBarHeight,
        right: 0,
        bottom: navBarHeight,
        left: 0
      };
    } catch (innerError) {
      logger.warn("Failed to get system insets, using default values:", innerError);
      // Use reasonable defaults for typical devices
      return {
        top: 24,  // Typical status bar height in dp
        right: 0,
        bottom: 48, // Typical nav bar height in dp
        left: 0
      };
    }
  }
}
