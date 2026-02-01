/**
 * XCTestServiceClient - Backward compatibility re-export
 *
 * This file re-exports from the new modular location for backward compatibility.
 * New code should import from 'src/features/observe/ios' directly.
 *
 * @deprecated Import from 'src/features/observe/ios' instead
 */

// Re-export main client
export { XCTestServiceClient } from "./ios";

// Re-export interfaces
export type { XCTestService } from "./ios";

// Re-export result types
export type {
  XCTestNode,
  XCTestHierarchy,
  XCTestHierarchyResponse,
  XCTestPerfTiming,
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
} from "./ios";
