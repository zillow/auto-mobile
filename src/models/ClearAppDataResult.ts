import { ObserveResult } from "./ObserveResult";

/**
 * Result of a clear app data operation
 */
export interface ClearAppDataResult {
  success: boolean;
  packageName: string;
  observation?: ObserveResult;
  error?: string;
}
