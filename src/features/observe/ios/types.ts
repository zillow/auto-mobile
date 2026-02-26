/**
 * Shared types for CtrlProxyClient delegates.
 *
 * This module defines the context interfaces that delegates receive to access
 * shared state and functionality from the main CtrlProxyClient.
 */

import type { ViewHierarchyWindowInfo } from "../../../models";
import type {
  PerfTiming,
  BaseResult,
  GestureTimingResult,
  ActionTimingResult,
  DelegateContext,
} from "../shared/types";

// Re-export shared types so existing imports from "./types" continue to work
export type { DelegateContext } from "../shared/types";
export type { PerfTiming, BaseResult, GestureTimingResult, ActionTimingResult } from "../shared/types";

/**
 * Interface for iOS accessibility node format (matching Android format)
 */
export interface CtrlProxyNode {
  text?: string;
  textSize?: number;
  contentDesc?: string;
  resourceId?: string;
  className?: string;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  clickable?: string;
  enabled?: string;
  focusable?: string;
  focused?: string;
  accessibilityFocused?: string;
  scrollable?: string;
  password?: string;
  checkable?: string;
  checked?: string;
  selected?: string;
  longClickable?: string;
  testTag?: string;
  role?: string;
  stateDescription?: string;
  errorMessage?: string;
  hintText?: string;
  actions?: string[];
  node?: CtrlProxyNode | CtrlProxyNode[];
}

/**
 * Interface for iOS view hierarchy (matching Android format)
 */
export interface CtrlProxyHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: CtrlProxyNode;
  windows?: ViewHierarchyWindowInfo[];
  /** iOS screen scale factor (e.g., 2.0 for @2x, 3.0 for @3x retina) */
  screenScale?: number;
  /** Screen width in iOS points (logical pixels) */
  screenWidth?: number;
  /** Screen height in iOS points (logical pixels) */
  screenHeight?: number;
  error?: string;
}

/**
 * iOS-side performance timing data.
 * Alias for shared PerfTiming type.
 */
export type CtrlProxyPerfTiming = PerfTiming;

/**
 * Interface for iOS performance snapshot from CADisplayLink FPS monitoring
 */
export interface CtrlProxyPerformanceSnapshot {
  timestamp: number;
  fps?: number;
  frameTimeMs?: number;
  jankFrames?: number;
  touchLatencyMs?: number;
  ttffMs?: number;
  ttiMs?: number;
  cpuUsagePercent?: number;
  memoryUsageMb?: number;
  screenName?: string;
}

/**
 * Interface for WebSocket message from CtrlProxy iOS
 */
export interface WebSocketMessage {
  type: string;
  timestamp?: number;
  requestId?: string;
  data?: CtrlProxyHierarchy;
  performanceData?: CtrlProxyPerformanceSnapshot;
  format?: string;
  success?: boolean;
  totalTimeMs?: number;
  error?: string;
  perfTiming?: CtrlProxyPerfTiming | CtrlProxyPerfTiming[];
}

/**
 * Interface for screenshot result
 */
export interface CtrlProxyScreenshotResult {
  success: boolean;
  data?: string; // Base64 encoded PNG
  format?: string;
  timestamp?: number;
  error?: string;
}

/** Swipe result from CtrlProxy iOS */
export type CtrlProxySwipeResult = GestureTimingResult;

/** Tap coordinates result */
export type CtrlProxyTapResult = BaseResult;

/** Drag result from CtrlProxy iOS */
export type CtrlProxyDragResult = GestureTimingResult;

/** Pinch result from CtrlProxy iOS */
export type CtrlProxyPinchResult = GestureTimingResult;

/** Set text result from CtrlProxy iOS */
export type CtrlProxySetTextResult = BaseResult;

/** IME action result from CtrlProxy iOS */
export type CtrlProxyImeActionResult = ActionTimingResult;

/** Select all result from CtrlProxy iOS */
export type CtrlProxySelectAllResult = BaseResult;

/** Press home result from CtrlProxy iOS */
export type CtrlProxyPressHomeResult = BaseResult;

/** Launch app result from CtrlProxy iOS */
export type CtrlProxyLaunchAppResult = BaseResult;

/** Action result from CtrlProxy iOS */
export type CtrlProxyActionResult = ActionTimingResult;

/** VoiceOver state result from CtrlProxy iOS */
export interface CtrlProxyVoiceOverResult {
  success: boolean;
  enabled: boolean;
  totalTimeMs?: number;
  error?: string;
}

/**
 * Interface for cached hierarchy with metadata
 */
export interface CtrlProxyCachedHierarchy {
  hierarchy: CtrlProxyHierarchy;
  receivedAt: number;
  fresh: boolean;
  perfTiming?: CtrlProxyPerfTiming;
}

/**
 * Interface for hierarchy response with freshness indicator
 */
export interface CtrlProxyHierarchyResponse {
  hierarchy: CtrlProxyHierarchy | null;
  fresh: boolean;
  updatedAt?: number;
  perfTiming?: CtrlProxyPerfTiming;
}

/**
 * Extended context for hierarchy delegate with additional state access.
 */
export interface HierarchyDelegateContext extends DelegateContext {
  /** Cache freshness TTL in milliseconds */
  cacheFreshTtlMs: number;
  /** Get the cached hierarchy data */
  getCachedHierarchy(): CtrlProxyCachedHierarchy | null;
  /** Set the cached hierarchy data */
  setCachedHierarchy(h: CtrlProxyCachedHierarchy | null): void;
}
