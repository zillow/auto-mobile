import { ObserveResult } from "./ObserveResult";

/**
 * Result of a launch app operation
 */
export interface LaunchAppResult {
  success: boolean;
  packageName: string;
  activityName?: string;
  /** Android user ID where the app was launched (0 for primary user, 10+ for work profiles) */
  userId?: number;
  /** Process ID (iOS only) */
  pid?: number;
  observation?: ObserveResult;
  error?: string;
}
