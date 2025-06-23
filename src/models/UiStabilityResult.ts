export interface UiStabilityResult {
  isStable: boolean;
  shouldUpdateLastNonIdleTime: boolean;
  updatedPrevMissedVsync: number | null;
  updatedPrevSlowUiThread: number | null;
  updatedPrevFrameDeadlineMissed: number | null;
  updatedFirstGfxInfoLog: boolean;
}
