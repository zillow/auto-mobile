import {
  Element,
  ObserveResult,
  SwipeDirection,
  SwipeOnOptions
} from "../../../models";
import { boundsArea, boundsEqual } from "../../../utils/bounds";
import { getScreenBounds as getScreenBoundsFromSize } from "../../../utils/screenBounds";
import { AutoTargetSelectorService } from "./types";

export class AutoTargetSelector implements AutoTargetSelectorService {
  selectAutoTargetScrollable(
    scrollables: Element[],
    screenBounds: Element["bounds"] | null,
    direction: SwipeDirection
  ): Element | null {
    if (scrollables.length === 0) {
      return null;
    }

    if (scrollables.length === 1) {
      return this.matchesDirection(scrollables[0], direction) ? scrollables[0] : null;
    }

    const nonScreenScrollables = screenBounds
      ? scrollables.filter(scrollable => !boundsEqual(scrollable.bounds, screenBounds))
      : scrollables.slice();

    const candidates = nonScreenScrollables.length > 0 ? nonScreenScrollables : scrollables;
    return this.pickLargestScrollable(candidates);
  }

  pickLargestScrollable(scrollables: Element[]): Element | null {
    if (scrollables.length === 0) {
      return null;
    }

    return scrollables.reduce((largest, current) => {
      const largestArea = boundsArea(largest.bounds);
      const currentArea = boundsArea(current.bounds);
      return currentArea > largestArea ? current : largest;
    });
  }

  matchesDirection(element: Element, direction: SwipeDirection): boolean {
    const width = Math.abs(element.bounds.right - element.bounds.left);
    const height = Math.abs(element.bounds.bottom - element.bounds.top);

    if (direction === "up" || direction === "down") {
      return height >= width;
    }

    return width >= height;
  }

  getScreenBounds(observeResult: ObserveResult): Element["bounds"] | null {
    if (!observeResult.screenSize) {
      return null;
    }

    return getScreenBoundsFromSize(observeResult.screenSize, observeResult.systemInsets);
  }

  describeContainer(container: SwipeOnOptions["container"]): string {
    if (!container) {
      return "unknown";
    }
    if (container.elementId) {
      return `elementId="${container.elementId}"`;
    }
    if (container.text) {
      return `text="${container.text}"`;
    }
    return "unknown";
  }

  mergeWarnings(...warnings: Array<string | undefined>): string | undefined {
    const filtered = warnings.filter((warning): warning is string => Boolean(warning));
    if (filtered.length === 0) {
      return undefined;
    }
    return Array.from(new Set(filtered)).join(" ");
  }
}
