import { BootedDevice, GestureOptions } from "../../../models";
import { logger } from "../../../utils/logger";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../../utils/PerformanceTracker";
import { SwipeResult } from "../../../models/SwipeResult";
import { GestureExecutor } from "./types";
import type { IosVoiceOverDetector } from "../../../utils/interfaces/IosVoiceOverDetector";
import type { CtrlProxyService } from "../../observe/ios/CtrlProxyClient";

/**
 * VoiceOverSwipeExecutor handles iOS VoiceOver-compatible swipe gestures.
 *
 * When VoiceOver is active on iOS, single-finger swipes navigate accessibility
 * focus rather than scrolling content. This executor uses 3-finger swipes
 * (multi-finger gestures) to scroll content while VoiceOver is running.
 *
 * Parallel to TalkBackSwipeExecutor for Android TalkBack.
 */
export class VoiceOverSwipeExecutor {
  constructor(
    private readonly device: BootedDevice,
    private readonly executeGesture: GestureExecutor,
    private readonly iosClient: CtrlProxyService,
    private readonly iosVoiceOverDetector: IosVoiceOverDetector,
  ) {}

  /**
   * Execute a swipe gesture with VoiceOver awareness.
   *
   * If VoiceOver is enabled and the platform is iOS, performs a 3-finger swipe
   * to scroll content. Falls back to standard single-finger swipe on failure
   * or when VoiceOver is disabled.
   *
   * @param x1 - Start X coordinate
   * @param y1 - Start Y coordinate
   * @param x2 - End X coordinate
   * @param y2 - End Y coordinate
   * @param gestureOptions - Optional gesture options (duration, scrollMode)
   * @param perf - Optional performance tracker
   */
  async executeSwipeGesture(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gestureOptions?: GestureOptions,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<SwipeResult> {
    if (this.device.platform !== "ios") {
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
    }

    const isVoiceOverEnabled = await this.iosVoiceOverDetector.isVoiceOverEnabled(
      this.device.id,
      this.iosClient
    );

    if (!isVoiceOverEnabled) {
      return this.executeGesture.swipe(x1, y1, x2, y2, gestureOptions, perf);
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
}
