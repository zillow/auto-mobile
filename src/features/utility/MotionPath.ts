import { Point } from "../../models/Point";
import { GestureOptions } from "../../models/GestureOptions";

/**
 * Utility class for creating natural motion paths for gestures
 */
export class MotionPath {
  /**
   * Create a natural motion path between two points
   * @param start - Starting point
   * @param end - Ending point
   * @param steps - Number of points to generate
   * @param options - Gesture options
   * @returns Array of points forming the path
   */
  static create(
    start: Point,
    end: Point,
    steps: number = 25,
    options: GestureOptions = {}
  ): Point[] {
    const { easing = "accelerateDecelerate", randomize = false } = options;

    const path: Point[] = [];
    const xDist = end.x - start.x;
    const yDist = end.y - start.y;

    // Calculate delay for each step if duration is set
    const stepDelay = options.duration ? Math.floor(options.duration / steps) : undefined;

    for (let i = 0; i <= steps; i++) {
      // Calculate progress (0.0 to 1.0)
      let progress = i / steps;

      // Apply easing function
      switch (easing) {
        case "linear":
          // No change to progress
          break;
        case "accelerate":
          progress = progress * progress;
          break;
        case "decelerate":
          progress = 1 - (1 - progress) * (1 - progress);
          break;
        case "accelerateDecelerate":
          // Ease in, ease out - cubic function
          progress = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          break;
      }

      // Calculate point position
      let x = Math.round(start.x + xDist * progress);
      let y = Math.round(start.y + yDist * progress);

      // Add small random variations if requested
      if (randomize) {
        const randomFactor = 3; // pixels
        x += Math.floor(Math.random() * randomFactor * 2 - randomFactor);
        y += Math.floor(Math.random() * randomFactor * 2 - randomFactor);
      }

      // Add point to path with optional delay
      path.push({
        x,
        y,
        delay: stepDelay
      });
    }

    return path;
  }
}
