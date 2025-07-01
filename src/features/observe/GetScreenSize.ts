import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { ScreenSize } from "../../models/ScreenSize";

export class GetScreenSize {
  private adb: AdbUtils;

  /**
   * Create a Window instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
  }

  /**
   * Parse physical screen dimensions from dumpsys output
   * @param stdout - dumpsys output containing size information
   * @returns Physical width and height
   */
  public parsePhysicalDimensions(stdout: string): { width: number; height: number } {
    const physicalMatch = stdout.match(/Physical size: (\d+)x(\d+)/);
    if (!physicalMatch) {
      throw new Error("Failed to get screen size");
    }
    return {
      width: parseInt(physicalMatch[1], 10),
      height: parseInt(physicalMatch[2], 10)
    };
  }

  /**
   * Detect device rotation
   * @returns Promise with rotation value (0-3)
   */
  public async detectDeviceRotation(): Promise<number> {
    const { stdout: rotationOutput } = await this.adb.executeCommand('shell dumpsys window | grep -i "mRotation\\|mCurrentRotation"');
    const rotationMatch = rotationOutput.match(/mRotation=(\d+)|mCurrentRotation=(\d+)/);

    let rotation = 0;
    if (rotationMatch) {
      // Get the rotation value from whichever group matched
      rotation = parseInt(rotationMatch[1] || rotationMatch[2], 10);
    }

    logger.debug(`Device rotation detected: ${rotation}`);
    return rotation;
  }

  /**
   * Adjust dimensions based on rotation
   * @param width - Physical width
   * @param height - Physical height
   * @param rotation - Device rotation (0-3)
   * @returns Adjusted screen size
   */
  public adjustDimensionsForRotation(width: number, height: number, rotation: number): ScreenSize {
    // Adjust dimensions based on rotation
    // 0 = portrait, 1 = landscape (90° clockwise), 2 = portrait upside down, 3 = landscape (270° clockwise)
    if (rotation === 1 || rotation === 3) {
      // In landscape mode, swap width and height
      return {
        width: height,
        height: width
      };
    }

    // In portrait mode, use original dimensions
    return {
      width,
      height
    };
  }

  /**
   * Get the screen size and resolution
   * @returns Promise with width and height
   */
  async execute(): Promise<ScreenSize> {
    try {
      // First get the physical screen size
      const { stdout } = await this.adb.executeCommand("shell wm size");
      const { width: physicalWidth, height: physicalHeight } = this.parsePhysicalDimensions(stdout);

      // Then check the current rotation to determine actual dimensions
      const rotation = await this.detectDeviceRotation();

      return this.adjustDimensionsForRotation(physicalWidth, physicalHeight, rotation);
    } catch (err) {
      throw new Error(`Failed to get screen size: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
