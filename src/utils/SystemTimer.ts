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
