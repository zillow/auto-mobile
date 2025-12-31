/**
 * Color contrast checking for WCAG 2.1 compliance
 * Uses screenshot pixel analysis to determine text/background contrast ratios
 */

import { Jimp, intToRGBA } from "jimp";
import { Element } from "../../models/Element";
import { WcagLevel } from "../../models/AccessibilityAudit";

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface ContrastResult {
  ratio: number;
  textColor: RGB;
  backgroundColor: RGB;
  meetsAA: boolean;
  meetsAAA: boolean;
  requiredRatio: number;
}

export class ContrastChecker {
  /**
   * Calculate contrast ratio between text element and its background
   * @param screenshotPath Path to the screenshot image
   * @param element The text element to check
   * @param wcagLevel WCAG compliance level (affects minimum ratio)
   * @returns Contrast analysis result
   */
  async checkContrast(
    screenshotPath: string,
    element: Element,
    wcagLevel: WcagLevel
  ): Promise<ContrastResult | null> {
    try {
      // Read the screenshot
      const image = await Jimp.read(screenshotPath);

      // Extract element bounds
      const { left, top, right, bottom } = element.bounds;
      const width = right - left;
      const height = bottom - top;

      // Skip if element is too small to analyze
      if (width < 2 || height < 2) {
        return null;
      }

      // Sample text color (from center region of element)
      const textColor = await this.sampleTextColor(image, element.bounds);

      // Sample background color (from edges and surrounding area)
      const backgroundColor = await this.sampleBackgroundColor(image, element.bounds);

      // Calculate contrast ratio
      const ratio = this.calculateContrastRatio(textColor, backgroundColor);

      // Determine minimum required ratio based on text size
      const requiredRatio = this.getRequiredContrastRatio(element, wcagLevel);

      return {
        ratio,
        textColor,
        backgroundColor,
        meetsAA: ratio >= this.getRequiredContrastRatio(element, "AA"),
        meetsAAA: ratio >= this.getRequiredContrastRatio(element, "AAA"),
        requiredRatio,
      };
    } catch (error) {
      console.error("Contrast checking error:", error);
      return null;
    }
  }

  /**
   * Sample the text color from the center of the element
   */
  private async sampleTextColor(image: Jimp, bounds: Element["bounds"]): Promise<RGB> {
    const { left, top, right, bottom } = bounds;
    const centerX = Math.floor((left + right) / 2);
    const centerY = Math.floor((top + bottom) / 2);

    // Sample a small region around the center
    const sampleSize = 3;
    const colors: RGB[] = [];

    for (let x = centerX - sampleSize; x <= centerX + sampleSize; x++) {
      for (let y = centerY - sampleSize; y <= centerY + sampleSize; y++) {
        if (x >= left && x < right && y >= top && y < bottom) {
          try {
            const pixel = intToRGBA(image.getPixelColor(x, y));
            colors.push({ r: pixel.r, g: pixel.g, b: pixel.b });
          } catch (e) {
            // Skip invalid pixels
          }
        }
      }
    }

    // Return average color
    return this.averageColor(colors);
  }

  /**
   * Sample the background color from the edges and surrounding area
   */
  private async sampleBackgroundColor(image: Jimp, bounds: Element["bounds"]): Promise<RGB> {
    const { left, top, right, bottom } = bounds;
    const colors: RGB[] = [];

    // Sample from edges of the element
    const edgeSampleSize = 2;

    // Top and bottom edges
    for (let x = left; x < right; x += 3) {
      for (let y = top; y < top + edgeSampleSize; y++) {
        try {
          const pixel = intToRGBA(image.getPixelColor(x, y));
          colors.push({ r: pixel.r, g: pixel.g, b: pixel.b });
        } catch (e) {
          // Skip
        }
      }
      for (let y = bottom - edgeSampleSize; y < bottom; y++) {
        try {
          const pixel = intToRGBA(image.getPixelColor(x, y));
          colors.push({ r: pixel.r, g: pixel.g, b: pixel.b });
        } catch (e) {
          // Skip
        }
      }
    }

    // Left and right edges
    for (let y = top; y < bottom; y += 3) {
      for (let x = left; x < left + edgeSampleSize; x++) {
        try {
          const pixel = intToRGBA(image.getPixelColor(x, y));
          colors.push({ r: pixel.r, g: pixel.g, b: pixel.b });
        } catch (e) {
          // Skip
        }
      }
      for (let x = right - edgeSampleSize; x < right; x++) {
        try {
          const pixel = intToRGBA(image.getPixelColor(x, y));
          colors.push({ r: pixel.r, g: pixel.g, b: pixel.b });
        } catch (e) {
          // Skip
        }
      }
    }

    // If we couldn't sample edges, try surrounding area
    if (colors.length === 0) {
      const margin = 5;
      for (let x = Math.max(0, left - margin); x < left; x++) {
        for (let y = top; y < bottom; y += 3) {
          try {
            const pixel = intToRGBA(image.getPixelColor(x, y));
            colors.push({ r: pixel.r, g: pixel.g, b: pixel.b });
          } catch (e) {
            // Skip
          }
        }
      }
    }

    return this.averageColor(colors);
  }

  /**
   * Calculate average color from array of RGB values
   */
  private averageColor(colors: RGB[]): RGB {
    if (colors.length === 0) {
      return { r: 128, g: 128, b: 128 }; // Default to gray
    }

    const sum = colors.reduce(
      (acc, color) => ({
        r: acc.r + color.r,
        g: acc.g + color.g,
        b: acc.b + color.b,
      }),
      { r: 0, g: 0, b: 0 }
    );

    return {
      r: Math.round(sum.r / colors.length),
      g: Math.round(sum.g / colors.length),
      b: Math.round(sum.b / colors.length),
    };
  }

  /**
   * Calculate relative luminance for a color (WCAG formula)
   */
  private relativeLuminance(color: RGB): number {
    const rsRGB = color.r / 255;
    const gsRGB = color.g / 255;
    const bsRGB = color.b / 255;

    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Calculate contrast ratio between two colors (WCAG formula)
   */
  private calculateContrastRatio(color1: RGB, color2: RGB): number {
    const lum1 = this.relativeLuminance(color1);
    const lum2 = this.relativeLuminance(color2);

    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Get required contrast ratio for an element based on WCAG level
   */
  private getRequiredContrastRatio(element: Element, level: WcagLevel): number {
    // Determine if text is large (18pt or 14pt bold)
    // We approximate based on element height in pixels
    const height = element.bounds.bottom - element.bounds.top;
    const isLargeText = height >= 24; // Rough approximation for large text

    if (level === "AAA") {
      return isLargeText ? 4.5 : 7.0;
    } else if (level === "AA") {
      return isLargeText ? 3.0 : 4.5;
    } else {
      // Level A
      return isLargeText ? 3.0 : 4.5; // Same as AA for contrast
    }
  }
}
