export interface TouchIdleResult {
  isIdle: boolean;
  shouldContinue: boolean;
  currentElapsed: number;
  idleTime: number;
}
