/**
 * Performance tracking utility for measuring operation timing.
 *
 * JSON structure convention:
 * - Serial operations (executed sequentially) -> JSON arrays
 * - Parallel operations (executed concurrently) -> JSON objects
 */
import { Timer, defaultTimer } from "./SystemTimer";

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
  private timer: Timer;

  constructor(timer: Timer = defaultTimer) {
    this.timer = timer;
    const startMs = this.timer.now();
    // Initialize with a root serial block
    this.root = {
      name: "root",
      type: "serial",
      startMs,
      entries: [],
      parent: null
    };
    this.current = this.root;
  }

  serial(name: string): PerformanceTracker {
    const block: TimingBlock = {
      name,
      type: "serial",
      startMs: this.timer.now(),
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
      startMs: this.timer.now(),
      entries: {},
      parent: this.current
    };
    this.current = block;
    return this;
  }

  async track<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startMs = this.timer.now();
    try {
      return await fn();
    } finally {
      const durationMs = this.timer.now() - startMs;
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
    const startMs = this.timer.now();
    try {
      return fn();
    } finally {
      const durationMs = this.timer.now() - startMs;
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
      const durationMs = this.timer.now() - this.current.startMs;
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
    this.operationStarts.set(name, this.timer.now());
  }

  endOperation(name: string): void {
    const startMs = this.operationStarts.get(name);
    if (startMs === undefined) {
      return;
    }
    this.operationStarts.delete(name);

    const durationMs = this.timer.now() - startMs;
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
export function createPerformanceTracker(enabled: boolean, timer: Timer = defaultTimer): PerformanceTracker {
  return enabled ? new DefaultPerformanceTracker(timer) : new NoOpPerformanceTracker();
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

/**
 * Maximum size for performance timing data in bytes (can be configured)
 * Default: 50KB - reasonable limit that won't bloat MCP responses
 */
let maxPerfTimingSizeBytes = 50 * 1024; // 50KB

/**
 * Set the maximum size for performance timing data
 */
export function setMaxPerfTimingSizeBytes(sizeBytes: number): void {
  maxPerfTimingSizeBytes = sizeBytes;
}

/**
 * Get the current maximum size for performance timing data
 */
export function getMaxPerfTimingSizeBytes(): number {
  return maxPerfTimingSizeBytes;
}

/**
 * Result of processing timing data with filtering and truncation
 */
export interface ProcessedTimingData {
  data: TimingData;
  truncated?: boolean;
}

/**
 * Recursively filter out timing entries with 0ms duration
 */
function filterZeroTimings(timings: TimingData): TimingData {
  if (Array.isArray(timings)) {
    // Filter array entries
    return timings
      .filter(entry => entry.durationMs > 0)
      .map(entry => ({
        ...entry,
        children: entry.children ? filterZeroTimings(entry.children) : undefined
      }))
      .filter(entry => {
        // Also remove entries that have no children after filtering
        if (entry.children) {
          const hasChildren = Array.isArray(entry.children)
            ? entry.children.length > 0
            : Object.keys(entry.children).length > 0;
          return hasChildren;
        }
        return true;
      });
  } else {
    // Filter object entries
    const filtered: Record<string, TimingEntry> = {};
    for (const [key, entry] of Object.entries(timings)) {
      if (entry.durationMs > 0) {
        const filteredEntry: TimingEntry = {
          ...entry,
          children: entry.children ? filterZeroTimings(entry.children) : undefined
        };

        // Only include if has children after filtering or has no children
        if (filteredEntry.children) {
          const hasChildren = Array.isArray(filteredEntry.children)
            ? filteredEntry.children.length > 0
            : Object.keys(filteredEntry.children).length > 0;
          if (hasChildren) {
            filtered[key] = filteredEntry;
          }
        } else {
          filtered[key] = filteredEntry;
        }
      }
    }
    return filtered;
  }
}

/**
 * Estimate the JSON size of timing data in bytes
 */
function estimateTimingDataSize(timings: TimingData): number {
  return JSON.stringify(timings).length;
}

/**
 * Collect all timing entries with their paths for sorting and removal
 */
interface TimingPath {
  path: string[];
  entry: TimingEntry;
  parent: TimingData;
  key: string | number;
}

function collectTimingPaths(timings: TimingData, parentPath: string[] = []): TimingPath[] {
  const paths: TimingPath[] = [];

  if (Array.isArray(timings)) {
    timings.forEach((entry, index) => {
      paths.push({
        path: [...parentPath, entry.name],
        entry,
        parent: timings,
        key: index
      });
      if (entry.children) {
        paths.push(...collectTimingPaths(entry.children, [...parentPath, entry.name]));
      }
    });
  } else {
    for (const [key, entry] of Object.entries(timings)) {
      paths.push({
        path: [...parentPath, key],
        entry,
        parent: timings,
        key
      });
      if (entry.children) {
        paths.push(...collectTimingPaths(entry.children, [...parentPath, key]));
      }
    }
  }

  return paths;
}

/**
 * Remove a timing entry from its parent
 */
function removeTimingEntry(parent: TimingData, key: string | number): void {
  if (Array.isArray(parent)) {
    parent.splice(key as number, 1);
  } else {
    delete parent[key as string];
  }
}

/**
 * Truncate timing data by removing smallest duration entries until under size limit
 */
function truncateTimingData(timings: TimingData, maxSizeBytes: number): ProcessedTimingData {
  // Make a deep copy to avoid mutating the original
  const workingCopy = JSON.parse(JSON.stringify(timings)) as TimingData;

  let currentSize = estimateTimingDataSize(workingCopy);
  if (currentSize <= maxSizeBytes) {
    return { data: workingCopy };
  }

  let truncated = false;

  // Keep removing smallest timings until we're under the limit
  while (currentSize > maxSizeBytes) {
    // Collect all timing paths
    const paths = collectTimingPaths(workingCopy);

    if (paths.length === 0) {
      // Nothing left to remove
      break;
    }

    // Sort by duration (ascending) - smallest first
    paths.sort((a, b) => a.entry.durationMs - b.entry.durationMs);

    // Remove the smallest timing
    const smallest = paths[0];
    removeTimingEntry(smallest.parent, smallest.key);
    truncated = true;

    // Recalculate size
    currentSize = estimateTimingDataSize(workingCopy);
  }

  return {
    data: workingCopy,
    truncated: truncated ? true : undefined
  };
}

/**
 * Process timing data by filtering zero-duration entries and truncating if needed
 * @param timings - Raw timing data from performance tracker
 * @returns Processed timing data with optional truncation flag
 */
export function processTimingData(timings: TimingData | null): ProcessedTimingData | null {
  if (!timings) {
    return null;
  }

  // First, filter out 0ms timings
  const filtered = filterZeroTimings(timings);

  // Check if empty after filtering
  const isEmpty = Array.isArray(filtered)
    ? filtered.length === 0
    : Object.keys(filtered).length === 0;

  if (isEmpty) {
    return null;
  }

  // Then truncate if needed
  return truncateTimingData(filtered, maxPerfTimingSizeBytes);
}
