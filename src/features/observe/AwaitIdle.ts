import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";
import { Idle } from "./Idle";

export class AwaitIdle {
  private adb: AdbUtils;
  private idle: Idle;

  private stabilityThresholdMs = 60;
  private pollIntervalMs = 17;
  private activeProcesses: Set<any> = new Set(); // Track active processes for cleanup

  /**
   * Create a AwaitIdle instance
   * @param deviceId - Optional device ID
   */
  constructor(deviceId: string, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
    this.idle = new Idle(deviceId, this.adb);
  }

  /**
   * Clean up all active processes
   */
  private cleanupProcesses(): void {
    for (const process of this.activeProcesses) {
      try {
        if (process && !process.killed) {
          process.kill("SIGTERM");
          // Force kill if still running after a short delay
          setTimeout(() => {
            if (!process.killed) {
              process.kill("SIGKILL");
            }
          }, 100);
        }
      } catch (error) {
        logger.info(`[AwaitIdle] Error cleaning up process: ${error}`);
      }
    }
    this.activeProcesses.clear();
  }

  /**
   * Wait for touch events to become idle (no touch events for a period)
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns Promise that resolves when events are idle
   */
  async waitForIdleTouchEvents(timeoutMs: number = 100): Promise<void> {
    const hardLimitMs = 12000;
    logger.info(`[AwaitIdle] Waiting for idle touch events (timeout: ${timeoutMs}ms, hard limit: ${hardLimitMs}ms)`);
    // const startTime = Date.now();

    // TODO: Temporarily commenting out getevent to prevent hanging issues
    // The getevent process spawning was causing the Node.js event loop to hang
    // after tool execution completed

    // Simple delay instead of actual event monitoring for now
    await new Promise(resolve => setTimeout(resolve, Math.min(timeoutMs, 250)));
    logger.info(`[AwaitIdle] Touch events idle after simple delay of ${Math.min(timeoutMs, 250)}ms`);

    /*
    // Start capturing events
    const eventProcess = this.adb.spawnCommand("shell getevent -l");
    this.activeProcesses.add(eventProcess); // Track this process
    let lastEventTime = Date.now();
    let eventListener: ((data: Buffer) => void) | null = null;

    try {
      // Set up event listener
      eventListener = (data: Buffer) => {
        const output = data.toString();
        // If this contains touch event data, update the last event time
        // Also check for common Android touch events
        if (output.includes("ABS_MT_POSITION_X") ||
          output.includes("ABS_MT_POSITION_Y") ||
          output.includes("ABS_MT_TRACKING_ID") ||
          output.includes("BTN_TOUCH") ||
          output.includes("ABS_X") ||
          output.includes("ABS_Y")) {
          logger.info(`[AwaitIdle] Touch event detected at ${Date.now() - startTime}ms`);
          lastEventTime = Date.now();
        }
      };

      eventProcess.stdout?.on("data", eventListener);

      // Wait until no events for the timeout period
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 10)); // Check every 10ms

        const idleResult = this.idle.getTouchStatus(startTime, lastEventTime, timeoutMs, hardLimitMs);

        if (idleResult.currentElapsed % 1000 < 20) { // Log approximately every second
          logger.info(`[AwaitIdle] Waiting for touch events to become idle: ${idleResult.currentElapsed}ms elapsed, ${idleResult.idleTime}ms since last event (need ${timeoutMs}ms)`);
        }

        if (idleResult.isIdle) {
          logger.info(`[AwaitIdle] Touch events idle detected after ${idleResult.currentElapsed}ms (${idleResult.idleTime}ms since last event)`);
          break;
        }

        if (!idleResult.shouldContinue) {
          logger.info(`[AwaitIdle] Hard timeout reached after ${idleResult.currentElapsed}ms without achieving idle state`);
          break;
        }
      }
    } finally {
      // Clean up the event listener and kill the process
      if (eventListener && eventProcess.stdout) {
        eventProcess.stdout.off("data", eventListener);
      }

      try {
        this.activeProcesses.delete(eventProcess); // Remove from tracking
        eventProcess.kill("SIGTERM");
        // Give the process a moment to terminate gracefully
        await new Promise(resolve => setTimeout(resolve, 100));

        // Force kill if still running
        if (!eventProcess.killed) {
          eventProcess.kill("SIGKILL");
        }
      } catch (error) {
        logger.info(`[AwaitIdle] Error killing getevent process: ${error}`);
      }
    }
    */
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
    } finally {
      // Ensure any remaining processes are cleaned up
      // this.cleanupProcesses();
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
    // Initialize tracking state
    let state = await this.initializeUiStabilityTracking(packageName, timeoutMs);

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
    } finally {
      // Ensure any remaining processes are cleaned up
      // this.cleanupProcesses();
    }
  }
}
