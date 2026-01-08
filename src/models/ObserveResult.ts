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
import { RecompositionSummary } from "./Recomposition";
import { DisplayedTimeMetric } from "./DisplayedTimeMetric";
import { SelectedElement } from "../utils/interfaces/NavigationGraph";

export interface PredictionTarget {
  text?: string;
  elementId?: string;
  contentDesc?: string;
  container?: {
    text?: string;
    elementId?: string;
    contentDesc?: string;
  };
  lookFor?: {
    text?: string;
    elementId?: string;
    contentDesc?: string;
  };
}

export interface PredictedAction {
  action: string;
  target: PredictionTarget;
  predictedScreen: string;
  predictedElements?: string[];
  confidence: number;
}

export interface InteractablePrediction {
  elementId?: string;
  elementText?: string;
  elementContentDesc?: string;
  predictedOutcome?: {
    screenName: string;
    basedOn: "navigation_graph";
  };
}

export interface Predictions {
  likelyActions: PredictedAction[];
  interactableElements: InteractablePrediction[];
}

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
   * Selected elements detected for this observation (accessibility or visual fallback)
   */
  selectedElements?: SelectedElement[];

  /**
   * The single currently focused UI element from the view hierarchy
   * Contains the element that has focus state set to true
   */
  focusedElement?: Element;

  /** Whether a system intent chooser dialog was detected */
  intentChooserDetected?: boolean;
  /** Whether a notification permission dialog was detected */
  notificationPermissionDetected?: boolean;

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

  /** Android "Displayed" metrics captured during launch (when ui-perf-mode is enabled). */
  displayedTimeMetrics?: DisplayedTimeMetric[];

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

  /**
   * Freshness metadata for the observation
   * Helps agents understand if the data reflects a recent interaction
   */
  freshness?: {
    /** Minimum timestamp requested for freshness (milliseconds since epoch, device time if available) */
    requestedAfter?: number;
    /** Actual timestamp of the observation (milliseconds since epoch) */
    actualTimestamp?: number;
    /** Whether actualTimestamp satisfied requestedAfter (or true when no request was made) */
    isFresh: boolean;
    /** How stale the observation was in milliseconds, if stale */
    staleDurationMs?: number;
    /** Optional warning when freshness could not be guaranteed */
    warning?: string;
  };

  /**
   * Compose recomposition summary (when ui-perf-debug is enabled)
   */
  recompositionSummary?: RecompositionSummary;

  /**
   * Predictive UI state derived from navigation graph (when enabled)
   */
  predictions?: Predictions;
}
