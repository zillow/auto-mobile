import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { LongPressResult } from "../../models/LongPressResult";

export class LongPress extends BaseVisualChange {
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  async execute(
    x: number,
    y: number,
    duration: number = 1000,
    progress?: ProgressCallback
  ): Promise<LongPressResult> {
    return this.observedChange(
      async () => {
        // Simulate a long press by holding down the touch
        await this.adb.executeCommand(`shell input swipe ${x} ${y} ${x} ${y} ${duration}`);

        return {
          success: true,
          x,
          y,
          duration
        };
      },
      {
        changeExpected: false,
        tolerancePercent: 0.00,
        timeoutMs: duration + 3000, // Allow extra time for the gesture duration
        progress
      }
    );
  }
}
