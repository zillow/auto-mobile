import { describe, it, expect, beforeEach } from "bun:test";
import {
  DefaultRetryExecutor,
  DEFAULT_RETRY_OPTIONS,
} from "../../../src/utils/retry/RetryExecutor";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("DefaultRetryExecutor", () => {
  let executor: DefaultRetryExecutor;
  let timer: FakeTimer;

  beforeEach(() => {
    timer = new FakeTimer();
    executor = new DefaultRetryExecutor(timer);
  });

  describe("execute", () => {
    it("succeeds on first attempt when operation succeeds", async () => {
      timer.enableAutoAdvance();
      const result = await executor.execute(async () => "success");

      expect(result.success).toBe(true);
      expect(result.value).toBe("success");
      expect(result.attempts).toBe(1);
    });

    it("retries on failure and eventually succeeds", async () => {
      timer.enableAutoAdvance();
      let attempts = 0;

      const result = await executor.execute(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Not yet");
        }
        return "success";
      });

      expect(result.success).toBe(true);
      expect(result.value).toBe("success");
      expect(result.attempts).toBe(3);
    });

    it("fails after max attempts", async () => {
      timer.enableAutoAdvance();
      const result = await executor.execute(
        async () => {
          throw new Error("Always fails");
        },
        { maxAttempts: 3 }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Always fails");
      expect(result.attempts).toBe(3);
    });

    it("respects fixed delay between retries", async () => {
      let attempts = 0;

      const resultPromise = executor.execute(
        async () => {
          attempts++;
          if (attempts < 2) {
            throw new Error("Retry");
          }
          return "done";
        },
        { delays: 500, maxAttempts: 3 }
      );

      // Wait for first attempt
      await Promise.resolve();
      expect(attempts).toBe(1);
      expect(timer.getPendingSleepCount()).toBe(1);

      // Advance time to trigger retry
      timer.advanceTime(500);
      await Promise.resolve();

      const result = await resultPromise;
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(timer.wasSleepCalled(500)).toBe(true);
    });

    it("respects array-based delays (exponential backoff)", async () => {
      timer.enableAutoAdvance();
      let attempts = 0;
      const delays = [50, 100, 200];

      const result = await executor.execute(
        async () => {
          attempts++;
          if (attempts < 4) {
            throw new Error("Retry");
          }
          return "done";
        },
        { delays, maxAttempts: 4 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(4);
      expect(timer.wasSleepCalled(50)).toBe(true);
      expect(timer.wasSleepCalled(100)).toBe(true);
      expect(timer.wasSleepCalled(200)).toBe(true);
    });

    it("respects function-based delays", async () => {
      timer.enableAutoAdvance();
      let attempts = 0;

      const result = await executor.execute(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("Retry");
          }
          return "done";
        },
        {
          delays: attempt => attempt * 100,
          maxAttempts: 3,
        }
      );

      expect(result.success).toBe(true);
      expect(timer.wasSleepCalled(100)).toBe(true); // First retry: attempt 1 * 100
      expect(timer.wasSleepCalled(200)).toBe(true); // Second retry: attempt 2 * 100
    });

    it("aborts when signal is aborted", async () => {
      const controller = new AbortController();
      let attempts = 0;

      const resultPromise = executor.execute(
        async () => {
          attempts++;
          throw new Error("Retry");
        },
        { signal: controller.signal, delays: 100, maxAttempts: 5 }
      );

      await Promise.resolve();
      expect(attempts).toBe(1);

      // Abort before retry
      controller.abort();
      timer.advanceTime(100);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Operation aborted");
      expect(attempts).toBe(1);
    });

    it("respects shouldRetry predicate", async () => {
      timer.enableAutoAdvance();

      const result = await executor.execute(
        async () => {
          throw new Error("Fatal error");
        },
        {
          maxAttempts: 5,
          shouldRetry: error => !error.message.includes("Fatal"),
        }
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // Should not retry
    });

    it("calls onRetry callback before each retry", async () => {
      timer.enableAutoAdvance();
      const retryInfo: Array<{ error: Error; attempt: number; delay: number }> = [];

      const result = await executor.execute(
        async () => {
          throw new Error("Test error");
        },
        {
          maxAttempts: 3,
          delays: 500,
          onRetry: (error, attempt, delay) => {
            retryInfo.push({ error, attempt, delay });
          },
        }
      );

      expect(result.success).toBe(false);
      expect(retryInfo.length).toBe(2); // 2 retries after initial attempt
      expect(retryInfo[0].attempt).toBe(1);
      expect(retryInfo[0].delay).toBe(500);
      expect(retryInfo[1].attempt).toBe(2);
    });

    it("tracks total time in result", async () => {
      timer.enableAutoAdvance();
      timer.setCurrentTime(1000);

      const result = await executor.execute(
        async () => "done",
        { maxAttempts: 1 }
      );

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("executeOrThrow", () => {
    it("returns value on success", async () => {
      timer.enableAutoAdvance();
      const value = await executor.executeOrThrow(async () => "success");
      expect(value).toBe("success");
    });

    it("throws on failure", async () => {
      timer.enableAutoAdvance();

      await expect(
        executor.executeOrThrow(
          async () => {
            throw new Error("Failed");
          },
          { maxAttempts: 2 }
        )
      ).rejects.toThrow("Failed");
    });
  });

  describe("DEFAULT_RETRY_OPTIONS", () => {
    it("has sensible defaults", () => {
      expect(DEFAULT_RETRY_OPTIONS.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_OPTIONS.delays).toBe(1000);
    });
  });
});
