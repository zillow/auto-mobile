import { AdbUtils } from "../../utils/adb";
import { TapResult } from "../../models/TapResult";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";

export class SingleTap extends BaseVisualChange {
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    super(deviceId, adb);
  }

  async execute(
    x: number,
    y: number,
    progress?: ProgressCallback
  ): Promise<TapResult> {
    return this.observedChange(
      async () => {
        await this.adb.executeCommand(`shell input tap ${x} ${y}`);

        return {
          success: true,
          x,
          y
        };
      },
      {
        changeExpected: false,
        timeoutMs: 3000, // Reduce timeout for faster execution
        progress
      }
    );
  }
}
