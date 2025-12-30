import { ObserveResult } from "./ObserveResult";

/**
 * Result of a clear app data operation
 */
export interface ClearAppDataResult {
  success: boolean;
  packageName: string;
  /** Android user ID where the app data was cleared (0 for primary user, 10+ for work profiles) */
  userId?: number;
  observation?: ObserveResult;
  error?: string;
}
