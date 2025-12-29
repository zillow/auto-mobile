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
export interface PerformanceTracker {
  /**
   * Start a serial block (results in JSON array)
   * Operations within will be recorded in order
   */
  serial(name: string): PerformanceTracker;

  /**
   * Start a parallel block (results in JSON object)
   * Operations within are assumed to run concurrently
   */
  parallel(name: string): PerformanceTracker;

  /**
   * Track a single async operation's timing
   * @param name - Operation name
   * @param fn - Async function to execute and time
   * @returns The result of the function
   */
  track<T>(name: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Track a single synchronous operation's timing
   * @param name - Operation name
   * @param fn - Sync function to execute and time
   * @returns The result of the function
   */
  trackSync<T>(name: string, fn: () => T): T;

  /**
   * End the current block and return to parent
   */
  end(): PerformanceTracker;

  /**
   * Get the final timing data (null if tracking disabled)
   */
  getTimings(): TimingData | null;

  /**
   * Check if performance tracking is enabled
   */
  isEnabled(): boolean;

  /**
   * Add external timing data (e.g., from Android side) to the current block
   * @param name - Name for the timing entry
   * @param entry - The timing entry to add (with durationMs and optional children)
   */
  addExternalTiming(name: string, entry: TimingEntry | TimingEntry[]): void;

  /**
   * Start tracking an operation manually (for operations with complex timing)
   * @param name - Operation name
   */
  startOperation(name: string): void;

  /**
   * End a manually tracked operation
   * @param name - Operation name (must match startOperation)
   */
  endOperation(name: string): void;
}

/**
 * Default implementation of performance tracking
 */
export class DefaultPerformanceTracker implements PerformanceTracker {
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

  serial(name: string): PerformanceTracker {
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

  parallel(name: string): PerformanceTracker {
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

  trackSync<T>(name: string, fn: () => T): T {
    const startMs = Date.now();
    try {
      return fn();
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

  end(): PerformanceTracker {
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

  addExternalTiming(name: string, entry: TimingEntry | TimingEntry[]): void {
    const entries = Array.isArray(entry) ? entry : [entry];

    // Create a wrapper entry with children
    const wrapperEntry: TimingEntry = {
      name,
      durationMs: entries.reduce((sum, e) => sum + e.durationMs, 0),
      children: entries
    };

    if (Array.isArray(this.current.entries)) {
      this.current.entries.push(wrapperEntry);
    } else {
      this.current.entries[name] = wrapperEntry;
    }
  }

  private operationStarts: Map<string, number> = new Map();

  startOperation(name: string): void {
    this.operationStarts.set(name, Date.now());
  }

  endOperation(name: string): void {
    const startMs = this.operationStarts.get(name);
    if (startMs === undefined) {
      return;
    }
    this.operationStarts.delete(name);

    const durationMs = Date.now() - startMs;
    const entry: TimingEntry = { name, durationMs };

    if (Array.isArray(this.current.entries)) {
      this.current.entries.push(entry);
    } else {
      this.current.entries[name] = entry;
    }
  }
}

/**
 * No-op implementation for when performance tracking is disabled
 * All methods are essentially pass-through with minimal overhead
 */
export class NoOpPerformanceTracker implements PerformanceTracker {
  private root: TimingBlock = {
    name: "noop",
    type: "serial",
    startMs: 0,
    entries: [],
    parent: null
  };
  private current: TimingBlock = this.root;
  private operationStarts: Map<string, number> = new Map();

  serial(_name: string): PerformanceTracker {
    return this;
  }

  parallel(_name: string): PerformanceTracker {
    return this;
  }

  async track<T>(_name: string, fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  trackSync<T>(_name: string, fn: () => T): T {
    return fn();
  }

  end(): PerformanceTracker {
    return this;
  }

  getTimings(): TimingData | null {
    return null;
  }

  isEnabled(): boolean {
    return false;
  }

  addExternalTiming(_name: string, _entry: TimingEntry | TimingEntry[]): void {
    // No-op
  }

  startOperation(_name: string): void {
    // No-op
  }

  endOperation(_name: string): void {
    // No-op
  }
}

/**
 * Factory function to create appropriate tracker based on enabled flag
 */
export function createPerformanceTracker(enabled: boolean): PerformanceTracker {
  return enabled ? new DefaultPerformanceTracker() : new NoOpPerformanceTracker();
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
export function createGlobalPerformanceTracker(): PerformanceTracker {
  return createPerformanceTracker(debugPerfEnabled);
}
