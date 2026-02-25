/**
 * Shared types for device service delegates.
 *
 * These types are used by both Android (CtrlProxyClient) and
 * iOS (CtrlProxyClient) delegate implementations to eliminate
 * duplicated result type definitions.
 */

import type WebSocket from "ws";
import type { RequestManager } from "../../../utils/RequestManager";
import type { Timer } from "../../../utils/SystemTimer";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";

// =============================================================================
// Performance Timing
// =============================================================================

/**
 * Hierarchical performance timing data from the device.
 * Used by both Android (AndroidPerfTiming) and iOS (XCTestPerfTiming).
 */
export interface PerfTiming {
  name: string;
  durationMs: number;
  children?: PerfTiming[];
}

// =============================================================================
// Shared Result Types
// =============================================================================

/**
 * Base result for operations that return success/failure with timing.
 */
export interface BaseResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: PerfTiming | PerfTiming[];
}

/**
 * Result for gesture operations that include gesture-specific timing.
 * Used by swipe, drag, pinch results on both platforms.
 */
export interface GestureTimingResult extends BaseResult {
  gestureTimeMs?: number;
}

/**
 * Result for operations that include an action name.
 * Used by IME action and node action results on both platforms.
 */
export interface ActionTimingResult extends BaseResult {
  action: string;
}

// =============================================================================
// Delegate Context
// =============================================================================

/**
 * Base context interface that all delegates receive.
 * Provides access to shared state and functionality from the main client.
 */
export interface DelegateContext {
  /** Get the current WebSocket connection (may be null if not connected) */
  getWebSocket(): WebSocket | null;
  /** RequestManager for correlating requests and responses */
  requestManager: RequestManager;
  /** Timer for setTimeout/setInterval operations */
  timer: Timer;
  /** Ensure the WebSocket connection is established */
  ensureConnected(perf?: PerformanceTracker): Promise<boolean>;
  /** Cancel any pending screenshot backoff captures */
  cancelScreenshotBackoff(): void;
}
