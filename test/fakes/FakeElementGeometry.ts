import type { Element } from "../../src/models/Element";
import type { Point } from "../../src/models/Point";
import type { ElementBounds } from "../../src/models";
import type { ElementGeometry } from "../../src/utils/interfaces/ElementGeometry";

export class FakeElementGeometry implements ElementGeometry {
  nextCenter: Point = { x: 0, y: 0 };
  nextPointInElement: boolean = false;
  nextVisible: boolean = true;
  nextVisibleBounds: ElementBounds | null = null;
  nextSwipeCoordinates: { startX: number; startY: number; endX: number; endY: number } = {
    startX: 0, startY: 0, endX: 0, endY: 0
  };
  nextSwipeDirection: "up" | "down" | "left" | "right" = "up";
  nextSwipeDuration: number = 300;

  getElementCenter(_element: Element): Point {
    return this.nextCenter;
  }

  isPointInElement(_element: Element, _x: number, _y: number): boolean {
    return this.nextPointInElement;
  }

  isElementVisible(_element: Element, _screenWidth: number, _screenHeight: number): boolean {
    return this.nextVisible;
  }

  getVisibleBounds(_element: Element, _screenWidth: number, _screenHeight: number): ElementBounds | null {
    return this.nextVisibleBounds;
  }

  getSwipeWithinBounds(
    _direction: "up" | "down" | "left" | "right",
    _bounds: ElementBounds
  ): { startX: number; startY: number; endX: number; endY: number } {
    return this.nextSwipeCoordinates;
  }

  getSwipeDirectionForScroll(
    _direction: "up" | "down" | "left" | "right"
  ): "up" | "down" | "left" | "right" {
    return this.nextSwipeDirection;
  }

  getSwipeDurationFromSpeed(_speed?: "slow" | "fast" | "normal"): number {
    return this.nextSwipeDuration;
  }
}
