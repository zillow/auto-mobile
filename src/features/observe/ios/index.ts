/**
 * iOS CtrlProxy Module
 *
 * This module provides access to iOS CtrlProxy functionality
 * for UI automation, hierarchy inspection, and device interaction.
 */

// Main client
export { CtrlProxyClient } from "./CtrlProxyClient";
export type { CtrlProxyService } from "./CtrlProxyClient";

// Delegate modules (for advanced usage)
export { CtrlProxyGestures } from "./CtrlProxyGestures";
export { CtrlProxyText } from "./CtrlProxyText";
export { CtrlProxyHierarchy } from "./CtrlProxyHierarchy";
export { CtrlProxyScreenshot } from "./CtrlProxyScreenshot";
export { CtrlProxyNavigation } from "./CtrlProxyNavigation";

// Types
export type {
  // Node and hierarchy types
  CtrlProxyNode,
  CtrlProxyHierarchy,
  CtrlProxyHierarchyResponse,
  CtrlProxyPerfTiming,
  CtrlProxyCachedHierarchy,
  WebSocketMessage,

  // Result types
  CtrlProxyScreenshotResult,
  CtrlProxySwipeResult,
  CtrlProxyTapResult,
  CtrlProxyDragResult,
  CtrlProxyPinchResult,
  CtrlProxySetTextResult,
  CtrlProxyImeActionResult,
  CtrlProxySelectAllResult,
  CtrlProxyPressHomeResult,
  CtrlProxyLaunchAppResult,
  CtrlProxyActionResult,

  // Delegate context types
  DelegateContext,
  HierarchyDelegateContext,
} from "./types";

// Shared types
export type {
  PerfTiming,
  BaseResult,
  GestureTimingResult,
  ActionTimingResult,
} from "../shared/types";
