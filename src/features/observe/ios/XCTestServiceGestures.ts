/**
 * XCTestServiceGestures - iOS gesture delegate.
 *
 * Thin wrapper over SharedGestureDelegate with iOS-specific config
 * (no coordinate rounding).
 */

import { SharedGestureDelegate } from "../shared/SharedGestureDelegate";
import type { DelegateContext } from "./types";

export class XCTestServiceGestures extends SharedGestureDelegate {
  constructor(context: DelegateContext) {
    super(context, { logTag: "XCTEST_SERVICE", roundCoordinates: false });
  }
}
