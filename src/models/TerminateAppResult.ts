import { ObserveResult } from "./ObserveResult";

/**
 * Result of a terminate app operation
 */
export interface TerminateAppResult {
  success: boolean;
  packageName: string;
  wasInstalled: boolean;
  wasRunning: boolean;
  wasForeground: boolean;
  /** Android user ID where the app was terminated (0 for primary user, 10+ for work profiles) */
  userId?: number;
  observation?: ObserveResult;
  error?: string;
}
