/**
 * Shared types for XCTestServiceClient delegates.
 *
 * This module defines the context interfaces that delegates receive to access
 * shared state and functionality from the main XCTestServiceClient.
 */

import type WebSocket from "ws";
import type { RequestManager } from "../../../utils/RequestManager";
import type { Timer } from "../../../utils/SystemTimer";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type { ViewHierarchyWindowInfo } from "../../../models";

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
 * Interface for iOS-side performance timing data - hierarchical format matching Android
 */
export interface XCTestPerfTiming {
  name: string;
  durationMs: number;
  children?: XCTestPerfTiming[];
}

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

/**
 * Interface for swipe result from XCTestService
 */
export interface XCTestSwipeResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for tap coordinates result
 */
export interface XCTestTapResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for drag result from XCTestService
 */
export interface XCTestDragResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for pinch result from XCTestService
 */
export interface XCTestPinchResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for set text result from XCTestService
 */
export interface XCTestSetTextResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for IME action result from XCTestService
 */
export interface XCTestImeActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for select all result from XCTestService
 */
export interface XCTestSelectAllResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for press home result from XCTestService
 */
export interface XCTestPressHomeResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for launch app result from XCTestService
 */
export interface XCTestLaunchAppResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

/**
 * Interface for action result from XCTestService
 */
export interface XCTestActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: XCTestPerfTiming;
}

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
