import { Timer } from "../../src/utils/SystemTimer";

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
 * Fake Timer implementation for testing.
 *
 * All time-related operations are controlled manually:
 * - sleep() pends until advanceTime() is called
 * - setTimeout() stores callbacks that fire when time advances past their delay
 * - setInterval() stores callbacks that fire repeatedly as time advances
 * - now() returns the fake currentTime
 *
 * Tests must explicitly advance time using advanceTime() or resolveAll().
 *
 * For tests that don't need time control, call enableAutoAdvance() to make
 * sleeps resolve immediately via setImmediate.
 */
export class FakeTimer implements Timer {
  private pendingSleeps: PendingSleep[] = [];
  private sleepHistory: number[] = [];
  private currentTime: number = 0;
  private pendingTimeouts: PendingTimeout[] = [];
  private pendingIntervals: PendingInterval[] = [];
  private nextTimeoutId: number = 1;
  private nextIntervalId: number = 1000000;
  private autoAdvance: boolean = false;

  /**
   * Enable auto-advance mode where sleeps and timeouts resolve immediately.
   * Use this for tests that don't need to control time explicitly.
   */
  enableAutoAdvance(): void {
    this.autoAdvance = true;
  }

  /**
   * Sleep for the specified duration.
   * In normal mode: pends until advanceTime() is called.
   * In auto-advance mode: resolves immediately via setImmediate.
   */
  async sleep(ms: number): Promise<void> {
    this.sleepHistory.push(ms);
    if (this.autoAdvance) {
      this.currentTime += ms;
      return new Promise<void>(resolve => setImmediate(resolve));
    }
    return new Promise<void>(resolve => {
      this.pendingSleeps.push({
        ms,
        resolve,
        timestamp: this.currentTime
      });
    });
  }

  /**
   * Advance time and resolve all pending sleeps, fire timeouts, and intervals that have elapsed.
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

  /**
   * Get the current fake time.
   */
  now(): number {
    return this.currentTime;
  }

  /**
   * Resolve all pending sleeps immediately regardless of time.
   * Useful for tests that don't care about timing details.
   */
  resolveAll(): void {
    const toResolve = [...this.pendingSleeps];
    this.pendingSleeps = [];
    toResolve.forEach(sleep => sleep.resolve());
  }

  /**
   * Get all pending sleep durations.
   */
  getPendingSleeps(): number[] {
    return this.pendingSleeps.map(s => s.ms);
  }

  /**
   * Get count of pending sleeps.
   */
  getPendingSleepCount(): number {
    return this.pendingSleeps.length;
  }

  /**
   * Get history of all sleep calls (including resolved ones).
   */
  getSleepHistory(): number[] {
    return [...this.sleepHistory];
  }

  /**
   * Get total number of sleep calls made.
   */
  getSleepCallCount(): number {
    return this.sleepHistory.length;
  }

  /**
   * Check if a specific sleep duration was called.
   */
  wasSleepCalled(ms: number): boolean {
    return this.sleepHistory.includes(ms);
  }

  /**
   * Backward compatibility alias for wasSleepCalled.
   */
  wasCalledWithDuration(ms: number): boolean {
    return this.wasSleepCalled(ms);
  }

  /**
   * Get current fake time.
   */
  getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Set the current time directly (useful for specific test scenarios).
   */
  setCurrentTime(time: number): void {
    this.currentTime = time;
  }

  /**
   * Synchronous alias for advanceTime.
   * Provided for compatibility with tests that expect this method name.
   */
  advanceTimersByTime(ms: number): void {
    this.advanceTime(ms);
  }

  /**
   * Async version of advanceTime.
   * Advances time and awaits a microtask to let any async callbacks complete.
   */
  async advanceTimersByTimeAsync(ms: number): Promise<void> {
    this.advanceTime(ms);
    // Give any async callbacks a chance to complete
    await Promise.resolve();
  }

  /**
   * Reset all state (clears pending sleeps, timeouts, intervals, history, and time).
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
  }

  /**
   * Clear sleep history but keep pending sleeps and time.
   */
  clearHistory(): void {
    this.sleepHistory = [];
  }

  /**
   * Schedule a callback to be executed after a specified delay.
   * In normal mode: fires when advanceTime() moves past the delay.
   * In auto-advance mode: fires immediately via setImmediate.
   */
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const id = this.nextTimeoutId as unknown as NodeJS.Timeout;
    this.nextTimeoutId++;
    if (this.autoAdvance) {
      this.currentTime += ms;
      setImmediate(callback);
      return id;
    }
    this.pendingTimeouts.push({
      id,
      callback,
      ms,
      timestamp: this.currentTime
    });
    return id;
  }

  /**
   * Clear a pending timeout.
   */
  clearTimeout(handle: NodeJS.Timeout): void {
    this.pendingTimeouts = this.pendingTimeouts.filter(t => t.id !== handle);
  }

  /**
   * Schedule a callback to be executed repeatedly at a specified interval.
   * In normal mode: fires each time advanceTime() moves past the interval.
   * In auto-advance mode: fires once via setImmediate (intervals should not repeat in tests).
   */
  setInterval(callback: () => void, ms: number): NodeJS.Timeout {
    const id = this.nextIntervalId as unknown as NodeJS.Timeout;
    this.nextIntervalId++;
    if (this.autoAdvance) {
      this.currentTime += ms;
      setImmediate(callback);
      return id;
    }
    this.pendingIntervals.push({
      id,
      callback,
      ms,
      timestamp: this.currentTime,
      lastFiredAt: this.currentTime
    });
    return id;
  }

  /**
   * Clear a pending interval.
   */
  clearInterval(handle: NodeJS.Timeout): void {
    this.pendingIntervals = this.pendingIntervals.filter(i => i.id !== handle);
  }

  /**
   * Get all pending timeout durations.
   */
  getPendingTimeouts(): number[] {
    return this.pendingTimeouts.map(t => t.ms);
  }

  /**
   * Get all pending interval durations.
   */
  getPendingIntervals(): number[] {
    return this.pendingIntervals.map(i => i.ms);
  }

  /**
   * Get count of pending timeouts.
   */
  getPendingTimeoutCount(): number {
    return this.pendingTimeouts.length;
  }

  /**
   * Get count of pending intervals.
   */
  getPendingIntervalCount(): number {
    return this.pendingIntervals.length;
  }
}
