import { logger } from "./logger";
import { ScreenshotResult } from "../models/ScreenshotResult";
import { Timer, defaultTimer } from "./SystemTimer";

export interface ScreenshotJobHandle {
  jobId: string;
  promise: Promise<ScreenshotResult>;
  signal: AbortSignal;
}

export interface ScreenshotJobCompletion {
  deviceId: string;
  jobId: string;
  result: ScreenshotResult;
  aborted: boolean;
  isLatest: boolean;
}

export interface ScreenshotJobOptions {
  parentSignal?: AbortSignal;
  onComplete?: (completion: ScreenshotJobCompletion) => void | Promise<void>;
}

interface ScreenshotJobEntry {
  jobId: string;
  promise: Promise<ScreenshotResult>;
  abortController: AbortController;
  startedAt: number;
  cleanupParentSignal?: () => void;
}

export class ScreenshotJobTracker {
  private static jobs: Map<string, ScreenshotJobEntry> = new Map();
  private static timer: Timer = defaultTimer;

  static setTimer(timer: Timer): void {
    ScreenshotJobTracker.timer = timer;
  }

  static resetTimer(): void {
    ScreenshotJobTracker.timer = defaultTimer;
  }

  static startJob(
    deviceId: string,
    runner: (signal: AbortSignal) => Promise<ScreenshotResult>,
    options: ScreenshotJobOptions = {}
  ): ScreenshotJobHandle {
    ScreenshotJobTracker.cancelJob(deviceId);

    const abortController = new AbortController();
    let cleanupParentSignal: (() => void) | undefined;

    if (options.parentSignal) {
      const onAbort = () => {
        if (!abortController.signal.aborted) {
          abortController.abort();
        }
      };
      if (options.parentSignal.aborted) {
        onAbort();
      } else {
        options.parentSignal.addEventListener("abort", onAbort, { once: true });
        cleanupParentSignal = () => options.parentSignal?.removeEventListener("abort", onAbort);
      }
    }

    const jobId = `screenshot_${ScreenshotJobTracker.timer.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const promise = Promise.resolve()
      .then(() => runner(abortController.signal))
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      })
      .then(async result => {
        const isLatest = ScreenshotJobTracker.isLatest(deviceId, jobId);
        const completion: ScreenshotJobCompletion = {
          deviceId,
          jobId,
          result,
          aborted: abortController.signal.aborted,
          isLatest
        };
        if (options.onComplete) {
          try {
            await options.onComplete(completion);
          } catch (err) {
            logger.warn(`[ScreenshotJobTracker] Completion handler failed: ${err}`);
          }
        }
        return result;
      });

    const entry: ScreenshotJobEntry = {
      jobId,
      promise,
      abortController,
      startedAt: ScreenshotJobTracker.timer.now(),
      cleanupParentSignal
    };

    ScreenshotJobTracker.jobs.set(deviceId, entry);

    promise.finally(() => {
      const current = ScreenshotJobTracker.jobs.get(deviceId);
      if (current?.jobId === jobId) {
        ScreenshotJobTracker.jobs.delete(deviceId);
      }
      cleanupParentSignal?.();
    });

    return {
      jobId,
      promise,
      signal: abortController.signal
    };
  }

  static cancelJob(deviceId: string): void {
    const entry = ScreenshotJobTracker.jobs.get(deviceId);
    if (!entry) {
      return;
    }
    if (!entry.abortController.signal.aborted) {
      entry.abortController.abort();
    }
  }

  static isPending(deviceId: string): boolean {
    return ScreenshotJobTracker.jobs.has(deviceId);
  }

  static isLatest(deviceId: string, jobId: string): boolean {
    const entry = ScreenshotJobTracker.jobs.get(deviceId);
    return entry?.jobId === jobId;
  }

  static getMostRecentPendingDeviceId(): string | undefined {
    let latestDeviceId: string | undefined;
    let latestStart = 0;

    for (const [deviceId, entry] of ScreenshotJobTracker.jobs.entries()) {
      if (entry.startedAt >= latestStart) {
        latestStart = entry.startedAt;
        latestDeviceId = deviceId;
      }
    }

    return latestDeviceId;
  }

  static async waitForCompletion(deviceId: string, timeoutMs: number): Promise<ScreenshotResult | null> {
    const entry = ScreenshotJobTracker.jobs.get(deviceId);
    if (!entry) {
      return null;
    }

    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<null>(resolve => {
      timeoutId = ScreenshotJobTracker.timer.setTimeout(() => resolve(null), timeoutMs);
    });

    try {
      return await Promise.race([entry.promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        ScreenshotJobTracker.timer.clearTimeout(timeoutId);
      }
    }
  }

  static clear(): void {
    for (const entry of ScreenshotJobTracker.jobs.values()) {
      if (!entry.abortController.signal.aborted) {
        entry.abortController.abort();
      }
      entry.cleanupParentSignal?.();
    }
    ScreenshotJobTracker.jobs.clear();
  }
}
