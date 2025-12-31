/**
 * Unit tests for ContrastChecker
 * Tests WCAG color contrast calculations and requirements
 */

import { expect } from "chai";
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

      expect(result).to.not.be.null;
      expect(result!.ratio).to.be.closeTo(21, 0.1);
      expect(result!.meetsAA).to.be.true;
      expect(result!.meetsAAA).to.be.true;
    });

    it("should calculate correct contrast ratio for WCAG AA minimum (4.5:1)", async function() {
      const screenshotPath = path.join(fixturesDir, "wcag-aa-minimum.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).to.not.be.null;
      // Allow tolerance for pixel sampling variations
      expect(result!.ratio).to.be.at.least(4.5);
      expect(result!.ratio).to.be.at.most(5.0);
      expect(result!.meetsAA).to.be.true;
    });

    it("should fail elements below threshold", async function() {
      const screenshotPath = path.join(fixturesDir, "wcag-aa-fail.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).to.not.be.null;
      expect(result!.ratio).to.be.lessThan(4.5);
      expect(result!.meetsAA).to.be.false;
    });

    it("should pass elements above threshold", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).to.not.be.null;
      expect(result!.ratio).to.be.greaterThan(4.5);
      expect(result!.meetsAA).to.be.true;
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

      expect(smallResult).to.not.be.null;
      expect(largeResult).to.not.be.null;

      // Same image should have different AA thresholds
      expect(smallResult!.requiredRatio).to.equal(4.5);
      expect(largeResult!.requiredRatio).to.equal(3.0);
    });

    it("should skip elements too small to analyze", async function() {
      const screenshotPath = path.join(fixturesDir, "small-element.png");

      // Element with width < 2 or height < 2
      const tinyElement: Element = {
        bounds: { left: 0, top: 0, right: 1, bottom: 1 },
        text: "X",
      };

      const result = await checker.checkContrast(screenshotPath, tinyElement, "AA");

      expect(result).to.be.null;
    });

    it("should handle colored text on colored background", async function() {
      const screenshotPath = path.join(fixturesDir, "blue-on-yellow.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Colored",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).to.not.be.null;
      // Blue on yellow should have some contrast
      expect(result!.ratio).to.be.greaterThan(1);

      // Verify colors are captured correctly (blue-ish text, yellow-ish background)
      expect(result!.textColor.b).to.be.greaterThan(result!.textColor.r);
      expect(result!.backgroundColor.r).to.be.greaterThan(200);
      expect(result!.backgroundColor.g).to.be.greaterThan(200);
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

      expect(result).to.not.be.null;
      expect(result!.requiredRatio).to.equal(4.5);
    });

    it("should use 3.0:1 for AA large text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 }, // Large size (>= 24px)
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).to.not.be.null;
      expect(result!.requiredRatio).to.equal(3.0);
    });

    it("should use 7.0:1 for AAA normal text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 20 }, // Normal size
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).to.not.be.null;
      expect(result!.requiredRatio).to.equal(7.0);
    });

    it("should use 4.5:1 for AAA large text", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 30 }, // Large size (>= 24px)
        text: "Large Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).to.not.be.null;
      expect(result!.requiredRatio).to.equal(4.5);
    });

    it("should correctly evaluate AAA compliance for high contrast", async function() {
      const screenshotPath = path.join(fixturesDir, "wcag-aaa-normal.png");
      // Use full image bounds to get proper edge sampling from background
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Text",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AAA");

      expect(result).to.not.be.null;
      expect(result!.ratio).to.be.at.least(7.0);
      expect(result!.meetsAAA).to.be.true;
      expect(result!.meetsAA).to.be.true; // Should also meet AAA
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

      expect(result).to.not.be.null;
      expect(result!.ratio).to.be.lessThan(4.5);
      expect(result!.meetsAA).to.be.true; // Meets AA (3.0:1 for large text)
      expect(result!.meetsAAA).to.be.false; // Does not meet AAA (needs 4.5:1 for large text)
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

      expect(result).to.not.be.null;
      expect(result!.ratio).to.be.closeTo(21, 0.1);
      expect(result!.meetsAA).to.be.true;
      expect(result!.meetsAAA).to.be.true;
    });

    it("should return null for invalid screenshot path", async function() {
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Text",
      };

      const result = await checker.checkContrast("/nonexistent/path.png", element, "AA");

      expect(result).to.be.null;
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
        expect(result.ratio).to.be.a("number");
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
      expect(result).to.satisfy((r: any) => r === null || typeof r.ratio === "number");
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

      expect(result).to.not.be.null;
      // Should detect black text in center (center at 50,25 is in the text region 5-95)
      expect(result!.textColor.r).to.be.lessThan(50);
      expect(result!.textColor.g).to.be.lessThan(50);
      expect(result!.textColor.b).to.be.lessThan(50);
    });

    it("should sample background color from edges", async function() {
      const screenshotPath = path.join(fixturesDir, "black-on-white.png");
      // Use full image bounds so edges are actually the background
      const element: Element = {
        bounds: { left: 0, top: 0, right: 100, bottom: 50 },
        text: "Sample",
      };

      const result = await checker.checkContrast(screenshotPath, element, "AA");

      expect(result).to.not.be.null;
      // Should detect white background from edges (0-5px and 95-100px have white)
      expect(result!.backgroundColor.r).to.be.greaterThan(200);
      expect(result!.backgroundColor.g).to.be.greaterThan(200);
      expect(result!.backgroundColor.b).to.be.greaterThan(200);
    });
  });
});
