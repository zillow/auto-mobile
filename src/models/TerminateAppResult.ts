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
  observation?: ObserveResult;
  error?: string;
}
