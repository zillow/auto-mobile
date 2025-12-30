import { ObserveResult } from "./ObserveResult";

/**
 * Result of an uninstall app operation
 */
export interface UninstallAppResult {
  success: boolean;
  packageName: string;
  keepData: boolean;
  wasInstalled: boolean;
  /** Android user ID where the app was uninstalled from (0 for primary user, 10+ for work profiles) */
  userId?: number;
  observation?: ObserveResult;
  error?: string;
}
