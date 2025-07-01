import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { Idle } from "./Idle";

export class AwaitIdle {
  private adb: AdbUtils;
  private idle: Idle;

  private stabilityThresholdMs = 60;
  private pollIntervalMs = 17;

  /**
   * Create a AwaitIdle instance
   * @param deviceId - Optional device ID
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
    this.idle = new Idle(deviceId, this.adb);
  }

  /**
   * Wait for the device rotation to complete
   * @param targetRotation - The expected rotation value (0 for portrait, 1 for landscape)
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns Promise that resolves when rotation completes or rejects on timeout
   */
  async waitForRotation(targetRotation: number, timeoutMs: number = 500): Promise<void> {
    const startTime = Date.now();

    while (true) {
      const rotationResult = await this.idle.getRotationStatus(targetRotation, startTime, timeoutMs);

      if (rotationResult.rotationComplete) {
        return; // Rotation complete
      }

      if (!rotationResult.shouldContinue) {
        // If we get here, we timed out waiting for rotation
        throw new Error(`Timeout waiting for rotation to ${targetRotation} after ${timeoutMs}ms`);
      }

      // Wait a short interval before checking again
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  /**
   * Initialize UI stability tracking state
   * @param packageName - Package name to monitor
   * @param timeoutMs - Maximum time to wait for stability
   * @returns Promise with initialized state
   */
  public async initializeUiStabilityTracking(packageName: string, timeoutMs: number): Promise<{
    startTime: number;
    lastNonIdleTime: number;
    prevMissedVsync: number | null;
    prevSlowUiThread: number | null;
    prevFrameDeadlineMissed: number | null;
    firstGfxInfoLog: boolean;
  }> {
    const startTime = Date.now();
    const lastNonIdleTime = startTime;

    // Reset the gfxinfo stats for the package
    logger.info(`[AwaitIdle] Starting UI stability wait for ${packageName} (timeout: ${timeoutMs}ms, threshold: ${this.stabilityThresholdMs}ms)`);

    try {
      await this.adb.executeCommand(`shell dumpsys gfxinfo ${packageName} reset`);
    } catch (error) {
      logger.info(`[AwaitIdle] Failed to reset gfxinfo for ${packageName}: ${error}`);
      // Continue anyway - some packages might not support gfxinfo
    }

    // Give a moment for frame data to accumulate
    await new Promise(resolve => setTimeout(resolve, 50));

    return {
      startTime,
      lastNonIdleTime,
      prevMissedVsync: null,
      prevSlowUiThread: null,
      prevFrameDeadlineMissed: null,
      firstGfxInfoLog: true
    };
  }

  /**
   * Check if UI stability requirements are met
   * @param lastNonIdleTime - Time when UI was last detected as non-idle
   * @param startTime - When stability checking started
   * @param timeoutMs - Maximum time to wait
   * @returns Object indicating if stable and if should continue
   */
  public checkUiStabilityTimeout(
    lastNonIdleTime: number,
    startTime: number,
    timeoutMs: number
  ): { isStable: boolean; shouldContinue: boolean; stableTime: number; elapsedTime: number } {
    const elapsedTime = Date.now() - startTime;
    const stableTime = Date.now() - lastNonIdleTime;
    const isStable = stableTime >= this.stabilityThresholdMs;
    const shouldContinue = elapsedTime < timeoutMs;

    return { isStable, shouldContinue, stableTime, elapsedTime };
  }

  /**
   * Process single UI stability check iteration
   * @param packageName - Package name to monitor
   * @param state - Current tracking state
   * @returns Promise with updated state and stability result
   */
  public async processSingleUiStabilityCheck(
    packageName: string,
    state: {
      prevMissedVsync: number | null;
      prevSlowUiThread: number | null;
      prevFrameDeadlineMissed: number | null;
      firstGfxInfoLog: boolean;
      lastNonIdleTime: number;
    }
  ): Promise<{
    updatedState: typeof state;
    shouldUpdateLastNonIdleTime: boolean;
  }> {
    const stabilityResult = await this.idle.getUiStability(
      packageName,
      state.prevMissedVsync,
      state.prevSlowUiThread,
      state.prevFrameDeadlineMissed,
      state.firstGfxInfoLog
    );

    const updatedState = {
      prevMissedVsync: stabilityResult.updatedPrevMissedVsync,
      prevSlowUiThread: stabilityResult.updatedPrevSlowUiThread,
      prevFrameDeadlineMissed: stabilityResult.updatedPrevFrameDeadlineMissed,
      firstGfxInfoLog: stabilityResult.updatedFirstGfxInfoLog,
      lastNonIdleTime: stabilityResult.shouldUpdateLastNonIdleTime ? Date.now() : state.lastNonIdleTime
    };

    return {
      updatedState,
      shouldUpdateLastNonIdleTime: stabilityResult.shouldUpdateLastNonIdleTime
    };
  }

  /**
   * Wait for UI to become stable by monitoring frame rendering with existing initialization state
   * @param packageName - Package name of the app to monitor
   * @param timeoutMs - Maximum time to wait for stability
   * @param initState - Pre-initialized state from initializeUiStabilityTracking
   * @returns Promise that resolves when UI is stable
   */
  async waitForUiStabilityWithState(
    packageName: string,
    timeoutMs: number,
    initState: {
      startTime: number;
      lastNonIdleTime: number;
      prevMissedVsync: number | null;
      prevSlowUiThread: number | null;
      prevFrameDeadlineMissed: number | null;
      firstGfxInfoLog: boolean;
    }
  ): Promise<void> {
    logger.info(`[AwaitIdle] Continuing UI stability wait with existing state for package: ${packageName}`);

    // Use the provided state instead of initializing
    let state = initState;

    try {
      while (true) {
        const timeoutCheck = this.checkUiStabilityTimeout(state.lastNonIdleTime, state.startTime, timeoutMs);

        logger.info(`[AwaitIdle] Checking stability: ${timeoutCheck.elapsedTime}ms elapsed of ${timeoutMs}ms timeout`);

        if (timeoutCheck.isStable) {
          logger.info(`[AwaitIdle] UI stable after ${timeoutCheck.elapsedTime}ms (stable for ${timeoutCheck.stableTime}ms)`);
          return;
        }

        if (!timeoutCheck.shouldContinue) {
          logger.info(`[AwaitIdle] Timeout waiting for UI stability after ${timeoutMs}ms`);
          return;
        }

        // Process single stability check
        const checkResult = await this.processSingleUiStabilityCheck(packageName, state);
        state = { ...state, ...checkResult.updatedState };

        logger.info(`[AwaitIdle] Waiting for stability: ${timeoutCheck.stableTime}ms/${this.stabilityThresholdMs}ms`);

        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
      }
    } catch {
      logger.error("[AwaitIdle] Encountered an error while waiting for UI stability");
    }
  }

  /**
   * Wait for UI to become stable by monitoring frame rendering
   * @param packageName - Package name of the app to monitor
   * @param timeoutMs - Maximum time to wait for stability
   * @returns Promise that resolves when UI is stable
   */
  async waitForUiStability(
    packageName: string,
    timeoutMs: number,
  ): Promise<void> {

    logger.info(`[AwaitIdle] Waiting for UI stability for package: ${packageName} with timeoutMs: ${timeoutMs}`);
    const state = await this.initializeUiStabilityTracking(packageName, timeoutMs);
    await this.waitForUiStabilityWithState(packageName, timeoutMs, state);
  }
}
