/**
 * XCTest Service Module
 *
 * This module provides access to iOS XCTestService functionality
 * for UI automation, hierarchy inspection, and device interaction.
 */

// Main client
export { XCTestServiceClient } from "./XCTestServiceClient";
export type { XCTestService } from "./XCTestServiceClient";

// Delegate modules (for advanced usage)
export { XCTestServiceGestures } from "./XCTestServiceGestures";
export { XCTestServiceText } from "./XCTestServiceText";
export { XCTestServiceHierarchy } from "./XCTestServiceHierarchy";
export { XCTestServiceScreenshot } from "./XCTestServiceScreenshot";
export { XCTestServiceNavigation } from "./XCTestServiceNavigation";

// Types
export type {
  // Node and hierarchy types
  XCTestNode,
  XCTestHierarchy,
  XCTestHierarchyResponse,
  XCTestPerfTiming,
  CachedHierarchy,
  WebSocketMessage,

  // Result types
  XCTestScreenshotResult,
  XCTestSwipeResult,
  XCTestTapResult,
  XCTestDragResult,
  XCTestPinchResult,
  XCTestSetTextResult,
  XCTestImeActionResult,
  XCTestSelectAllResult,
  XCTestPressHomeResult,
  XCTestLaunchAppResult,
  XCTestActionResult,

  // Delegate context types
  DelegateContext,
  HierarchyDelegateContext,
} from "./types";
