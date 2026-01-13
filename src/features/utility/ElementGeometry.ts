import { Element } from "../../models/Element";
import { Point } from "../../models/Point";
import { ElementBounds } from "../../models";

/**
 * Handles bounds and coordinate calculations for UI elements
 */
export class ElementGeometry {
  /**
   * Calculate the center point of an element
   * @param element - Element to get center for
   * @returns Center point coordinates
   */
  getElementCenter(element: Element): Point {
    const bounds = element.bounds;
    return {
      x: Math.floor((bounds.left + bounds.right) / 2),
      y: Math.floor((bounds.top + bounds.bottom) / 2)
    };
  }

  /**
   * Check if coordinates are within element bounds
   * @param element - Element to check
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns True if coordinates are within element bounds
   */
  isPointInElement(element: Element, x: number, y: number): boolean {
    const bounds = element.bounds;
    return (
      x >= bounds.left &&
      x <= bounds.right &&
      y >= bounds.top &&
      y <= bounds.bottom
    );
  }

  /**
   * Check if an element is visible on screen
   * @param element - Element to check
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @returns True if element is visible
   */
  isElementVisible(element: Element, screenWidth: number, screenHeight: number): boolean {
    const bounds = element.bounds;

    // Check if at least part of the element is within screen bounds
    return (
      bounds.right > 0 &&
      bounds.bottom > 0 &&
      bounds.left < screenWidth &&
      bounds.top < screenHeight
    );
  }

  /**
   * Calculate the visible portion of an element
   * @param element - Element to check
   * @param screenWidth - Screen width
   * @param screenHeight - Screen height
   * @returns Bounds of the visible portion or null if not visible
   */
  getVisibleBounds(element: Element, screenWidth: number, screenHeight: number): Element["bounds"] | null {
    const bounds = element.bounds;

    // Check if element is visible at all
    if (!this.isElementVisible(element, screenWidth, screenHeight)) {
      return null;
    }

    // Calculate visible bounds
    return {
      left: Math.max(0, bounds.left),
      top: Math.max(0, bounds.top),
      right: Math.min(screenWidth, bounds.right),
      bottom: Math.min(screenHeight, bounds.bottom)
    };
  }

  /**
   * Calculate start and end coordinates for swipe based on bounds and direction
   * @param direction - Direction to swipe ('up', 'down', 'left', 'right')
   * @param bounds - The coordinate bounds to swipe within
   * @returns Start and end coordinates for the swipe
   */
  getSwipeWithinBounds(
    direction: "up" | "down" | "left" | "right",
    bounds: ElementBounds
  ): { startX: number; startY: number; endX: number; endY: number } {

    const centerX = Math.floor((bounds.left + bounds.right) / 2);
    const centerY = Math.floor((bounds.top + bounds.bottom) / 2);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;

    // Use full available space with padding based on actual dimensions
    let startX = centerX;
    let startY = centerY;
    let endX = centerX;
    let endY = centerY;

    switch (direction) {
      case "up":
        // For "up" direction: Swipe finger from bottom to top
        startY = bounds.bottom - (height * 0.25);
        endY = bounds.top + (height * 0.1);
        break;
      case "down":
        // For "down" direction: Swipe finger from top to bottom
        startY = bounds.top + (height * 0.1);
        endY = bounds.bottom - (height * 0.1);
        break;
      case "left":
        // For "left" direction: Swipe finger from right to left
        startX = bounds.right - (width * 0.1);
        endX = bounds.left + (width * 0.1);
        break;
      case "right":
        // For "right" direction: Swipe finger from left to right
        startX = bounds.left + (width * 0.1);
        endX = bounds.right - (width * 0.1);
        break;
    }

    return { startX, startY, endX, endY };
  }

  /**
   * Get the swipe direction for scrolling (opposite of content movement)
   * @param direction - Direction to scroll the content
   * @returns The swipe direction needed to achieve the scroll
   */
  getSwipeDirectionForScroll(
    direction: "up" | "down" | "left" | "right"
  ): "up" | "down" | "left" | "right" {

    switch (direction) {
      case "up":
        return "down";
      case "down":
        return "up";
      case "left":
        return "right";
      case "right":
        return "left";
    }
  }

  /**
   * Get swipe duration based on speed
   * @param speed - Speed of the swipe
   * @returns Duration in milliseconds
   */
  getSwipeDurationFromSpeed(speed: "slow" | "fast" | "normal" = "normal"): number {
    switch (speed) {
      case "slow":
        return 600;
      case "fast":
        return 100;
      case "normal":
      default:
        return 300;
    }
  }
}
