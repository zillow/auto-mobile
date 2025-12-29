import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BaseVisualChange } from "./BaseVisualChange";
import { BootedDevice, RotateResult } from "../../models";
import { logger } from "../../utils/logger";
import { ProgressCallback } from "./BaseVisualChange";
import { AxeClient } from "../../utils/ios-cmdline-tools/AxeClient";
import { createGlobalPerformanceTracker } from "../../utils/PerformanceTracker";

export class Rotate extends BaseVisualChange {
  constructor(
    device: BootedDevice,
    adb: AdbClient | null = null,
    axe: AxeClient | null = null
  ) {
    super(device, adb, axe);
  }

  /**
     * Get the current device orientation
     * @returns Promise with current orientation ("portrait" or "landscape")
     */
  async getCurrentOrientation(): Promise<string> {
    try {
      // Get current user_rotation setting
      const result = await this.adb.executeCommand("shell settings get system user_rotation");
      const userRotationStr = result.stdout.trim();

      // Check if the result is a valid number
      if (!/^\d+$/.test(userRotationStr)) {
        logger.warn(`Invalid user_rotation value: ${userRotationStr}, defaulting to portrait`);
        return "portrait";
      }

      const userRotation = parseInt(userRotationStr, 10);

      // Convert numeric value to orientation string
      // 0 = portrait, 1 = landscape (90°), 2 = reverse portrait (180°), 3 = reverse landscape (270°)
      // For simplicity, we'll treat 0,2 as portrait and 1,3 as landscape
      return (userRotation === 0 || userRotation === 2) ? "portrait" : "landscape";
    } catch (error) {
      logger.warn(`Failed to get current orientation: ${error}`);
      // If we can't detect current orientation, assume portrait as default
      return "portrait";
    }
  }

  /**
     * Check if orientation is locked
     * @returns Promise with boolean indicating if auto-rotation is disabled
     */
  async isOrientationLocked(): Promise<boolean> {
    try {
      const result = await this.adb.executeCommand("shell settings get system accelerometer_rotation");
      const autoRotate = parseInt(result.stdout.trim(), 10);
      // 0 = locked (auto-rotation disabled), 1 = unlocked (auto-rotation enabled)
      return autoRotate === 0;
    } catch (error) {
      logger.warn(`Failed to check orientation lock status: ${error}`);
      // If we can't check, assume it's not locked
      return false;
    }
  }

  async execute(
    orientation: "portrait" | "landscape",
    progress?: ProgressCallback
  ): Promise<RotateResult> {
    const perf = createGlobalPerformanceTracker();
    perf.serial("rotate");

    return this.observedInteraction(
      async () => {

        const value = orientation === "portrait" ? 0 : 1;

        // Run getCurrentOrientation and isOrientationLocked in parallel
        const [currentOrientation, isLocked] = await perf.track("getOrientationState", () =>
          Promise.all([
            this.getCurrentOrientation(),
            this.isOrientationLocked()
          ])
        );

        // Check if device is already in the desired orientation
        if (currentOrientation === orientation) {
          return {
            success: true,
            orientation,
            value,
            currentOrientation,
            previousOrientation: currentOrientation,
            rotationPerformed: false,
            orientationLockHandled: false,
            message: `Device is already in ${orientation} orientation`
          };
        }

        let orientationUnlocked = false;

        try {

          // If orientation is locked, unlock it temporarily
          if (isLocked) {
            logger.info("Orientation is locked, temporarily unlocking for rotation");
            await this.adb.executeCommand("shell settings put system accelerometer_rotation 1");
            orientationUnlocked = true;
          }

          // Disable accelerometer rotation and set user rotation in single command
          // Note: Use semicolon inside quotes to run both commands in Android shell
          await perf.track("setRotation", () =>
            this.adb.executeCommand(`shell "settings put system accelerometer_rotation 0; settings put system user_rotation ${value}"`)
          );

          // Wait for rotation to complete (also serves as verification)
          await perf.track("waitForRotation", () =>
            this.awaitIdle.waitForRotation(value)
          );

          // Note: We skip explicit verification since waitForRotation already confirms
          // the rotation completed successfully by polling dumpsys window

          return {
            success: true,
            orientation,
            value,
            currentOrientation,
            previousOrientation: currentOrientation,
            rotationPerformed: true,
            orientationLockHandled: orientationUnlocked,
            message: `Successfully rotated from ${currentOrientation} to ${orientation}`
          };
        } catch (error) {
          // Restore orientation lock if we unlocked it
          if (orientationUnlocked) {
            try {
              await this.adb.executeCommand("shell settings put system accelerometer_rotation 0");
              logger.info("Restored orientation lock after error");
            } catch (restoreError) {
              logger.warn(`Failed to restore orientation lock: ${restoreError}`);
            }
          }

          return {
            success: false,
            orientation,
            value,
            currentOrientation,
            previousOrientation: currentOrientation,
            rotationPerformed: false,
            orientationLockHandled: orientationUnlocked,
            error: `Failed to change device orientation: ${error}`
          };
        }
      },
      {
        changeExpected: true,
        timeoutMs: 5000,
        progress,
        perf,
        // Skip gfxinfo-based UI stability tracking for rotation - it incorrectly
        // detects rotation animation as "unstable UI" and can cause 5+ second waits
        skipUiStability: true
      }
    );
  }
}
