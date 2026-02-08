/**
 * XCTestServiceText - iOS text delegate.
 *
 * Thin wrapper over SharedTextDelegate.
 */

import { SharedTextDelegate } from "../shared/SharedTextDelegate";
import type { DelegateContext } from "./types";

export class XCTestServiceText extends SharedTextDelegate {
  constructor(context: DelegateContext) {
    super(context);
  }
}
