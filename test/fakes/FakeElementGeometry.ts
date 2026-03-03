import type { Element, ElementBounds } from "../../src/models";
import type { Point } from "../../src/models/Point";
import type { ElementGeometry } from "../../src/utils/interfaces/ElementGeometry";

export class FakeElementGeometry implements ElementGeometry {
  swipeResult = { startX: 200, startY: 700, endX: 200, endY: 200 };
  swipeDuration = 300;

  getElementCenter(_element: Element): Point {
    return { x: 0, y: 0 };
  }

  isPointInElement(_element: Element, _x: number, _y: number): boolean {
    return false;
  }

  isElementVisible(_element: Element, _screenWidth: number, _screenHeight: number): boolean {
    return true;
  }

  getVisibleBounds(_element: Element, _screenWidth: number, _screenHeight: number): ElementBounds | null {
    return null;
  }

  getSwipeWithinBounds(
    _direction: "up" | "down" | "left" | "right",
    _bounds: ElementBounds
  ): { startX: number; startY: number; endX: number; endY: number } {
    return this.swipeResult;
  }

  getSwipeDirectionForScroll(
    direction: "up" | "down" | "left" | "right"
  ): "up" | "down" | "left" | "right" {
    return direction;
  }

  getSwipeDurationFromSpeed(_speed?: "slow" | "fast" | "normal"): number {
    return this.swipeDuration;
  }
}
