import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange, ProgressCallback } from "./BaseVisualChange";
import { BootedDevice, ShakeOptions, ShakeResult } from "../../models";
import { logger } from "../../utils/logger";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";
import { Timer } from "../../utils/SystemTimer";
import { defaultTimer } from "../../utils/SystemTimer";

export class Shake extends BaseVisualChange {
  private shakeTimer: Timer;

  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    timer: Timer = defaultTimer
  ) {
    super(device, adb, timer);
    this.shakeTimer = timer;
  }

  async execute(
    options: ShakeOptions = {},
    progress?: ProgressCallback
  ): Promise<ShakeResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("shake");

    const duration = options.duration ?? 1000; // Default 1 second
    const intensity = options.intensity ?? 100; // Default intensity of 100

    return this.observedInteraction(
      async () => {
        try {
          // Start the shake by setting high acceleration values
          await perf.track("shakeExecution", async () => {
            await this.adb.executeCommand(`emu sensor set acceleration ${intensity}:${intensity}:${intensity}`);

            logger.info(`Started shake with intensity ${intensity} for ${duration}ms`);

            // Wait for the specified duration
            await this.shakeTimer.sleep(duration);

            // Stop the shake by resetting acceleration to 0
            await this.adb.executeCommand(`emu sensor set acceleration 0:0:0`);
          });

          logger.info("Shake completed");

          return {
            success: true,
            duration,
            intensity
          };
        } catch (error) {
          perf.end();
          logger.error(`Failed to execute shake: ${error}`);
          return {
            success: false,
            duration,
            intensity,
            error: `Failed to shake device: ${error}`
          };
        }
      },
      {
        changeExpected: false, // Shake typically doesn't change UI directly
        timeoutMs: duration + 2000, // Give extra time beyond shake duration
        tolerancePercent: 0.00,
        progress,
        perf
      }
    );
  }
}
