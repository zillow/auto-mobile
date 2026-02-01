/**
 * Shared types for AccessibilityServiceClient delegates.
 *
 * This module defines the context interfaces that delegates receive to access
 * shared state and functionality from the main AccessibilityServiceClient.
 */

import type WebSocket from "ws";
import type { RequestManager } from "../../../utils/RequestManager";
import type { Timer } from "../../../utils/SystemTimer";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import type { BootedDevice, RecompositionNodeInfo, ViewHierarchyWindowInfo } from "../../../models";
import type { AdbExecutor } from "../../../utils/android-cmdline-tools/interfaces/AdbExecutor";

/**
 * Generate a cryptographically secure random suffix for request IDs.
 * Uses crypto.randomBytes which is much more secure than Math.random().
 * @returns 8-character hex string
 */
export { randomBytes } from "crypto";

/**
 * Generate a secure ID for request IDs.
 */
export function generateSecureId(): string {
  const { randomBytes } = require("crypto");
  return randomBytes(4).toString("hex");
}

/**
 * Quote a string for use in ADB shell arguments.
 */
export const quoteForAdbArg = (value: string): string => {
  const escaped = value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
  return `"${escaped}"`;
};

/**
 * Interface for accessibility service node format
 */
export interface AccessibilityNode {
  text?: string;
  "content-desc"?: string;
  "resource-id"?: string;
  "test-tag"?: string;
  className?: string;
  packageName?: string;
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
  scrollable?: string;
  password?: string;
  checkable?: string;
  checked?: string;
  selected?: string;
  "long-clickable"?: string;
  occlusionState?: string;
  occludedBy?: string;
  extras?: Record<string, string>;
  recomposition?: RecompositionNodeInfo;
  node?: AccessibilityNode | AccessibilityNode[];
}

/**
 * Interface for accessibility hierarchy data from the device.
 */
export interface AccessibilityHierarchy {
  updatedAt: number;
  packageName: string;
  hierarchy: AccessibilityNode;
  windows?: ViewHierarchyWindowInfo[];
  intentChooserDetected?: boolean;
  notificationPermissionDetected?: boolean;
  /** Element with TalkBack cursor */
  "accessibility-focused-element"?: AccessibilityNode;
  /**
   * True when the accessibility service couldn't fully extract the hierarchy.
   * This happens when the active window has a null root (app restricts accessibility)
   * or only system UI windows were accessible.
   */
  accessibilityServiceIncomplete?: boolean;
  error?: string;
}

/**
 * Interface for Android-side performance timing data
 */
export interface AndroidPerfTiming {
  name: string;
  durationMs: number;
  children?: AndroidPerfTiming[];
}

/**
 * Interface for cached hierarchy with metadata
 */
export interface CachedHierarchy {
  hierarchy: AccessibilityHierarchy;
  receivedAt: number;
  fresh: boolean;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for hierarchy response with freshness indicator
 */
export interface AccessibilityHierarchyResponse {
  hierarchy: AccessibilityHierarchy | null;
  fresh: boolean;
  updatedAt?: number; // Timestamp from device (only present when hierarchy data exists)
  perfTiming?: AndroidPerfTiming[]; // Android-side performance timing data
}

/**
 * Interface for screenshot result
 */
export interface ScreenshotResult {
  success: boolean;
  data?: string; // Base64 encoded JPEG
  format?: string;
  timestamp?: number;
  error?: string;
}

/**
 * Interface for swipe result from accessibility service
 */
export interface A11ySwipeResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for tap coordinates result from accessibility service
 */
export interface A11yTapCoordinatesResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for drag result from accessibility service
 */
export interface A11yDragResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for pinch result from accessibility service
 */
export interface A11yPinchResult {
  success: boolean;
  totalTimeMs: number;
  gestureTimeMs?: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for set text result from accessibility service
 */
export interface A11ySetTextResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for IME action result from accessibility service
 */
export interface A11yImeActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for select all result from accessibility service
 */
export interface A11ySelectAllResult {
  success: boolean;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for accessibility action result
 */
export interface A11yActionResult {
  success: boolean;
  action: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for clipboard operation result from accessibility service
 */
export interface A11yClipboardResult {
  success: boolean;
  action: "copy" | "paste" | "clear" | "get";
  text?: string; // For 'get' action, the clipboard content
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for CA certificate result from accessibility service
 */
export interface A11yCaCertResult {
  success: boolean;
  action: "install" | "remove";
  alias?: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for device owner status result from accessibility service
 */
export interface A11yDeviceOwnerStatusResult {
  success: boolean;
  isDeviceOwner: boolean;
  isAdminActive: boolean;
  packageName?: string;
  totalTimeMs: number;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
}

/**
 * Interface for permission status result from accessibility service
 */
export interface A11yPermissionResult {
  success: boolean;
  permission: string;
  granted: boolean;
  totalTimeMs: number;
  requestLaunched: boolean;
  canRequest: boolean;
  requiresSettings: boolean;
  instructions?: string;
  adbCommand?: string;
  error?: string;
  perfTiming?: AndroidPerfTiming[];
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
  /** Cancel any pending screenshot backoff captures */
  cancelScreenshotBackoff(): void;
}

/**
 * Extended context for hierarchy delegate with additional state access.
 */
export interface HierarchyDelegateContext extends DelegateContext {
  /** The device this client is connected to */
  device: BootedDevice;
  /** ADB executor for running device commands */
  adb: AdbExecutor;
  /** Get the cached hierarchy data */
  getCachedHierarchy(): CachedHierarchy | null;
  /** Set the cached hierarchy data */
  setCachedHierarchy(h: CachedHierarchy | null): void;
  /** Get the timestamp of the last WebSocket timeout */
  getLastWebSocketTimeout(): number;
  /** Set the timestamp of the last WebSocket timeout */
  setLastWebSocketTimeout(time: number): void;
}

/**
 * Extended context for certificates delegate with ADB access.
 */
export interface CertificatesDelegateContext extends DelegateContext {
  /** ADB executor for running device commands */
  adb: AdbExecutor;
}

/**
 * Interface for highlight shape bounds normalization
 */
export interface NormalizedHighlightBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}
