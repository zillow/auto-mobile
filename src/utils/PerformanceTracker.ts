/**
 * Performance tracking utility for measuring operation timing.
 *
 * JSON structure convention:
 * - Serial operations (executed sequentially) -> JSON arrays
 * - Parallel operations (executed concurrently) -> JSON objects
 */

/**
 * Represents a single timing entry in the performance data
 */
export interface TimingEntry {
  name: string;
  durationMs: number;
  children?: TimingData;
}

/**
 * Timing data structure:
 * - Array = serial operations (ordered execution)
 * - Object = parallel operations (concurrent execution)
 */
export type TimingData = TimingEntry[] | Record<string, TimingEntry>;

/**
 * Block type for tracking serial vs parallel operations
 */
type BlockType = "serial" | "parallel";

/**
 * Internal tracking state for a timing block
 */
interface TimingBlock {
  name: string;
  type: BlockType;
  startMs: number;
  entries: TimingEntry[] | Record<string, TimingEntry>;
  parent: TimingBlock | null;
}

/**
 * Interface for performance tracking - enables dependency injection and testing
 */
export interface IPerformanceTracker {
  /**
   * Start a serial block (results in JSON array)
   * Operations within will be recorded in order
   */
  serial(name: string): IPerformanceTracker;

  /**
   * Start a parallel block (results in JSON object)
   * Operations within are assumed to run concurrently
   */
  parallel(name: string): IPerformanceTracker;

  /**
   * Track a single operation's timing
   * @param name - Operation name
   * @param fn - Async function to execute and time
   * @returns The result of the function
   */
  track<T>(name: string, fn: () => Promise<T>): Promise<T>;

  /**
   * End the current block and return to parent
   */
  end(): IPerformanceTracker;

  /**
   * Get the final timing data (null if tracking disabled)
   */
  getTimings(): TimingData | null;

  /**
   * Check if performance tracking is enabled
   */
  isEnabled(): boolean;
}

/**
 * Real implementation of performance tracking
 */
export class PerformanceTracker implements IPerformanceTracker {
  private root: TimingBlock;
  private current: TimingBlock;

  constructor() {
    // Initialize with a root serial block
    this.root = {
      name: "root",
      type: "serial",
      startMs: Date.now(),
      entries: [],
      parent: null
    };
    this.current = this.root;
  }

  serial(name: string): IPerformanceTracker {
    const block: TimingBlock = {
      name,
      type: "serial",
      startMs: Date.now(),
      entries: [],
      parent: this.current
    };
    this.current = block;
    return this;
  }

  parallel(name: string): IPerformanceTracker {
    const block: TimingBlock = {
      name,
      type: "parallel",
      startMs: Date.now(),
      entries: {},
      parent: this.current
    };
    this.current = block;
    return this;
  }

  async track<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startMs = Date.now();
    try {
      return await fn();
    } finally {
      const durationMs = Date.now() - startMs;
      const entry: TimingEntry = { name, durationMs };

      if (Array.isArray(this.current.entries)) {
        // Serial block - push to array
        this.current.entries.push(entry);
      } else {
        // Parallel block - add to object
        this.current.entries[name] = entry;
      }
    }
  }

  end(): IPerformanceTracker {
    if (this.current.parent) {
      const durationMs = Date.now() - this.current.startMs;
      const entry: TimingEntry = {
        name: this.current.name,
        durationMs,
        children: this.current.entries as TimingData
      };

      const parent = this.current.parent;
      if (Array.isArray(parent.entries)) {
        parent.entries.push(entry);
      } else {
        parent.entries[this.current.name] = entry;
      }
      this.current = parent;
    }
    return this;
  }

  getTimings(): TimingData | null {
    // Close any unclosed blocks
    while (this.current.parent) {
      this.end();
    }

    // Return the root's entries
    return this.root.entries as TimingData;
  }

  isEnabled(): boolean {
    return true;
  }
}

/**
 * No-op implementation for when performance tracking is disabled
 * All methods are essentially pass-through with minimal overhead
 */
export class NoOpPerformanceTracker implements IPerformanceTracker {
  serial(_name: string): IPerformanceTracker {
    return this;
  }

  parallel(_name: string): IPerformanceTracker {
    return this;
  }

  async track<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  end(): IPerformanceTracker {
    return this;
  }

  getTimings(): TimingData | null {
    return null;
  }

  isEnabled(): boolean {
    return false;
  }
}

/**
 * Factory function to create appropriate tracker based on enabled flag
 */
export function createPerformanceTracker(enabled: boolean): IPerformanceTracker {
  return enabled ? new PerformanceTracker() : new NoOpPerformanceTracker();
}

/**
 * Global debug-perf flag state
 * Set via CLI --debug-perf flag
 */
let debugPerfEnabled = false;

/**
 * Set the global debug-perf enabled state
 */
export function setDebugPerfEnabled(enabled: boolean): void {
  debugPerfEnabled = enabled;
}

/**
 * Check if debug-perf is globally enabled
 */
export function isDebugPerfEnabled(): boolean {
  return debugPerfEnabled;
}

/**
 * Create a tracker based on global debug-perf state
 */
export function createGlobalPerformanceTracker(): IPerformanceTracker {
  return createPerformanceTracker(debugPerfEnabled);
}
