import { Element, ObserveResult, ViewHierarchyResult } from "../../../models";
import type { ElementGeometry } from "../../../utils/interfaces/ElementGeometry";
import type { OverlayDetector } from "./OverlayDetector";
import type { SwipeOnResolvedOptions } from "./types";

export function resolveContainerSwipeCoordinates(
  geometry: ElementGeometry,
  overlayDetector: OverlayDetector,
  options: SwipeOnResolvedOptions,
  viewHierarchy: ViewHierarchyResult,
  containerElement: Element,
  observeResult: ObserveResult
): { startX: number; startY: number; endX: number; endY: number; warning?: string } {
  // Apply system insets to container bounds when includeSystemInsets is false (default)
  let effectiveBounds = containerElement.bounds;
  if (options.includeSystemInsets !== true && observeResult.systemInsets) {
    const insets = observeResult.systemInsets;
    effectiveBounds = {
      left: Math.max(containerElement.bounds.left, insets.left),
      top: Math.max(containerElement.bounds.top, insets.top),
      right: Math.min(containerElement.bounds.right, observeResult.screenSize?.width ?? containerElement.bounds.right) - insets.right,
      bottom: Math.min(containerElement.bounds.bottom, observeResult.screenSize?.height ?? containerElement.bounds.bottom) - insets.bottom
    };
  }

  const defaultSwipe = geometry.getSwipeWithinBounds(
    options.direction,
    effectiveBounds
  );

  const overlayCandidates = overlayDetector.collectOverlayCandidates(viewHierarchy, options.container, containerElement);
  if (overlayCandidates.length === 0) {
    return defaultSwipe;
  }

  const allOverlayBounds = overlayCandidates.map(overlay => overlay.overlapBounds);
  const safeSwipe = overlayDetector.computeSafeSwipeCoordinates(
    options.direction,
    effectiveBounds,
    allOverlayBounds
  );

  if (!safeSwipe) {
    return {
      ...defaultSwipe,
      warning: "No unobstructed swipe area found; using container bounds."
    };
  }

  return safeSwipe;
}
