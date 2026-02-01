/**
 * Accessibility Service Module
 *
 * This module provides access to Android accessibility service functionality
 * for UI automation, hierarchy inspection, and device interaction.
 */

// Main client
export { AccessibilityServiceClient } from "./AccessibilityServiceClient";
export type { AccessibilityService, InteractionEvent } from "./AccessibilityServiceClient";

// Delegate modules (for advanced usage)
export { AccessibilityServiceGestures } from "./AccessibilityServiceGestures";
export { AccessibilityServiceText } from "./AccessibilityServiceText";
export { AccessibilityServiceHierarchy } from "./AccessibilityServiceHierarchy";
export { AccessibilityServiceStorage } from "./AccessibilityServiceStorage";
export { AccessibilityServiceCertificates } from "./AccessibilityServiceCertificates";
export { AccessibilityServiceFocus } from "./AccessibilityServiceFocus";
export { AccessibilityServiceHighlights } from "./AccessibilityServiceHighlights";

// Types
export type {
  // Result types
  AccessibilityHierarchy,
  AccessibilityHierarchyResponse,
  ScreenshotResult,
  A11ySwipeResult,
  A11yTapCoordinatesResult,
  A11yDragResult,
  A11yPinchResult,
  A11ySetTextResult,
  A11yImeActionResult,
  A11ySelectAllResult,
  A11yActionResult,
  A11yClipboardResult,
  A11yCaCertResult,
  A11yDeviceOwnerStatusResult,
  A11yPermissionResult,
  AndroidPerfTiming,

  // Internal types (for delegate usage)
  DelegateContext,
  HierarchyDelegateContext,
  CertificatesDelegateContext,
  AccessibilityNode,
  CachedHierarchy,
  NormalizedHighlightBounds,
} from "./types";

// Utility functions
export { generateSecureId, quoteForAdbArg } from "./types";
