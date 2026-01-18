import { Timer } from "../../src/utils/interfaces/Timer";

/**
 * Pending sleep call information
 */
interface PendingSleep {
  ms: number;
  resolve: () => void;
  timestamp: number;
}

/**
 * Pending timeout information
 */
interface PendingTimeout {
  id: NodeJS.Timeout;
  callback: () => void;
  ms: number;
  timestamp: number;
}

/**
 * Pending interval information
 */
interface PendingInterval {
  id: NodeJS.Timeout;
  callback: () => void;
  ms: number;
  timestamp: number;
  lastFiredAt: number;
}

/**
 * Fake Timer implementation for testing
 * Allows tests to control time advancement without real delays
 *
 * Modes:
 * 1. Instant mode (default): sleeps complete immediately
 * 2. Manual mode: sleeps are pending until advanceTime() or resolveAll() is called
 * 3. Delayed mode: sleeps use real setTimeout with configured duration
 */
export class FakeTimer implements Timer {
  private pendingSleeps: PendingSleep[] = [];
  private sleepHistory: number[] = [];
  private currentTime: number = 0;
  private mode: "instant" | "manual" | "delayed" = "instant";
  private sleepDuration: number = 0;
  private pendingTimeouts: PendingTimeout[] = [];
  private pendingIntervals: PendingInterval[] = [];
  private nextTimeoutId: number = 1;
  private nextIntervalId: number = 1000000;
  private delayedModeStartTime?: number;
  private delayedModeFakeStartTime: number = 0;

  /**
   * Configure the sleep duration (for delayed mode)
   * Sets mode to "delayed" if duration > 0, "instant" if duration = 0
   */
  setSleepDuration(ms: number): void {
    this.sleepDuration = ms;
    this.mode = ms > 0 ? "delayed" : "instant";
    // Reset delayed mode time tracking
    this.delayedModeStartTime = undefined;
    this.delayedModeFakeStartTime = 0;
  }

  /**
   * Set mode to manual (sleeps are pending until resolved)
   */
  setManualMode(): void {
    this.mode = "manual";
  }

  /**
   * Record a sleep call and handle it based on current mode
   * - instant: resolves immediately
   * - manual: pending until advanceTime() or resolveAll()
   * - delayed: uses real setTimeout with configured duration
   */
  async sleep(ms: number): Promise<void> {
    this.sleepHistory.push(ms);

    if (this.mode === "instant") {
      // Instant completion
      return Promise.resolve();
    } else if (this.mode === "delayed") {
      // Real delay with configured duration
      return new Promise(resolve => setTimeout(resolve, this.sleepDuration));
    } else {
      // Manual mode - pending until resolved
      return new Promise<void>(resolve => {
        this.pendingSleeps.push({
          ms,
          resolve,
          timestamp: this.currentTime
        });
      });
    }
  }

  /**
   * Advance time and resolve all pending sleeps, fire timeouts, and intervals that have elapsed
   * @param ms - Milliseconds to advance
   */
  advanceTime(ms: number): void {
    this.currentTime += ms;

    // Handle pending sleeps
    const toResolve = this.pendingSleeps.filter(
      sleep => this.currentTime - sleep.timestamp >= sleep.ms
    );

    this.pendingSleeps = this.pendingSleeps.filter(
      sleep => this.currentTime - sleep.timestamp < sleep.ms
    );

    toResolve.forEach(sleep => sleep.resolve());

    // Handle pending timeouts
    const toFireTimeouts = this.pendingTimeouts.filter(
      timeout => this.currentTime - timeout.timestamp >= timeout.ms
    );

    this.pendingTimeouts = this.pendingTimeouts.filter(
      timeout => this.currentTime - timeout.timestamp < timeout.ms
    );

    toFireTimeouts.forEach(timeout => timeout.callback());

    // Handle pending intervals
    const toFireIntervals: PendingInterval[] = [];
    this.pendingIntervals = this.pendingIntervals.map(interval => {
      const timeSinceLastFire = this.currentTime - interval.lastFiredAt;
      if (timeSinceLastFire >= interval.ms) {
        toFireIntervals.push(interval);
        return { ...interval, lastFiredAt: this.currentTime };
      }
      return interval;
    });

    toFireIntervals.forEach(interval => interval.callback());
  }

  now(): number {
    return this.currentTime;
  }

  /**
   * Resolve all pending sleeps immediately regardless of time
   * Useful for tests that don't care about timing
   */
  resolveAll(): void {
    const toResolve = [...this.pendingSleeps];
    this.pendingSleeps = [];
    toResolve.forEach(sleep => sleep.resolve());
  }

  /**
   * Get all pending sleep durations
   */
  getPendingSleeps(): number[] {
    return this.pendingSleeps.map(s => s.ms);
  }

  /**
   * Get count of pending sleeps
   */
  getPendingSleepCount(): number {
    return this.pendingSleeps.length;
  }

  /**
   * Get history of all sleep calls (including resolved ones)
   */
  getSleepHistory(): number[] {
    return [...this.sleepHistory];
  }

  /**
   * Get total number of sleep calls made
   */
  getSleepCallCount(): number {
    return this.sleepHistory.length;
  }

  /**
   * Check if a specific sleep duration was called
   */
  wasSleepCalled(ms: number): boolean {
    return this.sleepHistory.includes(ms);
  }

  /**
   * Backward compatibility alias for wasSleepCalled
   */
  wasCalledWithDuration(ms: number): boolean {
    return this.wasSleepCalled(ms);
  }

  /**
   * Get current fake time
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Reset all state (clears pending sleeps, timeouts, intervals, history, and time)
   */
  reset(): void {
    // Resolve all pending sleeps before clearing to avoid hanging promises
    this.resolveAll();
    this.sleepHistory = [];
    this.currentTime = 0;
    this.pendingTimeouts = [];
    this.pendingIntervals = [];
    this.nextTimeoutId = 1;
    this.nextIntervalId = 1000000;
    this.delayedModeStartTime = undefined;
    this.delayedModeFakeStartTime = 0;
  }

  /**
   * Clear sleep history but keep pending sleeps and time
   */
  clearHistory(): void {
    this.sleepHistory = [];
  }

  /**
   * Schedule a callback to be executed after a specified delay
   * - instant mode: executes via setImmediate
   * - manual mode: stores as pending timeout
   * - delayed mode: uses real setTimeout
   */
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    if (this.mode === "instant") {
      // Execute immediately via setImmediate
      setImmediate(callback);
      // Return a fake handle (number cast to timeout type)
      const fakeHandle = this.nextTimeoutId as unknown as NodeJS.Timeout;
      this.nextTimeoutId++;
      return fakeHandle;
    } else if (this.mode === "delayed") {
      // Use real setTimeout with configured duration
      return global.setTimeout(callback, this.sleepDuration);
    } else {
      // Manual mode - store as pending timeout
      const id = this.nextTimeoutId as unknown as NodeJS.Timeout;
      this.nextTimeoutId++;
      this.pendingTimeouts.push({
        id,
        callback,
        ms,
        timestamp: this.currentTime
      });
      return id;
    }
  }

  /**
   * Clear a pending timeout
   */
  clearTimeout(handle: NodeJS.Timeout): void {
    // In instant mode, this is a no-op (callback already fired or is scheduled via setImmediate)
    if (this.mode === "instant") {
      return;
    }

    // In delayed mode, use the real clearTimeout
    if (this.mode === "delayed") {
      global.clearTimeout(handle);
      return;
    }

    // In manual mode, remove from pending timeouts
    this.pendingTimeouts = this.pendingTimeouts.filter(t => t.id !== handle);
  }

  /**
   * Schedule a callback to be executed repeatedly at a specified interval
   * - instant mode: executes once via setImmediate
   * - manual mode: stores as pending interval
   * - delayed mode: uses real setInterval
   */
  setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    if (this.mode === "instant") {
      // Execute once immediately via setImmediate
      setImmediate(callback);
      // Return a fake handle (number cast to interval type)
      const fakeHandle = this.nextIntervalId as unknown as NodeJS.Timeout;
      this.nextIntervalId++;
      return fakeHandle;
    } else if (this.mode === "delayed") {
      // Use real setInterval with configured duration
      return global.setInterval(callback, this.sleepDuration);
    } else {
      // Manual mode - store as pending interval
      const id = this.nextIntervalId as unknown as NodeJS.Timeout;
      this.nextIntervalId++;
      this.pendingIntervals.push({
        id,
        callback,
        ms,
        timestamp: this.currentTime,
        lastFiredAt: this.currentTime
      });
      return id;
    }
  }

  /**
   * Clear a pending interval
   */
  clearInterval(handle: NodeJS.Timeout): void {
    // In instant mode, this is a no-op (callback already fired)
    if (this.mode === "instant") {
      return;
    }

    // In delayed mode, use the real clearInterval
    if (this.mode === "delayed") {
      global.clearInterval(handle);
      return;
    }

    // In manual mode, remove from pending intervals
    this.pendingIntervals = this.pendingIntervals.filter(i => i.id !== handle);
  }

  /**
   * Get all pending timeout durations
   */
  getPendingTimeouts(): number[] {
    return this.pendingTimeouts.map(t => t.ms);
  }

  /**
   * Get all pending interval durations
   */
  getPendingIntervals(): number[] {
    return this.pendingIntervals.map(i => i.ms);
  }

  /**
   * Get count of pending timeouts
   */
  getPendingTimeoutCount(): number {
    return this.pendingTimeouts.length;
  }

  /**
   * Get count of pending intervals
   */
  getPendingIntervalCount(): number {
    return this.pendingIntervals.length;
  }

  /**
   * Get the current time
   * In manual/delayed modes, returns fake time that advances automatically
   * In instant mode, returns real time
   */
  now(): number {
    if (this.mode === "manual") {
      return this.currentTime;
    } else if (this.mode === "delayed") {
      // In delayed mode, use fake time that advances much faster than real time
      // This allows tests to run fast (using 1ms sleep) while appearing to take seconds
      if (!this.delayedModeStartTime) {
        this.delayedModeStartTime = Date.now();
        this.delayedModeFakeStartTime = this.currentTime;
      }
      const realElapsed = Date.now() - this.delayedModeStartTime;
      // Make fake time advance 1000x faster than real time
      // So 1ms real time = 1000ms fake time
      const fakeElapsed = realElapsed * 1000;
      return this.delayedModeFakeStartTime + fakeElapsed;
    }
    return Date.now();
  }
}
