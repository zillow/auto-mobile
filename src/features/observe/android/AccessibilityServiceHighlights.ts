/**
 * AccessibilityServiceHighlights - Delegate for visual highlight overlay operations.
 *
 * This delegate handles adding and managing visual highlight overlays on the device.
 */

import WebSocket from "ws";
import { logger } from "../../../utils/logger";
import type { PerformanceTracker } from "../../../utils/PerformanceTracker";
import { NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import type { HighlightOperationResult, HighlightShape } from "../../../models";
import type { DelegateContext, NormalizedHighlightBounds } from "./types";

/**
 * Delegate class for handling visual highlight overlay operations.
 */
export class AccessibilityServiceHighlights {
  private readonly context: DelegateContext;

  constructor(context: DelegateContext) {
    this.context = context;
  }

  /**
   * Add a visual highlight overlay entry.
   */
  async requestAddHighlight(
    id: string,
    shape: HighlightShape,
    timeoutMs: number = 5000,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<HighlightOperationResult> {
    return this.requestHighlightOperation(
      "add_highlight",
      { id, shape },
      timeoutMs,
      perf
    );
  }

  /**
   * Internal method to perform highlight operations.
   */
  private async requestHighlightOperation(
    type: "add_highlight",
    payload: { id: string; shape: HighlightShape },
    timeoutMs: number,
    perf: PerformanceTracker
  ): Promise<HighlightOperationResult> {
    const startTime = this.context.timer.now();

    try {
      const connected = await perf.track("ensureConnection", () => this.context.ensureConnected(perf));
      if (!connected) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to establish WebSocket connection for highlight operation");
        return {
          success: false,
          error: "Failed to connect to accessibility service"
        };
      }

      const requestId = this.context.requestManager.generateId("highlight");

      // Register request with automatic timeout handling
      const highlightPromise = this.context.requestManager.register<HighlightOperationResult>(
        requestId,
        "highlight",
        timeoutMs,
        (_id, _type, timeout) => ({
          success: false,
          error: `Highlight request timeout after ${timeout}ms`
        })
      );

      await perf.track("sendRequest", async () => {
        const ws = this.context.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("WebSocket not connected");
        }

        const messagePayload: Record<string, unknown> = {
          type,
          requestId
        };

        if (payload.id) {
          messagePayload.id = payload.id;
        }
        if (payload.shape) {
          messagePayload.shape = this.normalizeHighlightShape(payload.shape);
        }

        ws.send(JSON.stringify(messagePayload));
        logger.debug(`[ACCESSIBILITY_SERVICE] Sent highlight request (${type}, requestId: ${requestId})`);
      });

      const result = await perf.track("waitForHighlight", () => highlightPromise);
      const duration = this.context.timer.now() - startTime;

      if (result.success) {
        logger.info(`[ACCESSIBILITY_SERVICE] Highlight ${type} completed in ${duration}ms`);
      } else {
        logger.warn(`[ACCESSIBILITY_SERVICE] Highlight ${type} failed after ${duration}ms: ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = this.context.timer.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Highlight ${type} request failed after ${duration}ms: ${error}`);
      return {
        success: false,
        error: `${error}`
      };
    }
  }

  /**
   * Normalize highlight shape bounds to integers.
   */
  private normalizeHighlightShape(shape: HighlightShape): HighlightShape {
    const normalizeBounds = (bounds: HighlightShape["bounds"]): NormalizedHighlightBounds | undefined => {
      if (!bounds) {
        return bounds;
      }
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        sourceWidth: bounds.sourceWidth === null || bounds.sourceWidth === undefined
          ? bounds.sourceWidth
          : Math.round(bounds.sourceWidth),
        sourceHeight: bounds.sourceHeight === null || bounds.sourceHeight === undefined
          ? bounds.sourceHeight
          : Math.round(bounds.sourceHeight)
      };
    };

    if (shape.type === "path") {
      return {
        ...shape,
        bounds: normalizeBounds(shape.bounds)
      };
    }

    return {
      ...shape,
      bounds: normalizeBounds(shape.bounds)
    };
  }
}
