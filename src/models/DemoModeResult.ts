export interface DemoModeResult {
  /**
   * Whether setting demo mode was successful
   */
  success: boolean;

  /**
   * Success message if operation succeeded
   */
  message?: string;

  /**
   * Error message if operation failed
   */
  error?: string;

  /**
   * Current status of demo mode (enabled/disabled)
   */
  demoModeEnabled?: boolean;

  /**
   * The package name associated with the demo mode operation
   */
  packageName?: string;

  /**
   * The activity name associated with the demo mode operation
   */
  activityName?: string;

  /**
   * Observation data from BaseVisualChange
   */
  observation?: any;
}
