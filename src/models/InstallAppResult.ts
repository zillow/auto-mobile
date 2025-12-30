import { ObserveResult } from "./ObserveResult";

/**
 * Result of an install app operation
 */
export interface InstallAppResult {
  success: boolean;
  apkPath: string;
  /** Android user ID where the app was installed (0 for primary user, 10+ for work profiles) */
  userId?: number;
  observation?: ObserveResult;
  error?: string;
}
