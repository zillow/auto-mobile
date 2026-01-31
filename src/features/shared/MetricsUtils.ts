/**
 * Shared utility functions for metrics calculations used across threshold and baseline managers.
 */

/**
 * Weight bounds for threshold weighting.
 */
export const WEIGHT_BOUNDS = {
  min: 0.1,
  max: 2.0,
  /** Factor to multiply weight by on success */
  successMultiplier: 1.1,
  /** Factor to multiply weight by on failure */
  failureMultiplier: 0.9,
} as const;

/**
 * Adjust a weight value based on pass/fail result.
 * - Success: increases weight by 10% (up to max 2.0)
 * - Failure: decreases weight by 10% (down to min 0.1)
 *
 * @param currentWeight - Current weight value
 * @param passed - Whether the audit/check passed
 * @returns Adjusted weight value
 */
export function adjustWeight(currentWeight: number, passed: boolean): number {
  if (passed) {
    return Math.min(currentWeight * WEIGHT_BOUNDS.successMultiplier, WEIGHT_BOUNDS.max);
  }
  return Math.max(currentWeight * WEIGHT_BOUNDS.failureMultiplier, WEIGHT_BOUNDS.min);
}

/**
 * Calculate weighted average of numeric values.
 *
 * @param items - Array of objects containing values and weights
 * @param getValue - Function to extract the value from each item
 * @param getWeight - Function to extract the weight from each item
 * @returns Weighted average, or null if total weight is 0
 */
export function calculateWeightedAverage<T>(
  items: T[],
  getValue: (item: T) => number,
  getWeight: (item: T) => number
): number | null {
  if (items.length === 0) {
    return null;
  }

  const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);

  if (totalWeight === 0) {
    return null;
  }

  const weightedSum = items.reduce(
    (sum, item) => sum + getValue(item) * getWeight(item),
    0
  );

  return weightedSum / totalWeight;
}

/**
 * Calculate weighted average for multiple fields at once.
 *
 * @param items - Array of objects containing values and weights
 * @param fields - Array of field accessor functions
 * @param getWeight - Function to extract the weight from each item
 * @returns Object with weighted averages for each field, or null if total weight is 0
 */
export function calculateWeightedAverages<T, K extends string>(
  items: T[],
  fields: Array<{ key: K; getValue: (item: T) => number; round?: boolean }>,
  getWeight: (item: T) => number
): Record<K, number> | null {
  if (items.length === 0) {
    return null;
  }

  const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);

  if (totalWeight === 0) {
    return null;
  }

  const result = {} as Record<K, number>;

  for (const { key, getValue, round } of fields) {
    const weightedSum = items.reduce(
      (sum, item) => sum + getValue(item) * getWeight(item),
      0
    );
    const average = weightedSum / totalWeight;
    result[key] = round ? Math.round(average) : average;
  }

  return result;
}

/**
 * Calculate exponential moving average (EMA).
 * EMA = alpha * newValue + (1 - alpha) * oldValue
 *
 * @param oldValue - Previous baseline value
 * @param newValue - New sample value
 * @param alpha - Weight for new sample (0-1). Higher = more weight to new value.
 *               Default 0.3 means 30% new, 70% old.
 * @returns Updated EMA value
 */
export function exponentialMovingAverage(
  oldValue: number,
  newValue: number,
  alpha: number = 0.3
): number {
  return alpha * newValue + (1 - alpha) * oldValue;
}

/**
 * Calculate mode (most common value) from an array of numbers.
 * Useful for categorical values like refresh rates.
 *
 * @param values - Array of numeric values
 * @returns Mode value, or undefined if array is empty
 */
export function calculateMode(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const frequency = new Map<number, number>();
  let maxFreq = 0;
  let mode = values[0];

  for (const value of values) {
    const count = (frequency.get(value) ?? 0) + 1;
    frequency.set(value, count);
    if (count > maxFreq) {
      maxFreq = count;
      mode = value;
    }
  }

  return mode;
}

/**
 * Safe division that handles zero divisor.
 * Used for calculating anomaly multipliers.
 *
 * @param current - Numerator (current value)
 * @param baseline - Denominator (baseline value)
 * @returns Ratio, Infinity if baseline is 0 and current > 0, or 1.0 if both are 0
 */
export function safeDivide(current: number, baseline: number): number {
  if (baseline === 0) {
    return current > 0 ? Infinity : 1.0;
  }
  return current / baseline;
}

/**
 * Calculate cutoff date for cleanup operations.
 *
 * @param daysOld - Number of days before which items are considered stale
 * @returns ISO string of the cutoff date
 */
export function getCutoffDate(daysOld: number): string {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  return cutoffDate.toISOString();
}

/**
 * Default TTL values for different manager types.
 */
export const DEFAULT_TTL = {
  /** Default TTL for threshold entries in hours */
  thresholdHours: 24,
  /** Default TTL for baseline entries in days */
  baselineDays: 30,
} as const;

/**
 * Default alpha value for exponential moving average.
 * 0.3 means 30% weight to new samples, 70% to existing baseline.
 */
export const DEFAULT_EMA_ALPHA = 0.3;
