import type { GfxMetrics } from "../../../models";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

/**
 * State object for UI stability tracking.
 */
export interface UiStabilityState {
  startTime: number;
  lastNonIdleTime: number;
  prevMissedVsync: number | null;
  prevSlowUiThread: number | null;
  prevFrameDeadlineMissed: number | null;
  prevTotalFrames: number | null;
  firstGfxInfoLog: boolean;
}

/**
 * Interface for waiting for device idle/stability states.
 */
export interface AwaitIdle {
  /**
   * Wait for the device rotation to complete.
   * @param targetRotation - The expected rotation value (0 for portrait, 1 for landscape)
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 500)
   * @returns Promise that resolves when rotation completes or rejects on timeout
   */
  waitForRotation(targetRotation: number, timeoutMs?: number): Promise<void>;

  /**
   * Initialize UI stability tracking state.
   * @param packageName - Package name to monitor
   * @param timeoutMs - Maximum time to wait for stability
   * @returns Promise with initialized state for use with waitForUiStabilityWithState
   */
  initializeUiStabilityTracking(packageName: string, timeoutMs: number): Promise<UiStabilityState>;

  /**
   * Wait for UI to become stable by monitoring frame rendering.
   * Initializes tracking state internally.
   * @param packageName - Package name of the app to monitor
   * @param timeoutMs - Maximum time to wait for stability
   * @param perf - Optional performance tracker
   * @param signal - Optional abort signal
   * @returns Promise that resolves with GfxMetrics when UI is stable, or null on failure
   */
  waitForUiStability(
    packageName: string,
    timeoutMs: number,
    perf?: PerformanceTracker,
    signal?: AbortSignal
  ): Promise<GfxMetrics | null>;

  /**
   * Wait for UI to become stable using pre-initialized state.
   * @param packageName - Package name of the app to monitor
   * @param timeoutMs - Maximum time to wait for stability
   * @param initState - Pre-initialized state from initializeUiStabilityTracking
   * @param perf - Optional performance tracker
   * @param signal - Optional abort signal
   * @returns Promise that resolves with GfxMetrics when UI is stable, or null on failure
   */
  waitForUiStabilityWithState(
    packageName: string,
    timeoutMs: number,
    initState: UiStabilityState,
    perf?: PerformanceTracker,
    signal?: AbortSignal
  ): Promise<GfxMetrics | null>;
}
