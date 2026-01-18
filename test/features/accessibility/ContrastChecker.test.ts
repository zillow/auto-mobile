/**
 * Unit tests for ContrastChecker
 * Tests WCAG color contrast calculations and requirements
 */

import { expect, describe, it, beforeEach } from "bun:test";
import * as path from "path";
import { ContrastChecker } from "../../../src/features/accessibility/ContrastChecker";
import type { Element } from "../../../src/models/Element";

describe("ContrastChecker", function() {
  let checker: ContrastChecker;
  const fixturesDir = path.join(__dirname, "../../fixtures/screenshots");

  beforeEach(function() {
    checker = new ContrastChecker();
  });

  describe("Color Calculations", function() {
    it("should calculate correct contrast ratio for black on white (21:1)", async function() {
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

    it("should calculate correct contrast ratio for WCAG AA minimum (4.5:1)", async function() {
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

    it("should fail elements below threshold", async function() {
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

    it("should pass elements above threshold", async function() {
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

    it("should handle large text vs normal text thresholds", async function() {
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
      expect(smallResult!.requiredRatio).toEqual(4.5);
      expect(largeResult!.requiredRatio).toEqual(3.0);
    });

    it("should skip elements too small to analyze", async function() {
      const screenshotPath = path.join(fixturesDir, "small-element.png");

      // Element with width < 2 or height < 2
      const tinyElement: Element = {
        bounds: { left: 0, top: 0, right: 1, bottom: 1 },
        text: "X",
      };

      const result = await checker.checkContrast(screenshotPath, tinyElement, "AA");

      expect(result).toBeNull();
    });

    it("should handle colored text on colored background", async function() {
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

  describe("WCAG Level Requirements", function() {
    it("should use 4.5:1 for AA normal text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 20 }, // Normal size
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toEqual(4.5);
    });

    it("should use 3.0:1 for AA large text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 }, // Large size (>= 24px)
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toEqual(3.0);
    });

    it("should use 7.0:1 for AAA normal text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 20 }, // Normal size
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toEqual(7.0);
    });

    it("should use 4.5:1 for AAA large text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 }, // Large size (>= 24px)
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.requiredRatio).toEqual(4.5);
    });

    it("should correctly evaluate AAA compliance for high contrast", async function() {
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

    it("should correctly evaluate AAA compliance for borderline contrast", async function() {
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

  describe("Edge Cases", function() {
    it("should handle white on black (inverted contrast)", async function() {
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

    it("should return null for invalid screenshot path", async function() {
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Text",
      };

      const result = await checker.checkContrast("/nonexistent/path.png", element, "AA");

      expect(result).toBeNull();
    });

    it("should handle elements at image boundaries", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");

      // Element right at the edge of a 100x50 image
      const edgeElement: Element = {
        bounds: { left: 95, top: 45, right: 100, bottom: 50 },
        text: "Edge",
      };

      const result = await checker.checkContrast(screenshotPath, edgeElement, "AA");

      // Should either return valid result or null, but not throw
      if (result !== null) {
        expect(result.ratio).toBeTypeOf("number");
      }
    });

    it("should handle elements larger than screenshot", async function() {
      const screenshotPath = path.join(fixturesDir, "small-element.png");

      // Element bounds larger than the 20x10 image
      const oversizedElement: Element = {
        bounds: { left: 0, top: 0, right: 200, bottom: 100 },
        text: "Oversized",
      };

      const result = await checker.checkContrast(screenshotPath, oversizedElement, "AA");

      // Should handle gracefully
      expect(result === null || typeof result?.ratio === "number").toBe(true);
    });
  });

  describe("Color Sampling", function() {
    it("should sample text color from center region", async function() {
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

    it("should sample background color from edges", async function() {
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

  describe("Enhanced Sampling", function() {
    it("should report worst-case contrast on gradients", async function() {
      const screenshotPath = path.join(fixturesDir, "gradient-contrast-fail.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 120, bottom: 60 },
        text: "Gradient",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.minRatio).toBeLessThan(result!.maxRatio);
      expect(result!.minRatio).toBeLessThan(result!.requiredRatio);
      expect(result!.gradient?.isGradient).toBe(true);
    });

    it("should composite semi-transparent overlays when enabled", async function() {
      const overlayChecker = new ContrastChecker({ compositeOverlays: true });
      const screenshotPath = path.join(fixturesDir, "overlay-scrim.png");
      const element: Element = {
        bounds: { left: 20, top: 10, right: 100, bottom: 50 },
        text: "Overlay",
      };

      const result = await overlayChecker.checkContrast(screenshotPath, element, "AA");

      expect(result).not.toBeNull();
      expect(result!.backgroundColor.r).toBeGreaterThan(80);
      expect(result!.backgroundColor.r).toBeLessThan(200);
    });

    it("should adjust contrast requirements when text shadow is detected", async function() {
      const shadowChecker = new ContrastChecker({ detectTextShadows: true });
      const screenshotPath = path.join(fixturesDir, "shadowed-text.png");
      const element: Element = {
        bounds: { left: 14, top: 14, right: 106, bottom: 46 },
        text: "Shadow",
      };

      const result = await shadowChecker.checkContrast(screenshotPath, element, "AAA");

      expect(result).not.toBeNull();
      expect(result!.shadowDetected).toBe(true);
      expect(result!.requiredRatio).toBeLessThan(result!.baseRequiredRatio);
    });
  });
});
