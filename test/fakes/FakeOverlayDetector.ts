import { Element, SwipeDirection, SwipeOnOptions, ViewHierarchyResult } from "../../src/models";
import { OverlayAnalyzer, OverlayCandidate } from "../../src/features/action/swipeon/types";

export class FakeOverlayDetector implements OverlayAnalyzer {
  candidates: OverlayCandidate[] = [];
  safeCoords: { startX: number; startY: number; endX: number; endY: number; warning?: string } | null = null;

  collectOverlayCandidates(
    _viewHierarchy: ViewHierarchyResult,
    _container: SwipeOnOptions["container"] | undefined,
    _containerElement: Element
  ): OverlayCandidate[] {
    return this.candidates;
  }

  computeSafeSwipeCoordinates(
    _direction: SwipeDirection,
    _bounds: Element["bounds"],
    _overlayBounds: Element["bounds"][]
  ): { startX: number; startY: number; endX: number; endY: number; warning?: string } | null {
    return this.safeCoords;
  }
}
