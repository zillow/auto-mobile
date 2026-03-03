import {
  ActionableError,
  BootedDevice,
  Element,
  GestureOptions,
  SwipeDirection
} from "../../../models";
import { logger } from "../../../utils/logger";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { CtrlProxyClient } from "../../observe/android";
import { AccessibilityDetector } from "../../../utils/interfaces/AccessibilityDetector";
import { SwipeResult } from "../../../models/SwipeResult";
import { GestureExecutor, BoomerangConfig, TalkBackSwipeRunner } from "./types";
import { Timer } from "../../../utils/interfaces/Timer";

export class TalkBackSwipeExecutor implements TalkBackSwipeRunner {
  private static readonly DEFAULT_APEX_PAUSE_MS = 100;
  private static readonly DEFAULT_RETURN_SPEED = 1;

  constructor(
    private readonly device: BootedDevice,
    private readonly executeGesture: GestureExecutor,
    private readonly accessibilityService: CtrlProxyClient,
    private readonly accessibilityDetector: AccessibilityDetector,
    private readonly timer: Timer
  ) {}

  async executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: SwipeDirection,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf?: PerformanceTracker,
    boomerang?: BoomerangConfig
  ): Promise<SwipeResult> {
    const boomerangEnabled = Boolean(boomerang);
    logger.info(`[SwipeOn] executeSwipeGesture: direction=${direction}, (${x1},${y1})→(${x2},${y2}), duration=${gestureOptions?.duration}ms, boomerang=${boomerangEnabled}, container=${containerElement?.["resource-id"] ?? "none"}`);

    // Only check TalkBack for Android platform
    if (this.device.platform !== "android") {
      if (boomerangEnabled) {
        return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang!, perf);
      }
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }

    // Check if TalkBack is enabled (not just any accessibility service)
    const detectedService = await this.accessibilityDetector.detectMethod(
      this.device.deviceId,
      null
    );
    const isTalkBackEnabled = detectedService === "talkback";

    if (isTalkBackEnabled) {
      if (boomerangEnabled) {
        logger.info("[SwipeOn] TalkBack enabled, boomerang requested; announcing swipeable element");
        return this.announceSwipeable(x1, y1, x2, y2, containerElement, gestureOptions, perf);
      }

      logger.info("[SwipeOn] TalkBack enabled, using accessibility-aware swipe");
      return this.executeAndroidSwipeWithAccessibility(
        x1, y1, x2, y2,
        direction,
        containerElement,
        gestureOptions,
        perf
      );
    } else {
      if (boomerangEnabled) {
        logger.debug("[SwipeOn] TalkBack disabled, using boomerang swipe");
        return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang!, perf);
      }

      // Standard mode: Use coordinate-based swipes
      logger.debug("[SwipeOn] TalkBack disabled, using standard swipe");
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }
  }

  async executeBoomerangGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions: GestureOptions | undefined,
    boomerang: BoomerangConfig,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    const forwardDuration = gestureOptions?.duration ?? 300;
    const returnDuration = this.getReturnDuration(forwardDuration, boomerang.returnSpeed);
    const totalDuration = forwardDuration + boomerang.apexPauseMs + returnDuration;

    const forwardOptions = this.buildGestureOptions(gestureOptions, forwardDuration);
    const returnOptions = this.buildGestureOptions(gestureOptions, returnDuration);

    const forwardResult = await this.executeGesture.swipe(x1, y1, x2, y2, forwardOptions, perf);
    if (!forwardResult.success) {
      return forwardResult;
    }

    if (boomerang.apexPauseMs > 0) {
      await this.timer.sleep(boomerang.apexPauseMs);
    }

    const returnResult = await this.executeGesture.swipe(x2, y2, x1, y1, returnOptions, perf);
    if (!returnResult.success) {
      return {
        ...returnResult,
        x1,
        y1,
        x2,
        y2,
        duration: totalDuration
      };
    }

    return {
      ...forwardResult,
      x1,
      y1,
      x2,
      y2,
      duration: totalDuration,
      a11yTotalTimeMs: this.sumOptional(forwardResult.a11yTotalTimeMs, returnResult.a11yTotalTimeMs),
      a11yGestureTimeMs: this.sumOptional(forwardResult.a11yGestureTimeMs, returnResult.a11yGestureTimeMs),
      fallbackReason: forwardResult.fallbackReason ?? returnResult.fallbackReason
    };
  }

  async announceSwipeable(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    const duration = gestureOptions?.duration ?? 0;
    const resourceId = containerElement?.["resource-id"];

    if (!resourceId) {
      const error = "Boomerang swipe in TalkBack mode requires a container element with a resource-id.";
      logger.warn(`[SwipeOn] ${error}`);
      return {
        success: false,
        error,
        x1,
        y1,
        x2,
        y2,
        duration
      };
    }

    const result = await this.accessibilityService.requestAction(
      "focus",
      resourceId,
      5000,
      perf
    );

    if (!result.success) {
      const error = result.error ?? "Failed to set accessibility focus for boomerang swipe.";
      logger.warn(`[SwipeOn] ${error}`);
      return {
        success: false,
        error,
        x1,
        y1,
        x2,
        y2,
        duration
      };
    }

    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration
    };
  }

  async executeAndroidSwipeWithAccessibility(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: SwipeDirection,
    containerElement: Element | null,
    gestureOptions?: GestureOptions,
    perf?: PerformanceTracker
  ): Promise<SwipeResult> {
    // Try accessibility scroll actions if container is known and has resource-id
    if (containerElement && containerElement["resource-id"]) {
      // Map swipe direction to ACTION_SCROLL semantics (forward = down/right, backward = up/left).
      const scrollAction = (direction === "down" || direction === "right")
        ? "scroll_forward"
        : "scroll_backward";

      logger.info(`[SwipeOn] Attempting ACTION_SCROLL (${scrollAction}) on container: ${containerElement["resource-id"]}`);

      try {
        const result = await this.accessibilityService.requestAction(
          scrollAction,
          containerElement["resource-id"],
          5000,
          perf || new NoOpPerformanceTracker()
        );

        if (result.success) {
          logger.info("[SwipeOn] ACTION_SCROLL succeeded");
          return {
            success: true,
            x1,
            y1,
            x2,
            y2,
            duration: gestureOptions?.duration || 300
          };
        } else {
          logger.warn(`[SwipeOn] ACTION_SCROLL failed: ${result.error}, falling back to two-finger swipe`);
        }
      } catch (error) {
        logger.warn(`[SwipeOn] ACTION_SCROLL error: ${error}, falling back to two-finger swipe`);
      }
    } else {
      logger.debug("[SwipeOn] No container with resource-id, skipping ACTION_SCROLL");
    }

    // Fallback to two-finger swipe
    logger.info("[SwipeOn] Using two-finger swipe gesture for TalkBack");
    const duration = gestureOptions?.duration || 300;
    const offset = 100; // Fixed offset as per design doc

    const a11yResult = await this.accessibilityService.requestTwoFingerSwipe(
      x1, y1, x2, y2,
      duration,
      offset,
      5000,
      perf || new NoOpPerformanceTracker()
    );

    if (a11yResult.success) {
      return {
        success: true,
        x1,
        y1,
        x2,
        y2,
        duration
      };
    } else {
      throw new ActionableError(
        `Two-finger swipe failed: ${a11yResult.error || "Unknown error"}`
      );
    }
  }

  buildGestureOptions(base: GestureOptions | undefined, duration: number): GestureOptions {
    return {
      ...(base ?? {}),
      duration
    };
  }

  getReturnDuration(forwardDuration: number, returnSpeed: number): number {
    return Math.max(1, Math.round(forwardDuration / returnSpeed));
  }

  sumOptional(a?: number, b?: number): number | undefined {
    if (a === undefined && b === undefined) {
      return undefined;
    }
    return (a ?? 0) + (b ?? 0);
  }

  resolveBoomerangConfig(options: { boomerang?: boolean; apexPause?: number; returnSpeed?: number }): BoomerangConfig | undefined {
    if (!options.boomerang) {
      return undefined;
    }

    return {
      apexPauseMs: options.apexPause ?? TalkBackSwipeExecutor.DEFAULT_APEX_PAUSE_MS,
      returnSpeed: options.returnSpeed ?? TalkBackSwipeExecutor.DEFAULT_RETURN_SPEED
    };
  }
}
