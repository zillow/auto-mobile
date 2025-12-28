/**
 * Graphics frame timing metrics from Android's gfxinfo dumpsys
 * Used to understand rendering performance and UI stability
 */
export interface GfxMetrics {
  /** Package name the metrics were collected for */
  packageName: string;

  /** Frame time percentiles in milliseconds */
  percentile50thMs: number | null;
  percentile90thMs: number | null;
  percentile95thMs: number | null;
  percentile99thMs: number | null;

  /** Jank indicators - counts of problematic frames */
  missedVsyncCount: number | null;
  slowUiThreadCount: number | null;
  frameDeadlineMissedCount: number | null;

  /** Total number of gfxinfo polls during stability wait */
  pollCount: number;

  /** Time spent waiting for UI stability in milliseconds */
  stabilityWaitMs: number;

  /** Whether UI was determined to be stable */
  isStable: boolean;
}
