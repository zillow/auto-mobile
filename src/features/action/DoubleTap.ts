import { AdbUtils } from "../../utils/adb";
import { TapResult } from "../../models/TapResult";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";

export class DoubleTap extends BaseVisualChange {
  /**
   * Create a DoubleTap instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  /**
   * Send a double tap event at specific coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param progress - Optional progress callback
   */
  async execute(
    x: number,
    y: number,
    progress?: ProgressCallback
  ): Promise<TapResult> {

    // Check that it is installed and foregrounded

    return this.observedChange(
      async () => {
        // First tap
        await this.adb.executeCommand(`shell input tap ${x} ${y}`);

        // Wait before second tap
        await new Promise(resolve => setTimeout(resolve, 100));

        // Second tap
        await this.adb.executeCommand(`shell input tap ${x} ${y}`);

        return {
          success: true,
          x,
          y
        };
      },
      {
        changeExpected: false,
        timeoutMs: 3000,
        progress
      }
    );
  }
}
