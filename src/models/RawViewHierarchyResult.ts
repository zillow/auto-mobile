/**
 * Result from raw view hierarchy extraction
 */
export interface RawViewHierarchyResult {
  /**
   * Raw XML content from uiautomator dump
   */
  xml?: string;

  /**
   * Raw JSON content from accessibility service (if available)
   */
  json?: string;

  /**
   * Source of the hierarchy data
   */
  source: "uiautomator" | "accessibility-service" | "both";

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
