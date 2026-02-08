/**
 * Shared types for AccessibilityServiceClient delegates.
 *
 * This module defines the context interfaces that delegates receive to access
 * shared state and functionality from the main AccessibilityServiceClient.
 */

import type { BootedDevice, RecompositionNodeInfo, ViewHierarchyWindowInfo } from "../../../models";
import type { AdbExecutor } from "../../../utils/android-cmdline-tools/interfaces/AdbExecutor";
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
  /** Screen width from accessibility service (eliminates need for dumpsys) */
  screenWidth?: number;
  /** Screen height from accessibility service (eliminates need for dumpsys) */
  screenHeight?: number;
  /** Display rotation: 0=portrait, 1=landscape90, 2=reverse, 3=landscape270 */
  rotation?: number;
  /** System insets (status bar, nav bar, gesture insets) */
  systemInsets?: { top: number; bottom: number; left: number; right: number };
}

/**
 * Android-side performance timing data.
 * Alias for shared PerfTiming type.
 */
export type AndroidPerfTiming = PerfTiming;

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

/** Swipe result from accessibility service */
export type A11ySwipeResult = GestureTimingResult;

/** Tap coordinates result from accessibility service */
export type A11yTapCoordinatesResult = BaseResult;

/** Drag result from accessibility service */
export type A11yDragResult = GestureTimingResult;

/** Pinch result from accessibility service */
export type A11yPinchResult = GestureTimingResult;

/** Set text result from accessibility service */
export type A11ySetTextResult = BaseResult;

/** IME action result from accessibility service */
export type A11yImeActionResult = ActionTimingResult;

/** Select all result from accessibility service */
export type A11ySelectAllResult = BaseResult;

/** Accessibility action result */
export type A11yActionResult = ActionTimingResult;

/** Clipboard operation result from accessibility service */
export interface A11yClipboardResult extends BaseResult {
  action: "copy" | "paste" | "clear" | "get";
  text?: string; // For 'get' action, the clipboard content
}

/** CA certificate result from accessibility service */
export interface A11yCaCertResult extends BaseResult {
  action: "install" | "remove";
  alias?: string;
}

/** Device owner status result from accessibility service */
export interface A11yDeviceOwnerStatusResult extends BaseResult {
  isDeviceOwner: boolean;
  isAdminActive: boolean;
  packageName?: string;
}

/** Permission status result from accessibility service */
export interface A11yPermissionResult extends BaseResult {
  permission: string;
  granted: boolean;
  requestLaunched: boolean;
  canRequest: boolean;
  requiresSettings: boolean;
  instructions?: string;
  adbCommand?: string;
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
