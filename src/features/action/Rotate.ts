import { AdbUtils } from "../../utils/adb";
import { BaseVisualChange } from "./BaseVisualChange";
import { RotateResult } from "../../models/RotateResult";
import { logger } from "../../utils/logger";
import { ProgressCallback } from "./BaseVisualChange";

export class Rotate extends BaseVisualChange {
  constructor(
    deviceId: string | null = null,
    adb: AdbUtils | null = null
  ) {
    super(deviceId, adb);
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
    orientation: string,
    progress?: ProgressCallback
  ): Promise<RotateResult> {
    // Check orientation is valid
    if (orientation !== "portrait" && orientation !== "landscape") {
      return {
        success: false,
        orientation,
        value: -1,
        error: 'Invalid orientation; must be "portrait" or "landscape"'
      };
    }

    const value = orientation === "portrait" ? 0 : 1;

    if (progress) {
      await progress(0, 100, "Checking current device orientation...");
    }

    // Get current orientation
    const currentOrientation = await this.getCurrentOrientation();

    // Check if we're already in the desired orientation
    if (currentOrientation === orientation) {
      logger.info(`Device is already in ${orientation} orientation, no rotation needed`);

      if (progress) {
        await progress(100, 100, `Already in ${orientation} orientation`);
      }

      // Still take an observation for consistency
      const observation = await this.observeScreen.execute();

      return {
        success: true,
        orientation,
        value,
        observation,
        currentOrientation,
        rotationPerformed: false,
        message: `Device was already in ${orientation} orientation`
      };
    }

    if (progress) {
      await progress(20, 100, "Checking orientation lock status...");
    }

    // Check if orientation is locked
    const isLocked = await this.isOrientationLocked();
    let orientationUnlocked = false;

    return this.observedChange(
      async () => {
        try {
          if (progress) {
            await progress(30, 100, `Rotating from ${currentOrientation} to ${orientation}...`);
          }

          // If orientation is locked, unlock it temporarily
          if (isLocked) {
            logger.info("Orientation is locked, temporarily unlocking for rotation");
            await this.adb.executeCommand("shell settings put system accelerometer_rotation 1");
            orientationUnlocked = true;

            if (progress) {
              await progress(40, 100, "Temporarily unlocked orientation...");
            }
          }

          // Disable accelerometer rotation and set user rotation
          await this.adb.executeCommand("shell settings put system accelerometer_rotation 0");
          await this.adb.executeCommand(`shell settings put system user_rotation ${value}`);

          if (progress) {
            await progress(60, 100, "Waiting for rotation to complete...");
          }

          // Wait for rotation to complete
          await this.awaitIdle.waitForRotation(value);

          if (progress) {
            await progress(80, 100, "Verifying new orientation...");
          }

          // If orientation was originally locked, restore the lock
          if (orientationUnlocked) {
            await this.adb.executeCommand("shell settings put system accelerometer_rotation 0");
            logger.info("Restored orientation lock");
          }

          // Verify the rotation was successful
          const newOrientation = await this.getCurrentOrientation();
          const rotationSuccessful = newOrientation === orientation;

          return {
            success: rotationSuccessful,
            orientation,
            value,
            currentOrientation,
            previousOrientation: currentOrientation,
            rotationPerformed: true,
            orientationLockHandled: orientationUnlocked,
            message: rotationSuccessful
              ? `Successfully rotated from ${currentOrientation} to ${orientation}`
              : `Failed to rotate to ${orientation}, current orientation is ${newOrientation}`
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
        progress
      }
    );
  }
}
