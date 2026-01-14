import type { Element } from "../../models/Element";
import type { ElementSelector as FocusElementSelector } from "../../utils/AccessibilityFocusTracker";
import { FocusElementMatcher } from "./FocusElementMatcher";

export interface FocusNavigationPath {
  currentFocusIndex: number | null;
  targetFocusIndex: number;
  swipeCount: number;
  direction: "forward" | "backward";
  intermediateCheckpoints: number[];
}

export class FocusPathCalculator {
  private matcher: FocusElementMatcher;

  constructor(matcher: FocusElementMatcher = new FocusElementMatcher()) {
    this.matcher = matcher;
  }

  calculatePath(
    currentFocus: Element | null,
    targetSelector: FocusElementSelector,
    orderedElements: Element[],
    checkpointInterval: number = 5
  ): FocusNavigationPath | null {
    if (!orderedElements.length) {
      return null;
    }

    const targetIndex = this.matcher.findTargetIndex(orderedElements, targetSelector);
    if (targetIndex === null) {
      return null;
    }

    const resolvedCurrentIndex = this.matcher.findCurrentFocusIndex(currentFocus, orderedElements);
    const currentIndex = resolvedCurrentIndex ?? 0;

    const boundedCurrentIndex = this.clampIndex(currentIndex, orderedElements.length);
    const swipeCount = Math.abs(targetIndex - boundedCurrentIndex);
    const direction: "forward" | "backward" = targetIndex >= boundedCurrentIndex ? "forward" : "backward";

    return {
      currentFocusIndex: resolvedCurrentIndex,
      targetFocusIndex: targetIndex,
      swipeCount,
      direction,
      intermediateCheckpoints: this.buildCheckpoints(
        boundedCurrentIndex,
        swipeCount,
        direction,
        checkpointInterval
      )
    };
  }

  private buildCheckpoints(
    startIndex: number,
    swipeCount: number,
    direction: "forward" | "backward",
    checkpointInterval: number
  ): number[] {
    if (swipeCount === 0 || checkpointInterval <= 0) {
      return [];
    }

    const checkpoints: number[] = [];
    for (let i = checkpointInterval; i < swipeCount; i += checkpointInterval) {
      const offset = direction === "forward" ? i : -i;
      checkpoints.push(startIndex + offset);
    }
    return checkpoints;
  }

  private clampIndex(index: number, length: number): number {
    if (!Number.isFinite(index)) {
      return 0;
    }
    if (index < 0) {
      return 0;
    }
    if (index >= length) {
      return Math.max(0, length - 1);
    }
    return Math.floor(index);
  }
}
