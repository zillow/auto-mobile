/**
 * CtrlProxyGestures - iOS gesture delegate.
 *
 * Thin wrapper over SharedGestureDelegate with iOS-specific config
 * (no coordinate rounding).
 */

import { SharedGestureDelegate } from "../shared/SharedGestureDelegate";
import type { DelegateContext } from "./types";

export class CtrlProxyGestures extends SharedGestureDelegate {
  constructor(context: DelegateContext) {
    super(context, { logTag: "CTRL_PROXY", roundCoordinates: false });
  }
}
