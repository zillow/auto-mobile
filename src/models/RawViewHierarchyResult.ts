/**
 * Result from raw view hierarchy extraction
 */
export interface RawViewHierarchyResult {
  /**
   * Raw XML content from uiautomator dump (Android only)
   */
  xml?: string;

  /**
   * Raw JSON content from accessibility service (Android only)
   */
  json?: string;

  /**
   * Raw JSON content from XCUITest (iOS only)
   */
  xcuitest?: string;

  /**
   * Source of the hierarchy data
   */
  source: "uiautomator" | "accessibility-service" | "both" | "xcuitest";

  /**
   * Timestamp when the hierarchy was captured
   */
  timestamp: number;

  /**
   * Device information
   */
  device: {
    deviceId: string;
    platform: string;
  };

  /**
   * Any errors that occurred during extraction
   */
  error?: string;
}
