import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ScreenshotJobTracker } from "../../src/utils/ScreenshotJobTracker";
import { OPERATION_CANCELLED_MESSAGE } from "../../src/utils/constants";
import { FakeTimer } from "../fakes/FakeTimer";

describe("ScreenshotJobTracker", () => {
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    ScreenshotJobTracker.setTimer(fakeTimer);
  });

  afterEach(() => {
    ScreenshotJobTracker.clear();
    ScreenshotJobTracker.resetTimer();
  });

  test("cancels the previous job for the same device", async () => {
    const job1 = ScreenshotJobTracker.startJob("device-1", signal => {
      return new Promise(resolve => {
        if (signal.aborted) {
          resolve({ success: false, error: OPERATION_CANCELLED_MESSAGE });
          return;
        }
        const timeoutId = fakeTimer.setTimeout(() => {
          resolve({ success: true, path: "job1" });
        }, 50);

        signal.addEventListener("abort", () => {
          fakeTimer.clearTimeout(timeoutId);
          resolve({ success: false, error: OPERATION_CANCELLED_MESSAGE });
        }, { once: true });
      });
    });

    const job2 = ScreenshotJobTracker.startJob("device-1", async () => {
      return { success: true, path: "job2" };
    });

    const result1 = await job1.promise;
    const result2 = await job2.promise;

    expect(result1.success).toBe(false);
    expect(result1.error).toContain(OPERATION_CANCELLED_MESSAGE);
    expect(result2.success).toBe(true);
    expect(result2.path).toBe("job2");
  });

  test("waitForCompletion resolves with result when job completes", async () => {
    ScreenshotJobTracker.startJob("device-2", async signal => {
      return new Promise(resolve => {
        const timeoutId = fakeTimer.setTimeout(() => {
          resolve({ success: true, path: "done" });
        }, 50);

        signal.addEventListener("abort", () => {
          fakeTimer.clearTimeout(timeoutId);
          resolve({ success: false, error: OPERATION_CANCELLED_MESSAGE });
        }, { once: true });
      });
    });

    const waitPromise = ScreenshotJobTracker.waitForCompletion("device-2", 200);
    await Promise.resolve();
    fakeTimer.advanceTime(100);
    await Promise.resolve();
    const result = await waitPromise;
    expect(result?.success).toBe(true);
    expect(result?.path).toBe("done");
  });

  test("waitForCompletion returns null when the job times out", async () => {
    ScreenshotJobTracker.startJob("device-2", async signal => {
      return new Promise(resolve => {
        const timeoutId = fakeTimer.setTimeout(() => {
          resolve({ success: true, path: "late" });
        }, 200);

        signal.addEventListener("abort", () => {
          fakeTimer.clearTimeout(timeoutId);
          resolve({ success: false, error: OPERATION_CANCELLED_MESSAGE });
        }, { once: true });
      });
    });

    const waitPromise = ScreenshotJobTracker.waitForCompletion("device-2", 50);
    await Promise.resolve();
    fakeTimer.advanceTime(50);
    await Promise.resolve();
    const result = await waitPromise;
    expect(result).toBeNull();
  });
});
