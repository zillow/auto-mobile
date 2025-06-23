import { ObserveResult } from "./ObserveResult";

/**
 * Result of an install app operation
 */
export interface InstallAppResult {
  success: boolean;
  apkPath: string;
  observation?: ObserveResult;
  error?: string;
}
