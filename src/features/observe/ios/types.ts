/**
 * Shared types for XCTestServiceClient delegates.
 *
 * This module defines the context interfaces that delegates receive to access
 * shared state and functionality from the main XCTestServiceClient.
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
export interface XCTestNode {
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
  node?: XCTestNode | XCTestNode[];
}

/**
 * Interface for iOS view hierarchy (matching Android format)
 */
export interface XCTestHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: XCTestNode;
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
export type XCTestPerfTiming = PerfTiming;

/**
 * Interface for iOS performance snapshot from CADisplayLink FPS monitoring
 */
export interface XCTestPerformanceSnapshot {
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
 * Interface for WebSocket message from XCTestService
 */
export interface WebSocketMessage {
  type: string;
  timestamp?: number;
  requestId?: string;
  data?: XCTestHierarchy;
  performanceData?: XCTestPerformanceSnapshot;
  format?: string;
  success?: boolean;
  totalTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming | XCTestPerfTiming[];
}

/**
 * Interface for screenshot result
 */
export interface XCTestScreenshotResult {
  success: boolean;
  data?: string; // Base64 encoded PNG
  format?: string;
  timestamp?: number;
  error?: string;
}

/** Swipe result from XCTestService */
export type XCTestSwipeResult = GestureTimingResult;

/** Tap coordinates result */
export type XCTestTapResult = BaseResult;

/** Drag result from XCTestService */
export type XCTestDragResult = GestureTimingResult;

/** Pinch result from XCTestService */
export type XCTestPinchResult = GestureTimingResult;

/** Set text result from XCTestService */
export type XCTestSetTextResult = BaseResult;

/** IME action result from XCTestService */
export type XCTestImeActionResult = ActionTimingResult;

/** Select all result from XCTestService */
export type XCTestSelectAllResult = BaseResult;

/** Press home result from XCTestService */
export type XCTestPressHomeResult = BaseResult;

/** Launch app result from XCTestService */
export type XCTestLaunchAppResult = BaseResult;

/** Action result from XCTestService */
export type XCTestActionResult = ActionTimingResult;

/**
 * Interface for cached hierarchy with metadata
 */
export interface CachedHierarchy {
  hierarchy: XCTestHierarchy;
  receivedAt: number;
  fresh: boolean;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for hierarchy response with freshness indicator
 */
export interface XCTestHierarchyResponse {
  hierarchy: XCTestHierarchy | null;
  fresh: boolean;
  updatedAt?: number;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Extended context for hierarchy delegate with additional state access.
 */
export interface HierarchyDelegateContext extends DelegateContext {
  /** Cache freshness TTL in milliseconds */
  cacheFreshTtlMs: number;
  /** Get the cached hierarchy data */
  getCachedHierarchy(): CachedHierarchy | null;
  /** Set the cached hierarchy data */
  setCachedHierarchy(h: CachedHierarchy | null): void;
}
