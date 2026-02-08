import type { Element } from "../../models/Element";
import type { Point } from "../../models/Point";
import type { ElementBounds } from "../../models";

export interface ElementGeometry {
  getElementCenter(element: Element): Point;
  isPointInElement(element: Element, x: number, y: number): boolean;
  isElementVisible(element: Element, screenWidth: number, screenHeight: number): boolean;
  getVisibleBounds(element: Element, screenWidth: number, screenHeight: number): ElementBounds | null;
  getSwipeWithinBounds(
    direction: "up" | "down" | "left" | "right",
    bounds: ElementBounds
  ): { startX: number; startY: number; endX: number; endY: number };
  getSwipeDirectionForScroll(
    direction: "up" | "down" | "left" | "right"
  ): "up" | "down" | "left" | "right";
  getSwipeDurationFromSpeed(speed?: "slow" | "fast" | "normal"): number;
}
