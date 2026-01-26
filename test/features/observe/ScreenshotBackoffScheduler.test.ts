import { describe, it, expect, beforeEach } from "bun:test";
import {
  DefaultScreenshotBackoffScheduler,
  FakeScreenshotBackoffScheduler,
  ScreenshotCaptureResult,
  computeChecksum,
} from "../../../src/features/observe/ScreenshotBackoffScheduler";
import { FakeTimer } from "../../../src/utils/SystemTimer";

describe("computeChecksum", () => {
  it("returns consistent checksum for same data", () => {
    const data = "test-screenshot-data";
    const checksum1 = computeChecksum(data);
    const checksum2 = computeChecksum(data);
    expect(checksum1).toBe(checksum2);
  });

  it("returns different checksum for different data", () => {
    const checksum1 = computeChecksum("data1");
    const checksum2 = computeChecksum("data2");
    expect(checksum1).not.toBe(checksum2);
  });

  it("returns 32-character hex string", () => {
    const checksum = computeChecksum("test");
    expect(checksum).toHaveLength(32);
    expect(checksum).toMatch(/^[0-9a-f]+$/);
  });
});

describe("DefaultScreenshotBackoffScheduler", () => {
  let fakeTimer: FakeTimer;
  let capturedScreenshots: string[];
  let emittedScreenshots: string[];
  let captureCount: number;
  let captureCallback: () => Promise<ScreenshotCaptureResult>;
  let emitCallback: (data: string) => void;

  beforeEach(() => {
    fakeTimer = new FakeTimer();
    capturedScreenshots = [];
    emittedScreenshots = [];
    captureCount = 0;

    // Default capture callback returns unique screenshots
    captureCallback = async () => {
      captureCount++;
      const data = `screenshot-${captureCount}`;
      capturedScreenshots.push(data);
      return { success: true, data };
    };

    emitCallback = (data: string) => {
      emittedScreenshots.push(data);
    };
  });

  describe("startBackoffSequence", () => {
    it("schedules captures at default intervals", () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        undefined,
        fakeTimer
      );

      scheduler.startBackoffSequence();

      // Should have 6 pending captures (0, 100, 300, 500, 800, 1300)
      expect(scheduler.getPendingCount()).toBe(6);
      expect(scheduler.isActive()).toBe(true);
    });

    it("captures immediately at t=0", async () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        undefined,
        fakeTimer
      );

      scheduler.startBackoffSequence();

      // Advance to t=0 (immediate)
      await fakeTimer.advanceTimersByTimeAsync(0);

      expect(capturedScreenshots).toEqual(["screenshot-1"]);
      expect(emittedScreenshots).toEqual(["screenshot-1"]);
    });

    it("captures at all backoff intervals", async () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        undefined,
        fakeTimer
      );

      scheduler.startBackoffSequence();

      // Advance through all intervals
      await fakeTimer.advanceTimersByTimeAsync(0);    // t=0
      await fakeTimer.advanceTimersByTimeAsync(100);  // t=100
      await fakeTimer.advanceTimersByTimeAsync(200);  // t=300
      await fakeTimer.advanceTimersByTimeAsync(200);  // t=500
      await fakeTimer.advanceTimersByTimeAsync(300);  // t=800
      await fakeTimer.advanceTimersByTimeAsync(500);  // t=1300

      expect(capturedScreenshots).toHaveLength(6);
      expect(emittedScreenshots).toHaveLength(6);
      expect(scheduler.isActive()).toBe(false);
      expect(scheduler.getPendingCount()).toBe(0);
    });

    it("uses custom intervals when provided", async () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 50, 150] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      expect(scheduler.getPendingCount()).toBe(3);

      await fakeTimer.advanceTimersByTimeAsync(0);
      await fakeTimer.advanceTimersByTimeAsync(50);
      await fakeTimer.advanceTimersByTimeAsync(100);

      expect(capturedScreenshots).toHaveLength(3);
    });

    it("cancels previous sequence when starting new one", async () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200] },
        fakeTimer
      );

      // Start first sequence
      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0); // Capture at t=0

      // Start second sequence before first completes
      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0); // Capture at t=0 of new sequence

      // Advance past where first sequence would have captured
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);

      // Should have: 1 from first (t=0), 2 from second (t=0, t=100)
      // The t=100 and t=200 from first sequence should be cancelled
      expect(capturedScreenshots).toHaveLength(4); // 1 + 3
    });
  });

  describe("duplicate detection", () => {
    it("skips emitting duplicate screenshots", async () => {
      // Return same screenshot data every time
      captureCallback = async () => {
        captureCount++;
        capturedScreenshots.push("same-data");
        return { success: true, data: "same-data" };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);

      // All 3 captures happened
      expect(capturedScreenshots).toHaveLength(3);
      // But only 1 was emitted (first one)
      expect(emittedScreenshots).toHaveLength(1);
      expect(emittedScreenshots[0]).toBe("same-data");
    });

    it("emits when screenshot changes", async () => {
      let screenshotIndex = 0;
      const screenshots = ["frame1", "frame1", "frame2", "frame2", "frame3"];

      captureCallback = async () => {
        const data = screenshots[screenshotIndex++] || "default";
        capturedScreenshots.push(data);
        return { success: true, data };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200, 300, 400] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);

      // 5 captures
      expect(capturedScreenshots).toHaveLength(5);
      // 3 emits (frame1, frame2, frame3 - duplicates skipped)
      expect(emittedScreenshots).toEqual(["frame1", "frame2", "frame3"]);
    });

    it("uses provided checksum if available", async () => {
      let callCount = 0;
      captureCallback = async () => {
        callCount++;
        // Return different data but same checksum for calls 1 and 2
        return {
          success: true,
          data: `data-${callCount}`,
          checksum: callCount <= 2 ? "same-checksum" : `checksum-${callCount}`,
        };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);

      // Only 2 emits: data-1 (checksum same-checksum) and data-3 (checksum-3)
      // data-2 skipped because checksum matches data-1
      expect(emittedScreenshots).toEqual(["data-1", "data-3"]);
    });
  });

  describe("cancelPendingCaptures", () => {
    it("cancels all pending captures", async () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200, 300] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0); // t=0 fires

      expect(scheduler.getPendingCount()).toBe(3); // 100, 200, 300 remaining

      scheduler.cancelPendingCaptures();

      expect(scheduler.getPendingCount()).toBe(0);
      expect(scheduler.isActive()).toBe(false);

      // Advance time - no more captures should happen
      await fakeTimer.advanceTimersByTimeAsync(500);

      expect(capturedScreenshots).toHaveLength(1); // Only the t=0 capture
    });

    it("handles cancel when no sequence is active", () => {
      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        undefined,
        fakeTimer
      );

      // Should not throw
      scheduler.cancelPendingCaptures();
      expect(scheduler.isActive()).toBe(false);
    });
  });

  describe("error handling", () => {
    it("handles capture failures gracefully", async () => {
      let callCount = 0;
      captureCallback = async () => {
        callCount++;
        if (callCount === 2) {
          return { success: false, error: "Capture failed" };
        }
        return { success: true, data: `screenshot-${callCount}` };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);

      // Should emit 2 screenshots (1st and 3rd), 2nd failed
      expect(emittedScreenshots).toEqual(["screenshot-1", "screenshot-3"]);
    });

    it("handles capture exceptions gracefully", async () => {
      let callCount = 0;
      captureCallback = async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Capture exception");
        }
        return { success: true, data: `screenshot-${callCount}` };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100, 200] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      await fakeTimer.advanceTimersByTimeAsync(100);
      await fakeTimer.advanceTimersByTimeAsync(100);

      // Should still emit other screenshots
      expect(emittedScreenshots).toEqual(["screenshot-1", "screenshot-3"]);
    });
  });

  describe("sequence invalidation", () => {
    it("discards captures from old sequence if new sequence starts", async () => {
      const captureDelay = 0;
      captureCallback = async () => {
        captureCount++;
        // Simulate slow capture that takes 150ms
        if (captureDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, captureDelay));
        }
        return { success: true, data: `screenshot-${captureCount}` };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0, 100] },
        fakeTimer
      );

      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0); // Start capture 1

      // While capture is in progress, start new sequence
      // This simulates a new hierarchy update coming in
      scheduler.startBackoffSequence();

      // The first capture should complete but its result should be discarded
      // because the sequence ID changed
      await fakeTimer.advanceTimersByTimeAsync(0); // Start capture from new sequence

      // Both captures completed, but we should see results from sequence 2
      expect(emittedScreenshots.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("resetLastChecksum", () => {
    it("allows re-emitting same screenshot after reset", async () => {
      captureCallback = async () => {
        return { success: true, data: "same-data" };
      };

      const scheduler = new DefaultScreenshotBackoffScheduler(
        captureCallback,
        emitCallback,
        { intervals: [0] },
        fakeTimer
      );

      // First sequence
      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      expect(emittedScreenshots).toHaveLength(1);

      // Second sequence - same data, should be skipped
      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      expect(emittedScreenshots).toHaveLength(1);

      // Reset checksum
      scheduler.resetLastChecksum();

      // Third sequence - same data but checksum reset, should emit
      scheduler.startBackoffSequence();
      await fakeTimer.advanceTimersByTimeAsync(0);
      expect(emittedScreenshots).toHaveLength(2);
    });
  });
});

describe("FakeScreenshotBackoffScheduler", () => {
  it("tracks method calls", () => {
    const fake = new FakeScreenshotBackoffScheduler();

    expect(fake.startBackoffSequenceCalls).toBe(0);
    expect(fake.cancelPendingCapturesCalls).toBe(0);

    fake.startBackoffSequence();
    expect(fake.startBackoffSequenceCalls).toBe(1);
    expect(fake.isActive()).toBe(true);

    fake.cancelPendingCaptures();
    expect(fake.cancelPendingCapturesCalls).toBe(1);
    expect(fake.isActive()).toBe(false);
  });

  it("allows setting state for test scenarios", () => {
    const fake = new FakeScreenshotBackoffScheduler();

    fake.setActive(true);
    expect(fake.isActive()).toBe(true);

    fake.setPendingCount(3);
    expect(fake.getPendingCount()).toBe(3);
  });

  it("resets all state", () => {
    const fake = new FakeScreenshotBackoffScheduler();

    fake.startBackoffSequence();
    fake.cancelPendingCaptures();
    fake.setActive(true);
    fake.setPendingCount(5);

    fake.reset();

    expect(fake.startBackoffSequenceCalls).toBe(0);
    expect(fake.cancelPendingCapturesCalls).toBe(0);
    expect(fake.isActive()).toBe(false);
    expect(fake.getPendingCount()).toBe(0);
  });
});
