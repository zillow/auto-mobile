import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { SystemInsets } from "../../models/SystemInsets";

export class GetSystemInsets {
  private adb: AdbUtils;

  /**
   * Create a Window instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
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
   * Get fallback insets from alternative dumpsys output
   * @returns Promise with fallback system insets
   */
  private async getFallbackInsets(): Promise<SystemInsets> {
    try {
      const { stdout } = await this.adb.executeCommand("shell dumpsys window");

      // Try to find status bar height
      const statusBarHeightMatch = stdout.match(/mStatusBarHeight=(\d+)/);
      const statusBarHeight = statusBarHeightMatch ? parseInt(statusBarHeightMatch[1], 10) : 0;

      // Try to find navigation bar height
      const navBarHeightMatch = stdout.match(/mNavigationBarHeight=(\d+)/);
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

  /**
   * Get the system UI insets
   * @returns Promise with inset values
   */
  async execute(): Promise<SystemInsets> {
    try {
      // Modern Android uses WindowInsets instead of overscan
      const { stdout } = await this.adb.executeCommand("shell dumpsys window | grep -i inset");

      const statusBarHeight = this.parseStatusBarHeight(stdout);
      const navBarHeight = this.parseNavigationBarHeight(stdout);
      const { left: leftInset, right: rightInset } = this.parseGestureInsets(stdout);

      logger.debug("System insets detected: %o", {
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
      // Fallback to dumpsys window without grep to get heights
      return this.getFallbackInsets();
    }
  }
}
