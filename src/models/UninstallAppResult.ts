import { ObserveResult } from "./ObserveResult";

/**
 * Result of an uninstall app operation
 */
export interface UninstallAppResult {
  success: boolean;
  packageName: string;
  keepData: boolean;
  wasInstalled: boolean;
  observation?: ObserveResult;
  error?: string;
}
