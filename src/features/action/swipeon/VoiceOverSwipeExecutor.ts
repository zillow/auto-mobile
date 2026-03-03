import { BootedDevice, GestureOptions } from "../../../models";
import { logger } from "../../../utils/logger";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { SwipeResult } from "../../../models/SwipeResult";
import { BoomerangConfig, GestureExecutor, VoiceOverSwipeRunner } from "./types";
import type { IosVoiceOverDetector } from "../../../utils/interfaces/IosVoiceOverDetector";
import type { CtrlProxyService } from "../../observe/ios/CtrlProxyClient";
import { Timer } from "../../../utils/interfaces/Timer";

/**
 * VoiceOverSwipeExecutor handles iOS VoiceOver-compatible swipe gestures.
 *
 * When VoiceOver is active on iOS, single-finger swipes navigate accessibility
 * focus rather than scrolling content. This executor uses 3-finger swipes
 * (multi-finger gestures) to scroll content while VoiceOver is running.
 *
 * Parallel to TalkBackSwipeExecutor for Android TalkBack.
 */
export class VoiceOverSwipeExecutor implements VoiceOverSwipeRunner {
  constructor(
    private readonly device: BootedDevice,
    private readonly executeGesture: GestureExecutor,
    private readonly iosClient: CtrlProxyService,
    private readonly iosVoiceOverDetector: IosVoiceOverDetector,
    private readonly timer: Timer
  ) {}

  /**
   * Execute a swipe gesture with VoiceOver awareness.
   *
   * If VoiceOver is enabled and the platform is iOS, performs a 3-finger swipe
   * to scroll content. Falls back to standard single-finger swipe on failure
   * or when VoiceOver is disabled.
   *
   * When boomerang is provided, performs a forward swipe, optional apex pause,
   * then a return swipe — using 3-finger swipes when VoiceOver is active.
   *
   * @param x1 - Start X coordinate
   * @param y1 - Start Y coordinate
   * @param x2 - End X coordinate
   * @param y2 - End Y coordinate
   * @param gestureOptions - Optional gesture options (duration, scrollMode)
   * @param perf - Optional performance tracker
   * @param boomerang - Optional boomerang configuration
   */
  async executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions?: GestureOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    boomerang?: BoomerangConfig
  ): Promise<SwipeResult> {
    if (this.device.platform !== "ios") {
      if (boomerang) {
        return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang, perf);
      }
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }

    const isVoiceOverEnabled = await this.iosVoiceOverDetector.isVoiceOverEnabled(
      this.device.id,
      this.iosClient
    );

    if (!isVoiceOverEnabled) {
      if (boomerang) {
        return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang, perf);
      }
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }

    // VoiceOver is enabled
    if (boomerang) {
      return this.executeVoiceOverBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang, perf);
    }

    // VoiceOver is enabled: use 3-finger swipe to scroll content
    const duration = gestureOptions?.duration ?? 300;
    logger.info("[VoiceOverSwipeExecutor] VoiceOver enabled, using 3-finger swipe");

    try {
      const result = await this.iosClient.requestMultiFingerSwipe(
        x1, y1, x2, y2,
        3, // 3 fingers for VoiceOver scrolling
        duration
      );

      if (result.success) {
        return {
          success: true,
          x1,
          y1,
          x2,
          y2,
          duration,
        };
      }

      logger.warn(
        `[VoiceOverSwipeExecutor] 3-finger swipe failed: ${result.error ?? "unknown error"}, ` +
        `falling back to standard swipe at (${x1},${y1}) → (${x2},${y2})`
      );
    } catch (error) {
      logger.warn(
        `[VoiceOverSwipeExecutor] 3-finger swipe error: ${error}, ` +
        `falling back to standard swipe`
      );
    }

    // Fallback to standard single-finger swipe
    return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
  }

  /**
   * Execute a boomerang gesture using standard swipes (VoiceOver disabled or non-iOS).
   * Performs a forward swipe, optional apex pause, then a return swipe.
   */
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
      duration: totalDuration
    };
  }

  /**
   * Execute a boomerang gesture using 3-finger swipes (VoiceOver enabled).
   * Performs a forward 3-finger swipe, optional apex pause, then a return 3-finger swipe.
   * Falls back to executeBoomerangGesture (standard swipes) if the forward stroke fails or throws,
   * mirroring the non-boomerang VoiceOver fallback behavior.
   */
  private async executeVoiceOverBoomerangGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions: GestureOptions | undefined,
    boomerang: BoomerangConfig,
    perf: PerformanceTracker
  ): Promise<SwipeResult> {
    const forwardDuration = gestureOptions?.duration ?? 300;
    const returnDuration = this.getReturnDuration(forwardDuration, boomerang.returnSpeed);
    const totalDuration = forwardDuration + boomerang.apexPauseMs + returnDuration;

    logger.info("[VoiceOverSwipeExecutor] VoiceOver enabled, using 3-finger boomerang swipe");

    let forwardResult: Awaited<ReturnType<typeof this.iosClient.requestMultiFingerSwipe>>;
    try {
      forwardResult = await this.iosClient.requestMultiFingerSwipe(
        x1, y1, x2, y2,
        3,
        forwardDuration
      );
    } catch (error) {
      logger.warn(
        `[VoiceOverSwipeExecutor] 3-finger boomerang forward swipe error: ${error}, ` +
        `falling back to standard boomerang`
      );
      return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang, perf);
    }

    if (!forwardResult.success) {
      logger.warn(
        `[VoiceOverSwipeExecutor] 3-finger boomerang forward swipe failed: ${forwardResult.error ?? "unknown error"}, ` +
        `falling back to standard boomerang`
      );
      return this.executeBoomerangGesture(x1, y1, x2, y2, gestureOptions, boomerang, perf);
    }

    if (boomerang.apexPauseMs > 0) {
      await this.timer.sleep(boomerang.apexPauseMs);
    }

    let returnResult: Awaited<ReturnType<typeof this.iosClient.requestMultiFingerSwipe>>;
    try {
      returnResult = await this.iosClient.requestMultiFingerSwipe(
        x2, y2, x1, y1,
        3,
        returnDuration
      );
    } catch (error) {
      logger.warn(`[VoiceOverSwipeExecutor] 3-finger boomerang return swipe error: ${error}`);
      return {
        success: false,
        error: String(error),
        x1,
        y1,
        x2,
        y2,
        duration: totalDuration
      };
    }

    if (!returnResult.success) {
      return {
        success: false,
        error: returnResult.error,
        x1,
        y1,
        x2,
        y2,
        duration: totalDuration
      };
    }

    return {
      success: true,
      x1,
      y1,
      x2,
      y2,
      duration: totalDuration
    };
  }

  private getReturnDuration(forwardDuration: number, returnSpeed: number): number {
    return Math.max(1, Math.round(forwardDuration / returnSpeed));
  }

  private buildGestureOptions(base: GestureOptions | undefined, duration: number): GestureOptions {
    return {
      ...(base ?? {}),
      duration
    };
  }
}
