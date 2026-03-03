import { Element, ObserveResult, SwipeDirection, SwipeOnOptions } from "../../src/models";
import { AutoTargetSelectorService } from "../../src/features/action/swipeon/types";

export class FakeAutoTargetSelector implements AutoTargetSelectorService {
  nextScrollable: Element | null = null;
  nextScreenBounds: Element["bounds"] | null = null;
  nextDescribeContainer: string = "unknown";
  mergeWarningsResult: string | undefined = undefined;

  selectAutoTargetScrollable(
    _scrollables: Element[],
    _screenBounds: Element["bounds"] | null,
    _direction: SwipeDirection
  ): Element | null {
    return this.nextScrollable;
  }

  getScreenBounds(_observeResult: ObserveResult): Element["bounds"] | null {
    return this.nextScreenBounds;
  }

  describeContainer(_container: SwipeOnOptions["container"]): string {
    return this.nextDescribeContainer;
  }

  mergeWarnings(...warnings: Array<string | undefined>): string | undefined {
    if (this.mergeWarningsResult !== undefined) {
      return this.mergeWarningsResult;
    }
    const filtered = warnings.filter((w): w is string => Boolean(w));
    if (filtered.length === 0) {
      return undefined;
    }
    return Array.from(new Set(filtered)).join(" ");
  }
}
