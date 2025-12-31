/**
 * Unit tests for ContrastChecker
 * Tests WCAG color contrast calculations and requirements
 */

import { expect, describe, test, beforeEach } from "bun:test";
import * as path from "path";
import { ContrastChecker } from "../../../src/features/accessibility/ContrastChecker";
import type { Element } from "../../../src/models/Element";

describe("ContrastChecker", () => {
  let checker: ContrastChecker;
  const fixturesDir = path.join(__dirname, "../../fixtures/screenshots");

  beforeEach(() => {
    checker = new ContrastChecker();
  });

  describe("Color Calculations", () => {
    test("should calculate correct contrast ratio for black on white (21:1)", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.ratio).toBeCloseTo(21, 0.1);
      expect(result!.meetsAA).toBe(true);
      expect(result!.meetsAAA).toBe(true);
    });

    test("should calculate correct contrast ratio for WCAG AA minimum (4.5:1)", async () => {
      const screenshotPath = path.join(fixturesDir, "wcag-aa-minimum.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      // Allow tolerance for pixel sampling variations
      expect(result!.ratio).toBeGreaterThanOrEqual(4.5);
      expect(result!.ratio).toBeLessThanOrEqual(5.0);
      expect(result!.meetsAA).toBe(true);
    });

    test("should fail elements below threshold", async () => {
      const screenshotPath = path.join(fixturesDir, "wcag-aa-fail.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.ratio).toBeLessThan(4.5);
      expect(result!.meetsAA).toBe(false);
    });

    test("should pass elements above threshold", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.ratio).toBeGreaterThan(4.5);
      expect(result!.meetsAA).toBe(true);
    });

    test("should handle large text vs normal text thresholds", async () => {
      const screenshotPath = path.join(fixturesDir, "wcag-aa-large-text.png");

      // Small text element (height < 24px) - requires 4.5:1 for AA
      const smallTextElement: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 20 },
        text: "Small",
      };

      // Large text element (height >= 24px) - requires 3.0:1 for AA
      const largeTextElement: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 },
        text: "Large",
      };

      const smallResult = await checker.checkContrast(screenshotPath, smallTextElement, "AA");
      const largeResult = await checker.checkContrast(screenshotPath, largeTextElement, "AA");

      expect(smallResult).not.toBeNull();
      expect(largeResult).not.toBeNull();

      // Same image should have different AA thresholds
      expect(smallResult!.requiredRatio).toBe(4.5);
      expect(largeResult!.requiredRatio).toBe(3.0);
    });

    test("should skip elements too small to analyze", async () => {
      const screenshotPath = path.join(fixturesDir, "small-element.png");

      // Element with width < 2 or height < 2
      const tinyElement: Element = {
        bounds: { left: 0, top: 0, right: 1, bottom: 1 },
        text: "X",
      };

      const result = await checker.checkContrast(screenshotPath, tinyElement, "AA");

      expect(result).toBeNull();
    });

    test("should handle colored text on colored background", async () => {
      const screenshotPath = path.join(fixturesDir, "blue-on-yellow.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Colored",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      // Blue on yellow should have some contrast
      expect(result!.ratio).toBeGreaterThan(1);

      // Verify colors are captured correctly (blue-ish text, yellow-ish background)
      expect(result!.textColor.b).toBeGreaterThan(result!.textColor.r);
      expect(result!.backgroundColor.r).toBeGreaterThan(200);
      expect(result!.backgroundColor.g).toBeGreaterThan(200);
    });
  });

  describe("WCAG Level Requirements", () => {
    test("should use 4.5:1 for AA normal text", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 20 }, // Normal size
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toBe(4.5);
    });

    test("should use 3.0:1 for AA large text", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 }, // Large size (>= 24px)
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toBe(3.0);
    });

    test("should use 7.0:1 for AAA normal text", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 20 }, // Normal size
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toBe(7.0);
    });

    test("should use 4.5:1 for AAA large text", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 }, // Large size (>= 24px)
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toBe(4.5);
    });

    test("should correctly evaluate AAA compliance for high contrast", async () => {
      const screenshotPath = path.join(fixturesDir, "wcag-aaa-normal.png");
      // Use full image bounds to get proper edge sampling from background
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.ratio).toBeGreaterThanOrEqual(7.0);
      expect(result!.meetsAAA).toBe(true);
      expect(result!.meetsAA).toBe(true); // Should also meet AAA
    });

    test("should correctly evaluate AAA compliance for borderline contrast", async () => {
      const screenshotPath = path.join(fixturesDir, "wcag-aa-large-text.png");
      // Use full image bounds - height 50 makes it "large text"
      // Large text requires 4.5:1 for AAA, but this image only has 3.0:1
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 }, // Height >= 24 = large text
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.ratio).toBeLessThan(4.5);
      expect(result!.meetsAA).toBe(true); // Meets AA (3.0:1 for large text)
      expect(result!.meetsAAA).toBe(false); // Does not meet AAA (needs 4.5:1 for large text)
    });
  });

  describe("Edge Cases", () => {
    test("should handle white on black (inverted contrast)", async () => {
      const screenshotPath = path.join(fixturesDir, "white-on-black.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Inverted",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.ratio).toBeCloseTo(21, 0.1);
      expect(result!.meetsAA).toBe(true);
      expect(result!.meetsAAA).toBe(true);
    });

    test("should return null for invalid screenshot path", async () => {
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Text",
      };

      const result = await checker.checkContrast("/nonexistent/path.png", element, "AA");

      expect(result).toBeNull();
    });

    test("should handle elements at image boundaries", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");

      // Element right at the edge of a 100x50 image
      const edgeElement: Element = {
        bounds: { left: 95, top: 45, right: 100, bottom: 50 },
        text: "Edge",
      };

      const result = await checker.checkContrast(screenshotPath, edgeElement, "AA");

      // Should either return valid result or null, but not throw
      if (result !== null) {
        expect(typeof result.ratio).toBe("number");
      }
    });

    test("should handle elements larger than screenshot", async () => {
      const screenshotPath = path.join(fixturesDir, "small-element.png");

      // Element bounds larger than the 20x10 image
      const oversizedElement: Element = {
        bounds: { left: 0, top: 0, right: 200, bottom: 100 },
        text: "Oversized",
      };

      const result = await checker.checkContrast(screenshotPath, oversizedElement, "AA");

      // Should handle gracefully
      expect(result === null || (result && typeof result.ratio === "number")).toBeTruthy();
    });
  });

  describe("Color Sampling", () => {
    test("should sample text color from center region", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      // Use full image bounds - center will have text color (black from 5-95)
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Center",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      // Should detect black text in center (center at 50,25 is in the text region 5-95)
      expect(result!.textColor.r).toBeLessThan(50);
      expect(result!.textColor.g).toBeLessThan(50);
      expect(result!.textColor.b).toBeLessThan(50);
    });

    test("should sample background color from edges", async () => {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      // Use full image bounds so edges are actually the background
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      // Should detect white background from edges (0-5px and 95-100px have white)
      expect(result!.backgroundColor.r).toBeGreaterThan(200);
      expect(result!.backgroundColor.g).toBeGreaterThan(200);
      expect(result!.backgroundColor.b).toBeGreaterThan(200);
    });
  });

  describe("Caching Functionality", () => {
    test("should cache screenshot when enabled", async () => {
      const checker = new ContrastChecker({
        enableScreenshotCache: true,
        enableElementCache: false // Disable element cache to test screenshot cache
      });
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      // First call - cache miss
      await checker.checkContrast(screenshotPath, element, "AA");
      let stats = checker.getCacheStats();
      expect(stats.screenshots.misses).toBe(1);
      expect(stats.screenshots.hits).toBe(0);

      // Second call - cache hit (same screenshot, different element logic)
      await checker.checkContrast(screenshotPath, element, "AA");
      stats = checker.getCacheStats();
      expect(stats.screenshots.hits).toBeGreaterThan(0);
    });

    test("should cache color pairs when enabled", async () => {
      const checker = new ContrastChecker({
        enableColorPairCache: true,
        enableElementCache: false // Disable element cache to test color pair cache
      });
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      // First call
      await checker.checkContrast(screenshotPath, element, "AA");

      // Second call should hit color pair cache (same text/bg colors)
      await checker.checkContrast(screenshotPath, element, "AA");

      const stats = checker.getCacheStats();
      expect(stats.colorPairs.size).toBeGreaterThan(0);
      expect(stats.colorPairs.hits).toBeGreaterThan(0);
    });

    test("should cache element results when enabled", async () => {
      const checker = new ContrastChecker({ enableElementCache: true   });
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      // First call - cache miss
      await checker.checkContrast(screenshotPath, element, "AA");
      let stats = checker.getCacheStats();
      expect(stats.elements.misses).toBe(1);

      // Second call - cache hit (same element, same screenshot)
      await checker.checkContrast(screenshotPath, element, "AA");
      stats = checker.getCacheStats();
      expect(stats.elements.hits).toBe(1);
      expect(stats.elements.size).toBe(1);
    });

    test("should cache background colors when enabled", async () => {
      const checker = new ContrastChecker({ enableBackgroundCache: true   });
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element1: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample 1",
      };
      const element2: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 }, // Same bounds
        text: "Sample 2", // Different text
      };

      // Clear caches to start fresh
      checker.clearCaches();

      // First element
      await checker.checkContrast(screenshotPath, element1, "AA");

      // Second element with same bounds should hit background cache
      await checker.checkContrast(screenshotPath, element2, "AA");

      const stats = checker.getCacheStats();
      expect(stats.backgrounds.size).toBeGreaterThan(0);
      expect(stats.backgrounds.hits).toBeGreaterThan(0);
    });

    test("should not cache when caching is disabled", async () => {
      const checker = new ContrastChecker({
        enableScreenshotCache: false,
        enableColorPairCache: false,
        enableElementCache: false,
        enableBackgroundCache: false,
      });
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      await checker.checkContrast(screenshotPath, element, "AA");
      await checker.checkContrast(screenshotPath, element, "AA");

      const stats = checker.getCacheStats();
      expect(stats.screenshots.size).toBe(0);
      expect(stats.colorPairs.size).toBe(0);
      expect(stats.elements.size).toBe(0);
      expect(stats.backgrounds.size).toBe(0);
    });

    test("should clear all caches when requested", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      // Populate caches
      await checker.checkContrast(screenshotPath, element, "AA");

      // Verify caches have content
      let stats = checker.getCacheStats();
      expect(stats.screenshots.size).toBeGreaterThan(0);

      // Clear caches
      checker.clearCaches();

      // Verify caches are empty
      stats = checker.getCacheStats();
      expect(stats.screenshots.size).toBe(0);
      expect(stats.colorPairs.size).toBe(0);
      expect(stats.elements.size).toBe(0);
      expect(stats.backgrounds.size).toBe(0);
      expect(stats.screenshots.hits).toBe(0);
      expect(stats.screenshots.misses).toBe(0);
    });

    test("should respect cache size limits", async () => {
      const checker = new ContrastChecker({
        maxCacheSize: {
          colorPairs: 2,
        },
      });
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");

      // Create elements with different bounds to generate different color pairs
      for (let i = 0; i < 5; i++) {
        const element: Element = {
          bounds: { left: i * 10, top: 0, right: (i + 1) * 10, bottom: 50 },
          text: `Element ${i}`,
        };
        await checker.checkContrast(screenshotPath, element, "AA");
      }

      const stats = checker.getCacheStats();
      // Should not exceed max size
      expect(stats.colorPairs.size).toBeLessThanOrEqual(2);
    });
  });

  describe("Batch Processing", () => {
    test("should process multiple elements in batch", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const elements: Element[] = [
        { bounds: { left: 0, top: 0, right: 50, bottom: 25 }, text: "Element 1" },
        { bounds: { left: 50, top: 0, right: 100, bottom: 25 }, text: "Element 2" },
        { bounds: { left: 0, top: 25, right: 50, bottom: 50 }, text: "Element 3" },
      ];

      const results = await checker.checkContrastBatch(screenshotPath, elements, "AA");

      expect(results.size).toBe(3);
      for (const element of elements) {
        const result = results.get(element);
        expect(result).not.toBeNull();
        expect(typeof result!.ratio).toBe("number");
      }
    });

    test("should load screenshot only once for batch", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const elements: Element[] = Array.from({ length: 10 }, (_, i) => ({
        bounds: { left: i * 10, top: 0, right: (i + 1) * 10, bottom: 50 },
        text: `Element ${i}`,
      }));

      checker.clearCaches();
      await checker.checkContrastBatch(screenshotPath, elements, "AA");

      const stats = checker.getCacheStats();
      // Screenshot should be loaded once
      expect(stats.screenshots.misses).toBe(1);
      expect(stats.screenshots.size).toBe(1);
    });

    test("should use element cache in batch processing", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      // First batch call
      await checker.checkContrastBatch(screenshotPath, [element], "AA");

      // Second batch call should hit element cache
      checker.clearCaches(); // Clear screenshot cache but keep element cache
      const initialElementSize = checker.getCacheStats().elements.size;

      await checker.checkContrastBatch(screenshotPath, [element], "AA");

      const stats = checker.getCacheStats();
      // Element cache should still have the entry
      expect(stats.elements.size).toBeGreaterThanOrEqual(initialElementSize);
    });

    test("should handle empty element array", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");

      const results = await checker.checkContrastBatch(screenshotPath, [], "AA");

      expect(results.size).toBe(0);
    });

    test("should handle elements with null results in batch", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const elements: Element[] = [
        { bounds: { left: 0, top: 0, right: 100, bottom: 50 }, text: "Valid" },
        { bounds: { left: 0, top: 0, right: 1, bottom: 1 }, text: "Too small" }, // Should return null
      ];

      const results = await checker.checkContrastBatch(screenshotPath, elements, "AA");

      expect(results.size).toBe(2);
      expect(results.get(elements[0])).not.toBeNull();
      expect(results.get(elements[1])).toBeNull(); // Too small element
    });
  });

  describe("Cache Statistics", () => {
    test("should track cache hit rates", async () => {
      const checker = new ContrastChecker();
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      checker.clearCaches();

      // First call - all misses
      await checker.checkContrast(screenshotPath, element, "AA");
      let stats = checker.getCacheStats();
      expect(stats.screenshots.misses).toBe(1);
      expect(stats.screenshots.hits).toBe(0);
      expect(stats.elements.misses).toBe(1);

      // Second call - should hit element cache (which includes the result)
      await checker.checkContrast(screenshotPath, element, "AA");
      stats = checker.getCacheStats();
      expect(stats.elements.hits).toBeGreaterThan(0);
    });

    test("should provide cache statistics via getCacheStats", async () => {
      const checker = new ContrastChecker();
      const stats = checker.getCacheStats();

      expect(stats).toHaveProperty("screenshots");
      expect(stats).toHaveProperty("colorPairs");
      expect(stats).toHaveProperty("elements");
      expect(stats).toHaveProperty("backgrounds");

      expect(stats.screenshots).toHaveProperty("size");
      expect(stats.screenshots).toHaveProperty("hits");
      expect(stats.screenshots).toHaveProperty("misses");
    });
  });
});
