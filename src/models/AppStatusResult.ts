import { ObserveResult } from "./ObserveResult";

/**
 * Result of checking comprehensive app status
 */
export interface AppStatusResult {
  success: boolean;
  packageName: string;
  isInstalled: boolean;
  isRunning: boolean;
  observation?: ObserveResult;
  error?: string;
} 