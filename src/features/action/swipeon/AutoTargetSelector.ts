import {
  Element,
  ObserveResult,
  SwipeDirection,
  SwipeOnOptions
} from "../../../models";

export class AutoTargetSelector {
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
      ? scrollables.filter(scrollable => !this.boundsEqual(scrollable.bounds, screenBounds))
      : scrollables.slice();

    const candidates = nonScreenScrollables.length > 0 ? nonScreenScrollables : scrollables;
    return this.pickLargestScrollable(candidates);
  }

  pickLargestScrollable(scrollables: Element[]): Element | null {
    if (scrollables.length === 0) {
      return null;
    }

    return scrollables.reduce((largest, current) => {
      const largestArea = this.boundsArea(largest.bounds);
      const currentArea = this.boundsArea(current.bounds);
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

  buildContainerFromElement(element: Element): SwipeOnOptions["container"] | null {
    if (element["resource-id"]) {
      return { elementId: element["resource-id"] };
    }
    if (element.text) {
      return { text: element.text };
    }
    if (element["content-desc"]) {
      return { text: element["content-desc"] };
    }
    if (element["ios-accessibility-label"]) {
      return { text: element["ios-accessibility-label"] };
    }
    return null;
  }

  getScreenBounds(observeResult: ObserveResult): Element["bounds"] | null {
    if (!observeResult.screenSize) {
      return null;
    }

    const insets = observeResult.systemInsets || { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      left: insets.left,
      top: insets.top,
      right: observeResult.screenSize.width - insets.right,
      bottom: observeResult.screenSize.height - insets.bottom
    };
  }

  boundsArea(bounds: Element["bounds"]): number {
    return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
  }

  boundsEqual(a: Element["bounds"], b: Element["bounds"]): boolean {
    return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
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
