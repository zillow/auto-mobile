import { ObserveResult } from "./ObserveResult";

/**
 * Result of a launch app operation
 */
export interface LaunchAppResult {
  success: boolean;
  packageName: string;
  activityName?: string;
  observation?: ObserveResult;
  error?: string;
}
