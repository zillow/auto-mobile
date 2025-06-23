import { BaseVisualChange } from "./BaseVisualChange";
import { ExecuteGesture } from "./ExecuteGesture";
import { FingerPath } from "../../models/FingerPath";
import { PinchResult } from "../../models/PinchResult";
import { ElementUtils } from "../utility/ElementUtils";

/**
 * Performs pinch-to-zoom gestures using two fingers
 */
// TODO: Before creating an MCP tool call that exposes this functionality, get binary file implementation working
export class PinchToZoom extends BaseVisualChange {
  private executeGesture: ExecuteGesture;
  private elementUtils: ElementUtils;

  constructor(deviceId: string | null = null) {
    super(deviceId);
    this.executeGesture = new ExecuteGesture(deviceId);
    this.elementUtils = new ElementUtils();
  }

  /**
   * Execute a pinch gesture with direction and magnitude
   * @param direction - "in" for pinch in, "out" for pinch out
   * @param magnitude - Maximum distance between fingers in pixels
   * @param duration - Duration of the gesture in milliseconds
   * @param elementId - Optional element ID to pinch on
   * @returns Result of the pinch operation with observation
   */
  async execute(
    direction: "in" | "out",
    magnitude: number,
    duration: number = 300,
    elementId?: string
  ): Promise<PinchResult> {
    return this.observedChange(
      async () => {
        const { centerX, centerY } = await this.findCenterPoint(elementId);
        const { startingMagnitude, endingMagnitude } = this.calculateMagnitudes(direction, magnitude);
        const fingerPaths = this.createFingerPaths(centerX, centerY, startingMagnitude, endingMagnitude);

        await this.executeGesture.execute(fingerPaths, duration);

        return {
          success: true,
          startingMagnitude,
          endingMagnitude,
          duration,
          centerX,
          centerY
        };
      },
      {
        changeExpected: true,
        timeoutMs: 1000
      }
    );
  }

  /**
   * Find the center point for the pinch gesture
   * @param elementId - Optional element ID to find center of
   * @returns Center coordinates
   */
  private async findCenterPoint(elementId?: string): Promise<{ centerX: number; centerY: number }> {
    if (elementId) {
      return this.findElementCenter(elementId);
    } else {
      return this.findScreenCenter();
    }
  }

  /**
   * Find the center of a specific element
   * @param elementId - Element ID to find
   * @returns Center coordinates of the element, or screen center if element not found
   */
  private async findElementCenter(elementId: string): Promise<{ centerX: number; centerY: number }> {
    const observation = await this.observeScreen.execute();

    if (!observation.viewHierarchy) {
      // Fall back to screen center if view hierarchy not available
      return this.findScreenCenter();
    }

    const elements = this.elementUtils.findElementsByResourceId(
      observation.viewHierarchy,
      elementId,
      true // partial match
    );

    if (elements.length === 0) {
      // Fall back to screen center if element not found
      return this.findScreenCenter();
    }

    const element = elements[0];
    const elementProps = this.elementUtils.parseNodeBounds(element);
    if (!elementProps || !elementProps.bounds) {
      // Fall back to screen center if bounds cannot be parsed
      return this.findScreenCenter();
    }

    const bounds = elementProps.bounds;
    return {
      centerX: (bounds.left + bounds.right) / 2,
      centerY: (bounds.top + bounds.bottom) / 2
    };
  }

  /**
   * Find the center of the screen
   * @returns Center coordinates of the screen
   */
  private async findScreenCenter(): Promise<{ centerX: number; centerY: number }> {
    const observation = await this.observeScreen.execute();

    if (!observation.screenSize) {
      throw new Error("Could not get screen size for pinch gesture");
    }

    return {
      centerX: observation.screenSize.width / 2,
      centerY: observation.screenSize.height / 2
    };
  }

  /**
   * Calculate starting and ending magnitudes based on direction
   * @param direction - Pinch direction
   * @param magnitude - Maximum magnitude
   * @returns Starting and ending magnitudes
   */
  private calculateMagnitudes(
    direction: "in" | "out",
    magnitude: number
  ): { startingMagnitude: number; endingMagnitude: number } {
    if (direction === "out") {
      // Pinch out: start small, end large
      return {
        startingMagnitude: Math.max(50, magnitude * 0.3), // Minimum starting size
        endingMagnitude: magnitude
      };
    } else {
      // Pinch in: start large, end small
      return {
        startingMagnitude: magnitude,
        endingMagnitude: Math.max(50, magnitude * 0.3) // Minimum ending size
      };
    }
  }

  /**
   * Create finger paths for the pinch gesture
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param startingMagnitude - Starting distance between fingers
   * @param endingMagnitude - Ending distance between fingers
   * @returns Array of finger paths
   */
  private createFingerPaths(
    centerX: number,
    centerY: number,
    startingMagnitude: number,
    endingMagnitude: number
  ): FingerPath[] {
    const startDistance = startingMagnitude / 2;
    const endDistance = endingMagnitude / 2;

    const finger1Path: FingerPath = {
      finger: 0,
      points: [
        { x: centerX, y: centerY - startDistance },
        { x: centerX, y: centerY - endDistance }
      ]
    };

    const finger2Path: FingerPath = {
      finger: 1,
      points: [
        { x: centerX, y: centerY + startDistance },
        { x: centerX, y: centerY + endDistance }
      ]
    };

    return [finger1Path, finger2Path];
  }
}
