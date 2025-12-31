import { Element } from "./Element";
import { ScreenSize } from "./ScreenSize";
import { SystemInsets } from "./SystemInsets";
import { ActiveWindowInfo } from "./ActiveWindowInfo";
import { ViewHierarchyResult } from "./ViewHierarchyResult";
import { TimingData } from "../utils/PerformanceTracker";
import { GfxMetrics } from "./GfxMetrics";
import { BackStackInfo } from "./BackStack";
import { PerformanceAuditResult } from "../features/performance/PerformanceAudit";
import { AccessibilityAuditResult } from "./AccessibilityAudit";

/**
 * Represents the result of observing the device state
 */
export interface ObserveResult {
  /**
   * Timestamp when the screen state was captured on the device (milliseconds since epoch)
   * This comes from the AccessibilityService on Android or equivalent on iOS
   * Falls back to server timestamp if device timestamp is unavailable
   */
  updatedAt: string | number;

  /** Screen dimensions */
  screenSize: ScreenSize;

  /** System UI insets */
  systemInsets: SystemInsets;

  /** Screen rotation (0: portrait, 1: landscape 90°, 2: reverse portrait 180°, 3: reverse landscape 270°) */
  rotation?: number;

  /** View hierarchy data */
  viewHierarchy?: ViewHierarchyResult;

  /** Active window information */
  activeWindow?: ActiveWindowInfo;

  /**
   * Categorized elements from the view hierarchy
   */
  elements?: {
    clickable: Element[];
    scrollable: Element[];
    text: Element[];
  };

  /**
   * The single currently focused UI element from the view hierarchy
   * Contains the element that has focus state set to true
   */
  focusedElement?: Element;

  /** Whether a system intent chooser dialog was detected */
  intentChooserDetected?: boolean;

  /**
   * Device wakefulness state (Android only)
   * - "Awake": Screen is on and device is interactive
   * - "Asleep": Screen is off
   * - "Dozing": Device is in ambient display / always-on mode
   */
  wakefulness?: "Awake" | "Asleep" | "Dozing";

  /**
   * Android user ID for the foreground app (Android only)
   * - 0: Primary user (personal profile)
   * - 10+: Work profile or other managed profiles
   * This indicates which user profile the current foreground app is running in
   */
  userId?: number;

  /**
   * Back stack information (Android only)
   * Includes activity stack depth, task information, and navigation state
   */
  backStack?: BackStackInfo;

  /** Error message if observation failed partially or completely */
  error?: string;

  /** Performance timing data (only present when --debug-perf is enabled) */
  perfTiming?: TimingData;

  /** Indicates if performance timing data was truncated due to size limits */
  perfTimingTruncated?: boolean;

  /** Graphics frame metrics from gfxinfo (only present when --debug-perf is enabled) */
  gfxMetrics?: GfxMetrics;

  /**
   * Performance audit results (when UI performance audit mode is enabled)
   * Contains validation against thresholds and detailed diagnostics
   */
  performanceAudit?: PerformanceAuditResult;

  /**
   * Accessibility audit results (when accessibility audit mode is enabled)
   * Contains WCAG 2.1 violation detection and compliance checking
   */
  accessibilityAudit?: AccessibilityAuditResult;
}
