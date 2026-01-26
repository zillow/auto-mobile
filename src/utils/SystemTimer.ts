/**
 * Interface for timer utilities
 * Provides sleep/delay functionality and timeout/interval management
 */
export interface Timer {
  /**
   * Sleep for a specified duration
   * @param ms Duration to sleep in milliseconds
   * @returns Promise that resolves after the specified duration
   */
  sleep(ms: number): Promise<void>;

  /**
   * Schedule a callback to be executed after a specified delay
   * @param callback Function to execute
   * @param ms Delay in milliseconds
   * @returns Timeout handle that can be passed to clearTimeout
   */
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;

  /**
   * Cancel a scheduled timeout
   * @param handle The timeout handle returned by setTimeout
   */
  clearTimeout(handle: NodeJS.Timeout): void;

  /**
   * Schedule a callback to be executed repeatedly at a specified interval
   * @param callback Function to execute
   * @param ms Interval in milliseconds
   * @returns Interval handle that can be passed to clearInterval
   */
  setInterval(callback: () => void, ms: number): NodeJS.Timeout;

  /**
   * Cancel a scheduled interval
   * @param handle The interval handle returned by setInterval
   */
  clearInterval(handle: NodeJS.Timeout): void;

  /**
   * Get the current time in milliseconds
   * @returns Current time in milliseconds (for testing, can return fake time)
   */
  now(): number;
}

/**
 * System timer implementation delegating to global timer functions
 */
export class SystemTimer implements Timer {
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    return global.setTimeout(callback, ms);
  }

  clearTimeout(handle: NodeJS.Timeout): void {
    global.clearTimeout(handle);
  }

  setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    return global.setInterval(callback, ms);
  }

  clearInterval(handle: NodeJS.Timeout): void {
    global.clearInterval(handle);
  }

  now(): number {
    return Date.now();
  }
}

/**
 * Global default timer instance
 */
export const defaultTimer: Timer = new SystemTimer();

/**
 * Pending timer entry for FakeTimer
 */
interface PendingTimer {
  id: number;
  callback: () => void;
  triggerTime: number;
  type: "timeout" | "interval";
  interval?: number;
}

/**
 * Fake timer implementation for testing.
 * Allows manual control of time advancement.
 */
export class FakeTimer implements Timer {
  private currentTime: number = 0;
  private timerId: number = 0;
  private pendingTimers: Map<number, PendingTimer> = new Map();

  async sleep(ms: number): Promise<void> {
    // In fake timer, sleep just advances time
    await this.advanceTimersByTimeAsync(ms);
  }

  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const id = ++this.timerId;
    this.pendingTimers.set(id, {
      id,
      callback,
      triggerTime: this.currentTime + ms,
      type: "timeout",
    });
    return id as unknown as NodeJS.Timeout;
  }

  clearTimeout(handle: NodeJS.Timeout): void {
    const id = handle as unknown as number;
    this.pendingTimers.delete(id);
  }

  setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    const id = ++this.timerId;
    this.pendingTimers.set(id, {
      id,
      callback,
      triggerTime: this.currentTime + ms,
      type: "interval",
      interval: ms,
    });
    return id as unknown as NodeJS.Timeout;
  }

  clearInterval(handle: NodeJS.Timeout): void {
    const id = handle as unknown as number;
    this.pendingTimers.delete(id);
  }

  now(): number {
    return this.currentTime;
  }

  /**
   * Advance time by the specified amount, triggering any timers that would fire.
   * Returns a promise that resolves after all triggered callbacks have completed.
   */
  async advanceTimersByTimeAsync(ms: number): Promise<void> {
    const targetTime = this.currentTime + ms;

    while (true) {
      // Find the next timer to fire
      let nextTimer: PendingTimer | null = null;
      for (const timer of this.pendingTimers.values()) {
        if (timer.triggerTime <= targetTime) {
          if (!nextTimer || timer.triggerTime < nextTimer.triggerTime) {
            nextTimer = timer;
          }
        }
      }

      if (!nextTimer) {
        break;
      }

      // Advance time to the timer's trigger time
      this.currentTime = nextTimer.triggerTime;

      // Handle the timer
      if (nextTimer.type === "timeout") {
        this.pendingTimers.delete(nextTimer.id);
        try {
          await Promise.resolve(nextTimer.callback());
        } catch {
          // Ignore callback errors in tests
        }
      } else if (nextTimer.type === "interval") {
        // Reschedule interval for next occurrence
        nextTimer.triggerTime = this.currentTime + nextTimer.interval!;
        try {
          await Promise.resolve(nextTimer.callback());
        } catch {
          // Ignore callback errors in tests
        }
      }
    }

    // Advance to final target time
    this.currentTime = targetTime;
  }

  /**
   * Synchronous version - advances time but doesn't await callbacks
   */
  advanceTimersByTime(ms: number): void {
    const targetTime = this.currentTime + ms;

    while (true) {
      let nextTimer: PendingTimer | null = null;
      for (const timer of this.pendingTimers.values()) {
        if (timer.triggerTime <= targetTime) {
          if (!nextTimer || timer.triggerTime < nextTimer.triggerTime) {
            nextTimer = timer;
          }
        }
      }

      if (!nextTimer) {
        break;
      }

      this.currentTime = nextTimer.triggerTime;

      if (nextTimer.type === "timeout") {
        this.pendingTimers.delete(nextTimer.id);
        try {
          nextTimer.callback();
        } catch {
          // Ignore
        }
      } else if (nextTimer.type === "interval") {
        nextTimer.triggerTime = this.currentTime + nextTimer.interval!;
        try {
          nextTimer.callback();
        } catch {
          // Ignore
        }
      }
    }

    this.currentTime = targetTime;
  }

  /**
   * Run all pending timers immediately
   */
  runAllTimers(): void {
    const maxIterations = 1000;
    let iterations = 0;

    while (this.pendingTimers.size > 0 && iterations < maxIterations) {
      iterations++;
      const timers = Array.from(this.pendingTimers.values());
      const nextTimer = timers.reduce((a, b) =>
        a.triggerTime < b.triggerTime ? a : b
      );

      this.currentTime = nextTimer.triggerTime;

      if (nextTimer.type === "timeout") {
        this.pendingTimers.delete(nextTimer.id);
        try {
          nextTimer.callback();
        } catch {
          // Ignore
        }
      } else if (nextTimer.type === "interval") {
        // For intervals, just run once and reschedule
        nextTimer.triggerTime = this.currentTime + nextTimer.interval!;
        try {
          nextTimer.callback();
        } catch {
          // Ignore
        }
        // Break to avoid infinite loop with intervals
        break;
      }
    }
  }

  /**
   * Get the number of pending timers
   */
  getPendingTimersCount(): number {
    return this.pendingTimers.size;
  }

  /**
   * Reset the fake timer to initial state
   */
  reset(): void {
    this.currentTime = 0;
    this.timerId = 0;
    this.pendingTimers.clear();
  }

  /**
   * Set the current time (useful for specific test scenarios)
   */
  setCurrentTime(time: number): void {
    this.currentTime = time;
  }
}
