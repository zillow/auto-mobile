import { logger } from "../../utils/logger";
import { TimingEntry } from "../../utils/PerformanceTracker";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { NavigationGraphManager } from "./NavigationGraphManager";
import {
  ScreenFingerprint,
  AccessibilityHierarchy,
  FingerprintResult,
} from "./ScreenFingerprint";

/**
 * Options for the hierarchy navigation detector.
 */
interface HierarchyNavigationDetectorOptions {
  /** Debounce time in milliseconds (default: 100ms) */
  debounceMs?: number;
  /** Max time to wait for UI stability in milliseconds (default: 5000ms) */
  stabilityTimeoutMs?: number;
  /** Timer for setTimeout/clearTimeout (default: defaultTimer) */
  timer?: Timer;
}

export interface HierarchyNavigationUpdateMetrics {
  source?: "android" | "ios";
  conversionMs?: number;
  externalTiming?: TimingEntry | TimingEntry[];
  fingerprintMs?: number;
}

/**
 * Callback invoked when hierarchy-based navigation is detected.
 * Can be used to trigger screenshot capture from the owning service.
 */
type HierarchyNavigationCallback = (info: {
  packageName: string | null;
  screenFingerprint: string;
  timestamp: number;
}) => void;

const DEFAULT_OPTIONS: Required<Omit<HierarchyNavigationDetectorOptions, "timer">> & { timer: Timer } = {
  debounceMs: 100,
  stabilityTimeoutMs: 5000,
  timer: defaultTimer,
};

/**
 * Detects navigation events from view hierarchy changes.
 *
 * This detector:
 * 1. Listens for hierarchy updates
 * 2. Computes screen fingerprints
 * 3. Debounces updates to wait for UI stability
 * 4. Records navigation when fingerprint changes
 *
 * The detector uses debouncing to avoid recording navigation during
 * animations or rapid UI updates. A fingerprint is considered "stable"
 * when it hasn't changed for the debounce period.
 */
export class HierarchyNavigationDetector {
  private navigationManager: NavigationGraphManager;
  private debounceMs: number;
  private stabilityTimeoutMs: number;
  private timer: Timer;

  /** Current stable fingerprint (after debounce) */
  private currentStableFingerprint: FingerprintResult | null = null;
  /** Previous stable fingerprint (before current navigation) */
  private previousStableFingerprint: FingerprintResult | null = null;
  /** Pending fingerprint waiting for stability */
  private pendingFingerprint: FingerprintResult | null = null;
  /** Timestamp when pending fingerprint was first seen */
  private pendingFingerprintStartTime: number = 0;
  /** Debounce timer handle */
  private debounceTimer: NodeJS.Timeout | null = null;
  /** Stability timeout timer handle */
  private stabilityTimeoutTimer: NodeJS.Timeout | null = null;
  /** Last recorded performance metrics for debugging */
  private lastUpdateMetrics: HierarchyNavigationUpdateMetrics | null = null;
  /** Callback for navigation events (used for screenshot capture) */
  private navigationCallback: HierarchyNavigationCallback | null = null;

  constructor(
    navigationManager: NavigationGraphManager,
    options?: HierarchyNavigationDetectorOptions
  ) {
    this.navigationManager = navigationManager;
    this.debounceMs = options?.debounceMs ?? DEFAULT_OPTIONS.debounceMs;
    this.stabilityTimeoutMs = options?.stabilityTimeoutMs ?? DEFAULT_OPTIONS.stabilityTimeoutMs;
    this.timer = options?.timer ?? DEFAULT_OPTIONS.timer;
  }

  /**
   * Handle a hierarchy update from the accessibility service.
   * This is the main entry point called when new hierarchy data arrives.
   */
  public onHierarchyUpdate(
    hierarchy: AccessibilityHierarchy,
    metrics?: HierarchyNavigationUpdateMetrics
  ): void {
    const fingerprintStart = this.timer.now();
    // Compute fingerprint for this hierarchy
    const fingerprint = ScreenFingerprint.compute(hierarchy);
    const fingerprintMs = this.timer.now() - fingerprintStart;

    const updateMetrics: HierarchyNavigationUpdateMetrics = {
      ...metrics,
      fingerprintMs,
    };
    this.lastUpdateMetrics = updateMetrics;

    logger.debug(
      `[HIERARCHY_NAV] Received hierarchy update: hash=${fingerprint.hash.substring(0, 12)}, ` +
      `elements=${fingerprint.elementCount}, pkg=${fingerprint.packageName}`
    );
    if (updateMetrics.conversionMs !== undefined || updateMetrics.externalTiming || updateMetrics.source) {
      logger.debug(
        `[HIERARCHY_NAV] Perf: source=${updateMetrics.source ?? "unknown"}, ` +
        `convert=${updateMetrics.conversionMs ?? "n/a"}ms, ` +
        `fingerprint=${updateMetrics.fingerprintMs ?? "n/a"}ms`
      );
    }

    // Check if fingerprint is different from pending
    if (this.pendingFingerprint && this.pendingFingerprint.hash === fingerprint.hash) {
      // Same as pending - fingerprint hasn't changed, let debounce timer continue
      logger.debug(`[HIERARCHY_NAV] Same as pending fingerprint, waiting for stability`);
      return;
    }

    // New fingerprint - reset debounce timer
    this.clearDebounceTimer();

    // Update pending fingerprint
    this.pendingFingerprint = fingerprint;
    this.pendingFingerprintStartTime = this.timer.now();

    logger.debug(
      `[HIERARCHY_NAV] New pending fingerprint: ${fingerprint.hash.substring(0, 12)}, ` +
      `starting debounce (${this.debounceMs}ms)`
    );

    // Start new debounce timer
    this.debounceTimer = this.timer.setTimeout(() => {
      this.onFingerprintStable();
    }, this.debounceMs);

    // Start stability timeout if not already running
    if (!this.stabilityTimeoutTimer) {
      this.stabilityTimeoutTimer = this.timer.setTimeout(() => {
        this.onStabilityTimeout();
      }, this.stabilityTimeoutMs);
    }
  }

  /**
   * Called when fingerprint has been stable for debounce period.
   */
  private onFingerprintStable(): void {
    this.clearTimers();

    if (!this.pendingFingerprint) {
      return;
    }

    const newFingerprint = this.pendingFingerprint;
    this.pendingFingerprint = null;

    logger.debug(
      `[HIERARCHY_NAV] Fingerprint stable: ${newFingerprint.hash.substring(0, 12)}`
    );

    // Check if this is a navigation (different from current stable)
    if (this.currentStableFingerprint?.hash !== newFingerprint.hash) {
      this.recordNavigation(newFingerprint);
    }
  }

  /**
   * Called when stability timeout is reached.
   * Forces navigation detection even if UI hasn't stabilized.
   */
  private onStabilityTimeout(): void {
    this.clearTimers();

    if (!this.pendingFingerprint) {
      return;
    }

    const newFingerprint = this.pendingFingerprint;
    this.pendingFingerprint = null;

    logger.info(
      `[HIERARCHY_NAV] Stability timeout reached, forcing navigation detection: ` +
      `${newFingerprint.hash.substring(0, 12)}`
    );

    // Check if this is a navigation
    if (this.currentStableFingerprint?.hash !== newFingerprint.hash) {
      this.recordNavigation(newFingerprint);
    }
  }

  /**
   * Record a navigation event to the navigation graph.
   */
  private recordNavigation(newFingerprint: FingerprintResult): void {
    const fromFingerprint = this.currentStableFingerprint?.hash || null;
    const toFingerprint = newFingerprint.hash;

    logger.info(
      `[HIERARCHY_NAV] Navigation detected: ` +
      `${fromFingerprint ? fromFingerprint.substring(0, 12) : "(initial)"} -> ` +
      `${toFingerprint.substring(0, 12)}`
    );

    // Update fingerprint state
    this.previousStableFingerprint = this.currentStableFingerprint;
    this.currentStableFingerprint = newFingerprint;

    // Record to navigation graph
    this.navigationManager
      .recordHierarchyNavigation({
        fromFingerprint,
        toFingerprint,
        timestamp: newFingerprint.timestamp,
        packageName: newFingerprint.packageName,
      })
      .catch(error => {
        logger.error(`[HIERARCHY_NAV] Failed to record navigation: ${error}`);
      });

    // Invoke callback (e.g., for screenshot capture)
    if (this.navigationCallback) {
      try {
        this.navigationCallback({
          packageName: newFingerprint.packageName,
          screenFingerprint: toFingerprint,
          timestamp: newFingerprint.timestamp,
        });
      } catch (error) {
        logger.warn(`[HIERARCHY_NAV] Navigation callback error: ${error}`);
      }
    }
  }

  /**
   * Register a callback to be invoked when navigation is detected.
   * Used by CtrlProxyClient to trigger screenshot capture.
   */
  public setNavigationCallback(callback: HierarchyNavigationCallback | null): void {
    this.navigationCallback = callback;
  }

  /**
   * Get the current stable fingerprint.
   */
  public getCurrentFingerprint(): FingerprintResult | null {
    return this.currentStableFingerprint;
  }

  /**
   * Get the previous stable fingerprint.
   */
  public getPreviousFingerprint(): FingerprintResult | null {
    return this.previousStableFingerprint;
  }

  /**
   * Get the last recorded performance metrics for hierarchy updates.
   */
  public getLastUpdateMetrics(): HierarchyNavigationUpdateMetrics | null {
    return this.lastUpdateMetrics;
  }

  /**
   * Check if there's a pending fingerprint waiting for stability.
   */
  public hasPendingFingerprint(): boolean {
    return this.pendingFingerprint !== null;
  }

  /**
   * Reset the detector state.
   * Call this when the app changes or you want to start fresh.
   */
  public reset(): void {
    this.clearTimers();
    this.currentStableFingerprint = null;
    this.previousStableFingerprint = null;
    this.pendingFingerprint = null;
    this.pendingFingerprintStartTime = 0;

    logger.debug(`[HIERARCHY_NAV] Detector state reset`);
  }

  /**
   * Clear the debounce timer.
   */
  private clearDebounceTimer(): void {
    if (this.debounceTimer) {
      this.timer.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Clear all timers.
   */
  private clearTimers(): void {
    this.clearDebounceTimer();
    if (this.stabilityTimeoutTimer) {
      this.timer.clearTimeout(this.stabilityTimeoutTimer);
      this.stabilityTimeoutTimer = null;
    }
  }

  /**
   * Cleanup resources. Call when the detector is no longer needed.
   */
  public dispose(): void {
    this.clearTimers();
  }
}
