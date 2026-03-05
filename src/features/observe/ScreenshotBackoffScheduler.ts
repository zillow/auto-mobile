import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { logger } from "../../utils/logger";
import crypto from "crypto";

/**
 * Result of a screenshot capture attempt
 */
export interface ScreenshotCaptureResult {
  success: boolean;
  data?: string; // base64 encoded
  checksum?: string;
  error?: string;
}

/**
 * Callback to capture a screenshot
 */
type ScreenshotCaptureCallback = () => Promise<ScreenshotCaptureResult>;

/**
 * Callback to emit a screenshot to the stream
 */
type ScreenshotEmitCallback = (data: string) => void;

/**
 * Interface for screenshot backoff scheduling.
 *
 * On an observability event, captures screenshots at backoff intervals:
 * t=0, t=100, t=300, t=500, t=800, t=1300 ms
 *
 * - Skips emitting if screenshot checksum matches previous
 * - Cancels pending captures if new activity occurs
 */
export interface ScreenshotBackoffScheduler {
  /**
   * Start a new backoff sequence. Cancels any existing sequence.
   */
  startBackoffSequence(): void;

  /**
   * Cancel any pending screenshot captures.
   * Called when new activity occurs (e.g., new request to accessibility service).
   */
  cancelPendingCaptures(): void;

  /**
   * Check if a backoff sequence is currently active.
   */
  isActive(): boolean;

  /**
   * Get the number of pending captures remaining in the current sequence.
   */
  getPendingCount(): number;
}

/**
 * Configuration for the backoff scheduler
 */
interface ScreenshotBackoffConfig {
  /**
   * Backoff intervals in milliseconds from the start of the sequence.
   * Default: [0, 100, 300, 500, 800, 1300]
   */
  intervals: number[];
}

const DEFAULT_CONFIG: ScreenshotBackoffConfig = {
  intervals: [0, 100, 300, 500, 800, 1300],
};

/**
 * Compute MD5 checksum of a string (for comparing screenshots)
 */
export function computeChecksum(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Default implementation of ScreenshotBackoffScheduler
 */
export class DefaultScreenshotBackoffScheduler implements ScreenshotBackoffScheduler {
  private timer: Timer;
  private captureCallback: ScreenshotCaptureCallback;
  private emitCallback: ScreenshotEmitCallback;
  private config: ScreenshotBackoffConfig;

  private pendingTimeouts: ReturnType<Timer["setTimeout"]>[] = [];
  private lastEmittedChecksum: string | null = null;
  private sequenceId: number = 0;

  constructor(
    captureCallback: ScreenshotCaptureCallback,
    emitCallback: ScreenshotEmitCallback,
    config: ScreenshotBackoffConfig = DEFAULT_CONFIG,
    timer: Timer = defaultTimer
  ) {
    this.captureCallback = captureCallback;
    this.emitCallback = emitCallback;
    this.config = config;
    this.timer = timer;
  }

  startBackoffSequence(): void {
    // Cancel any existing sequence
    this.cancelPendingCaptures();

    // Increment sequence ID to invalidate any in-flight captures from previous sequence
    this.sequenceId++;
    const currentSequenceId = this.sequenceId;

    logger.debug(`[ScreenshotBackoff] Starting backoff sequence ${currentSequenceId} with intervals: ${this.config.intervals.join(", ")}ms`);

    // Schedule captures at each interval
    for (const interval of this.config.intervals) {
      const timeoutId = this.timer.setTimeout(() => {
        this.captureAtInterval(currentSequenceId, interval);
      }, interval);
      this.pendingTimeouts.push(timeoutId);
    }
  }

  cancelPendingCaptures(): void {
    if (this.pendingTimeouts.length > 0) {
      logger.debug(`[ScreenshotBackoff] Cancelling ${this.pendingTimeouts.length} pending captures`);
      for (const timeoutId of this.pendingTimeouts) {
        this.timer.clearTimeout(timeoutId);
      }
      this.pendingTimeouts = [];
    }
  }

  isActive(): boolean {
    return this.pendingTimeouts.length > 0;
  }

  getPendingCount(): number {
    return this.pendingTimeouts.length;
  }

  /**
   * Reset the last emitted checksum (useful for testing or when connection resets)
   */
  resetLastChecksum(): void {
    this.lastEmittedChecksum = null;
  }

  private async captureAtInterval(sequenceId: number, interval: number): Promise<void> {
    // Check if this capture is still valid (sequence wasn't cancelled)
    if (sequenceId !== this.sequenceId) {
      logger.debug(`[ScreenshotBackoff] Skipping capture at ${interval}ms - sequence ${sequenceId} was superseded by ${this.sequenceId}`);
      return;
    }

    // Remove this timeout from pending list (it's now executing)
    // Find and remove the first pending timeout (they execute in order)
    if (this.pendingTimeouts.length > 0) {
      this.pendingTimeouts.shift();
    }

    logger.debug(`[ScreenshotBackoff] Capturing screenshot at t=${interval}ms (sequence ${sequenceId})`);

    try {
      const result = await this.captureCallback();

      // Check again if sequence is still valid (capture might have taken time)
      if (sequenceId !== this.sequenceId) {
        logger.debug(`[ScreenshotBackoff] Discarding capture at ${interval}ms - sequence was cancelled during capture`);
        return;
      }

      if (!result.success || !result.data) {
        logger.debug(`[ScreenshotBackoff] Screenshot capture failed at t=${interval}ms: ${result.error}`);
        return;
      }

      // Compute checksum
      const checksum = result.checksum || computeChecksum(result.data);

      // Skip if same as last emitted
      if (checksum === this.lastEmittedChecksum) {
        logger.debug(`[ScreenshotBackoff] Skipping duplicate screenshot at t=${interval}ms (checksum: ${checksum.substring(0, 8)}...)`);
        return;
      }

      // Emit the screenshot
      logger.debug(`[ScreenshotBackoff] Emitting screenshot at t=${interval}ms (checksum: ${checksum.substring(0, 8)}..., size: ${result.data.length})`);
      this.lastEmittedChecksum = checksum;
      this.emitCallback(result.data);

    } catch (error) {
      logger.warn(`[ScreenshotBackoff] Error capturing screenshot at t=${interval}ms: ${error}`);
    }
  }
}

/**
 * Fake implementation for testing
 */
export class FakeScreenshotBackoffScheduler implements ScreenshotBackoffScheduler {
  public startBackoffSequenceCalls: number = 0;
  public cancelPendingCapturesCalls: number = 0;
  private _isActive: boolean = false;
  private _pendingCount: number = 0;

  startBackoffSequence(): void {
    this.startBackoffSequenceCalls++;
    this._isActive = true;
    this._pendingCount = 6; // Default intervals count
  }

  cancelPendingCaptures(): void {
    this.cancelPendingCapturesCalls++;
    this._isActive = false;
    this._pendingCount = 0;
  }

  isActive(): boolean {
    return this._isActive;
  }

  getPendingCount(): number {
    return this._pendingCount;
  }

  // Test helpers
  setActive(active: boolean): void {
    this._isActive = active;
  }

  setPendingCount(count: number): void {
    this._pendingCount = count;
  }

  reset(): void {
    this.startBackoffSequenceCalls = 0;
    this.cancelPendingCapturesCalls = 0;
    this._isActive = false;
    this._pendingCount = 0;
  }
}
