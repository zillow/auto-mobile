/**
 * AccessibilityServiceClient - Backward compatibility re-export
 *
 * This file re-exports from the new modular location for backward compatibility.
 * New code should import from 'src/features/observe/android' directly.
 *
 * @deprecated Import from 'src/features/observe/android' instead
 */

// Re-export main client
export { AccessibilityServiceClient } from "./android";

// Re-export interfaces
export type { AccessibilityService, InteractionEvent } from "./android";

// Re-export result types
export type {
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
} from "./android";
