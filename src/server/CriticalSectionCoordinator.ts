import { Mutex } from "async-mutex";
import { logger } from "../utils/logger";

/**
 * Coordinates critical sections across multiple devices using global locks.
 * Ensures that devices wait at critical section boundaries and execute
 * their steps serially within the critical section.
 */
export class CriticalSectionCoordinator {
  private static instance: CriticalSectionCoordinator;
  private locks: Map<string, Mutex>;
  private barrierCounts: Map<string, Set<string>>; // lock -> set of device IDs that have arrived
  private expectedDeviceCounts: Map<string, number>; // lock -> expected device count
  private barrierResolvers: Map<string, Array<() => void>>; // lock -> resolvers waiting at barrier
  private cleanupTimers: Map<string, NodeJS.Timeout>; // lock -> cleanup timeout
  private readonly BARRIER_TIMEOUT_MS = 30000; // 30 seconds
  private readonly LOCK_CLEANUP_DELAY_MS = 5000; // 5 seconds after last device

  private constructor() {
    this.locks = new Map();
    this.barrierCounts = new Map();
    this.expectedDeviceCounts = new Map();
    this.barrierResolvers = new Map();
    this.cleanupTimers = new Map();
  }

  public static getInstance(): CriticalSectionCoordinator {
    if (!CriticalSectionCoordinator.instance) {
      CriticalSectionCoordinator.instance = new CriticalSectionCoordinator();
    }
    return CriticalSectionCoordinator.instance;
  }

  /**
	 * Registers the expected number of devices for a lock.
	 * Must be called before any device arrives at the barrier.
	 */
  public registerExpectedDevices(lock: string, deviceCount: number): void {
    if (deviceCount < 1) {
      throw new Error(
        `Invalid device count ${deviceCount} for lock "${lock}". Must be at least 1.`
      );
    }

    logger.debug(
      `Registering ${deviceCount} expected devices for lock "${lock}"`
    );
    this.expectedDeviceCounts.set(lock, deviceCount);

    // Ensure lock mutex exists
    if (!this.locks.has(lock)) {
      this.locks.set(lock, new Mutex());
    }

    // Initialize barrier tracking
    if (!this.barrierCounts.has(lock)) {
      this.barrierCounts.set(lock, new Set());
    }
    if (!this.barrierResolvers.has(lock)) {
      this.barrierResolvers.set(lock, []);
    }

    // Cancel any existing cleanup timer
    const existingTimer = this.cleanupTimers.get(lock);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.cleanupTimers.delete(lock);
    }
  }

  /**
	 * Wait at the barrier for all devices to arrive, then execute the critical section.
	 * Returns a release function that must be called after execution completes.
	 */
  public async enterCriticalSection(
    lock: string,
    deviceId: string,
    timeout: number = this.BARRIER_TIMEOUT_MS
  ): Promise<() => void> {
    logger.debug(`Device ${deviceId} entering critical section "${lock}"`);

    // Ensure lock exists
    if (!this.locks.has(lock)) {
      this.locks.set(lock, new Mutex());
    }

    // Wait at barrier
    await this.waitAtBarrier(lock, deviceId, timeout);

    // Acquire the mutex for serial execution
    logger.debug(`Device ${deviceId} acquiring lock "${lock}"`);
    const release = await this.locks.get(lock)!.acquire();

    logger.debug(`Device ${deviceId} acquired lock "${lock}"`);

    // Return release function
    return () => {
      logger.debug(`Device ${deviceId} releasing lock "${lock}"`);
      release();
      this.scheduleCleanup(lock);
    };
  }

  /**
	 * Wait at the barrier until all expected devices have arrived.
	 */
  private async waitAtBarrier(
    lock: string,
    deviceId: string,
    timeout: number
  ): Promise<void> {
    const expectedCount = this.expectedDeviceCounts.get(lock);

    if (expectedCount === undefined) {
      throw new Error(
        `No expected device count registered for lock "${lock}". ` +
					`Call registerExpectedDevices() before entering critical section.`
      );
    }

    // Add this device to the barrier
    let arrivedDevices = this.barrierCounts.get(lock);
    if (!arrivedDevices) {
      arrivedDevices = new Set();
      this.barrierCounts.set(lock, arrivedDevices);
    }

    if (arrivedDevices.has(deviceId)) {
      throw new Error(
        `Device ${deviceId} already arrived at barrier for lock "${lock}". ` +
					`Nested critical sections with the same lock are not supported.`
      );
    }

    arrivedDevices.add(deviceId);
    const currentCount = arrivedDevices.size;

    logger.debug(
      `Device ${deviceId} arrived at barrier "${lock}" (${currentCount}/${expectedCount})`
    );

    // If all devices have arrived, release all waiting devices
    if (currentCount === expectedCount) {
      logger.debug(
        `All ${expectedCount} devices arrived at barrier "${lock}", releasing all`
      );

      const resolvers = this.barrierResolvers.get(lock) || [];
      this.barrierResolvers.set(lock, []);

      // Release all waiting devices
      for (const resolve of resolvers) {
        resolve();
      }

      // Reset barrier for potential next round (though we don't support re-entry)
      return;
    }

    // Wait for other devices to arrive
    await new Promise<void>((resolve, reject) => {
      // Add to waiters
      const resolvers = this.barrierResolvers.get(lock) || [];
      resolvers.push(resolve);
      this.barrierResolvers.set(lock, resolvers);

      // Set timeout
      const timer = setTimeout(() => {
        // Remove this resolver
        const currentResolvers = this.barrierResolvers.get(lock) || [];
        const index = currentResolvers.indexOf(resolve);
        if (index > -1) {
          currentResolvers.splice(index, 1);
        }

        const arrivedCount = this.barrierCounts.get(lock)?.size || 0;
        reject(
          new Error(
            `Timeout waiting for critical section "${lock}". ` +
							`${arrivedCount}/${expectedCount} devices arrived after ${timeout}ms. ` +
							`Missing devices may have failed or not reached the critical section.`
          )
        );
      }, timeout);

      // Store the timeout so we can clear it if resolved normally
      const originalResolve = resolve;
      const wrappedResolve = () => {
        clearTimeout(timer);
        originalResolve();
      };

      // Replace the resolver with the wrapped version
      const currentResolvers = this.barrierResolvers.get(lock) || [];
      const resolverIndex = currentResolvers.indexOf(resolve);
      if (resolverIndex > -1) {
        currentResolvers[resolverIndex] = wrappedResolve;
      }
    });
  }

  /**
	 * Schedule cleanup of lock resources after all devices have finished.
	 */
  private scheduleCleanup(lock: string): void {
    // Cancel any existing cleanup timer
    const existingTimer = this.cleanupTimers.get(lock);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new cleanup
    const timer = setTimeout(() => {
      logger.debug(`Cleaning up lock resources for "${lock}"`);
      this.locks.delete(lock);
      this.barrierCounts.delete(lock);
      this.expectedDeviceCounts.delete(lock);
      this.barrierResolvers.delete(lock);
      this.cleanupTimers.delete(lock);
    }, this.LOCK_CLEANUP_DELAY_MS);

    this.cleanupTimers.set(lock, timer);
  }

  /**
	 * Immediately clean up resources for a lock (used in error scenarios).
	 */
  public forceCleanup(lock: string): void {
    logger.debug(`Force cleaning up lock resources for "${lock}"`);

    const existingTimer = this.cleanupTimers.get(lock);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.locks.delete(lock);
    this.barrierCounts.delete(lock);
    this.expectedDeviceCounts.delete(lock);
    this.barrierResolvers.delete(lock);
    this.cleanupTimers.delete(lock);
  }

  /**
	 * Reset all coordinator state (primarily for testing).
	 */
  public reset(): void {
    // Clear all timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }

    this.locks.clear();
    this.barrierCounts.clear();
    this.expectedDeviceCounts.clear();
    this.barrierResolvers.clear();
    this.cleanupTimers.clear();
  }
}
