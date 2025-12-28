/**
 * Result from bug report generation
 */
export interface BugReportResult {
  /**
   * Unique identifier for this bug report
   */
  reportId: string;

  /**
   * Timestamp when the report was generated
   */
  timestamp: number;

  /**
   * Device information
   */
  device: {
    deviceId: string;
    platform: string;
    model?: string;
    osVersion?: string;
  };

  /**
   * Current screen state
   */
  screenState: {
    /**
     * Current activity/window in foreground
     */
    currentActivity?: string;

    /**
     * Current package in foreground
     */
    currentPackage?: string;

    /**
     * Screen dimensions
     */
    screenSize?: {
      width: number;
      height: number;
    };

    /**
     * Device rotation (0, 90, 180, 270)
     */
    rotation?: number;

    /**
     * Whether screen is on
     */
    screenOn?: boolean;
  };

  /**
   * Raw view hierarchy data
   */
  viewHierarchy: {
    /**
     * Raw XML from uiautomator
     */
    rawXml?: string;

    /**
     * Total element count
     */
    elementCount: number;

    /**
     * Clickable elements summary
     */
    clickableElements: {
      resourceId?: string;
      text?: string;
      contentDesc?: string;
      bounds: string;
      className?: string;
    }[];
  };

  /**
   * Recent logcat entries
   */
  logcat?: {
    /**
     * Recent error logs
     */
    errors?: string[];

    /**
     * Recent warning logs
     */
    warnings?: string[];

    /**
     * App-specific logs if appId is provided
     */
    appLogs?: string[];
  };

  /**
   * Screenshot as base64 encoded image
   */
  screenshot?: string;

  /**
   * System window state from dumpsys
   */
  windowState?: {
    focusedWindow?: string;
    focusedApp?: string;
    windows?: string[];
  };

  /**
   * File path where full report was saved (if requested)
   */
  savedTo?: string;

  /**
   * Any errors that occurred during report generation
   */
  errors?: string[];
}
