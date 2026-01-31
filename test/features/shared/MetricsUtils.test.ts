import { describe, it, expect } from "bun:test";
import {
  adjustWeight,
  calculateWeightedAverage,
  calculateWeightedAverages,
  exponentialMovingAverage,
  calculateMode,
  safeDivide,
  getCutoffDate,
  WEIGHT_BOUNDS,
  DEFAULT_TTL,
  DEFAULT_EMA_ALPHA,
} from "../../../src/features/shared/MetricsUtils";

describe("MetricsUtils", () => {
  describe("adjustWeight", () => {
    it("increases weight by 10% on success", () => {
      expect(adjustWeight(1.0, true)).toBeCloseTo(1.1);
      expect(adjustWeight(0.5, true)).toBeCloseTo(0.55);
    });

    it("decreases weight by 10% on failure", () => {
      expect(adjustWeight(1.0, false)).toBeCloseTo(0.9);
      expect(adjustWeight(0.5, false)).toBeCloseTo(0.45);
    });

    it("caps weight at maximum 2.0", () => {
      expect(adjustWeight(1.9, true)).toBeCloseTo(2.0);
      expect(adjustWeight(2.0, true)).toBe(2.0);
    });

    it("floors weight at minimum 0.1", () => {
      expect(adjustWeight(0.11, false)).toBeCloseTo(0.1);
      expect(adjustWeight(0.1, false)).toBe(0.1);
    });
  });

  describe("calculateWeightedAverage", () => {
    interface TestItem {
      value: number;
      weight: number;
    }

    it("calculates weighted average correctly", () => {
      const items: TestItem[] = [
        { value: 10, weight: 1 },
        { value: 20, weight: 1 },
      ];
      const avg = calculateWeightedAverage(
        items,
        i => i.value,
        i => i.weight
      );
      expect(avg).toBe(15);
    });

    it("applies weights correctly", () => {
      const items: TestItem[] = [
        { value: 10, weight: 3 },
        { value: 20, weight: 1 },
      ];
      // (10*3 + 20*1) / (3+1) = 50/4 = 12.5
      const avg = calculateWeightedAverage(
        items,
        i => i.value,
        i => i.weight
      );
      expect(avg).toBe(12.5);
    });

    it("returns null for empty array", () => {
      const avg = calculateWeightedAverage(
        [],
        (i: TestItem) => i.value,
        (i: TestItem) => i.weight
      );
      expect(avg).toBeNull();
    });

    it("returns null when total weight is zero", () => {
      const items: TestItem[] = [
        { value: 10, weight: 0 },
        { value: 20, weight: 0 },
      ];
      const avg = calculateWeightedAverage(
        items,
        i => i.value,
        i => i.weight
      );
      expect(avg).toBeNull();
    });
  });

  describe("calculateWeightedAverages", () => {
    interface TestData {
      a: number;
      b: number;
      weight: number;
    }

    it("calculates multiple weighted averages", () => {
      const items: TestData[] = [
        { a: 10, b: 100, weight: 1 },
        { a: 20, b: 200, weight: 1 },
      ];

      const result = calculateWeightedAverages(
        items,
        [
          { key: "avgA", getValue: i => i.a },
          { key: "avgB", getValue: i => i.b },
        ],
        i => i.weight
      );

      expect(result).toEqual({ avgA: 15, avgB: 150 });
    });

    it("rounds values when specified", () => {
      const items: TestData[] = [
        { a: 10, b: 100, weight: 1 },
        { a: 15, b: 150, weight: 1 },
      ];

      const result = calculateWeightedAverages(
        items,
        [
          { key: "avgA", getValue: i => i.a, round: true },
          { key: "avgB", getValue: i => i.b },
        ],
        i => i.weight
      );

      expect(result).toEqual({ avgA: 13, avgB: 125 }); // 12.5 rounded to 13
    });

    it("returns null for empty array", () => {
      const result = calculateWeightedAverages(
        [] as TestData[],
        [{ key: "avgA", getValue: i => i.a }],
        i => i.weight
      );
      expect(result).toBeNull();
    });
  });

  describe("exponentialMovingAverage", () => {
    it("calculates EMA with default alpha", () => {
      // 0.3 * 100 + 0.7 * 50 = 30 + 35 = 65
      const ema = exponentialMovingAverage(50, 100);
      expect(ema).toBeCloseTo(65);
    });

    it("calculates EMA with custom alpha", () => {
      // 0.5 * 100 + 0.5 * 50 = 75
      const ema = exponentialMovingAverage(50, 100, 0.5);
      expect(ema).toBe(75);
    });

    it("with alpha=1, returns new value", () => {
      expect(exponentialMovingAverage(50, 100, 1)).toBe(100);
    });

    it("with alpha=0, returns old value", () => {
      expect(exponentialMovingAverage(50, 100, 0)).toBe(50);
    });
  });

  describe("calculateMode", () => {
    it("returns most frequent value", () => {
      expect(calculateMode([60, 60, 60, 90, 120])).toBe(60);
    });

    it("handles single value", () => {
      expect(calculateMode([60])).toBe(60);
    });

    it("returns first mode when tied", () => {
      const mode = calculateMode([60, 90, 60, 90]);
      expect([60, 90]).toContain(mode);
    });

    it("returns undefined for empty array", () => {
      expect(calculateMode([])).toBeUndefined();
    });
  });

  describe("safeDivide", () => {
    it("returns ratio for normal division", () => {
      expect(safeDivide(100, 50)).toBe(2);
      expect(safeDivide(25, 100)).toBe(0.25);
    });

    it("returns Infinity when baseline is 0 and current > 0", () => {
      expect(safeDivide(100, 0)).toBe(Infinity);
    });

    it("returns 1.0 when both are 0", () => {
      expect(safeDivide(0, 0)).toBe(1.0);
    });
  });

  describe("getCutoffDate", () => {
    it("returns date N days in the past", () => {
      const cutoff = getCutoffDate(7);
      const expected = new Date();
      expected.setDate(expected.getDate() - 7);

      // Compare date portion only (ignore time differences)
      expect(cutoff.slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    });

    it("returns ISO string format", () => {
      const cutoff = getCutoffDate(1);
      expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("constants", () => {
    it("WEIGHT_BOUNDS has expected values", () => {
      expect(WEIGHT_BOUNDS.min).toBe(0.1);
      expect(WEIGHT_BOUNDS.max).toBe(2.0);
      expect(WEIGHT_BOUNDS.successMultiplier).toBe(1.1);
      expect(WEIGHT_BOUNDS.failureMultiplier).toBe(0.9);
    });

    it("DEFAULT_TTL has expected values", () => {
      expect(DEFAULT_TTL.thresholdHours).toBe(24);
      expect(DEFAULT_TTL.baselineDays).toBe(30);
    });

    it("DEFAULT_EMA_ALPHA is 0.3", () => {
      expect(DEFAULT_EMA_ALPHA).toBe(0.3);
    });
  });
});
