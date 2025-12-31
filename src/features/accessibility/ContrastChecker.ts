/**
 * Color contrast checking for WCAG 2.1 compliance
 * Uses screenshot pixel analysis to determine text/background contrast ratios
 * Optimized with multi-level caching for performance
 */

import { Jimp, intToRGBA } from "jimp";
import fs from "fs/promises";
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

/**
 * Configuration options for contrast checking caches
 */
export interface ContrastCheckConfig {
  /** Enable screenshot caching (default: true) */
  enableScreenshotCache?: boolean;

  /** Enable color pair caching (default: true) */
  enableColorPairCache?: boolean;

  /** Enable element result caching (default: true) */
  enableElementCache?: boolean;

  /** Enable background color caching (default: true) */
  enableBackgroundCache?: boolean;

  /** Screenshot cache TTL in milliseconds (default: 60000 = 1 minute) */
  screenshotCacheTTL?: number;

  /** Maximum cache sizes */
  maxCacheSize?: {
    screenshots?: number;    // Default: 10
    colorPairs?: number;     // Default: 1000
    elements?: number;       // Default: 500
    backgrounds?: number;    // Default: 200
  };
}

/**
 * Cache statistics for debugging and monitoring
 */
export interface CacheStats {
  screenshots: {
    size: number;
    hits: number;
    misses: number;
  };
  colorPairs: {
    size: number;
    hits: number;
    misses: number;
  };
  elements: {
    size: number;
    hits: number;
    misses: number;
  };
  backgrounds: {
    size: number;
    hits: number;
    misses: number;
  };
}

/**
 * Screenshot cache entry
 */
interface ScreenshotCacheEntry {
  image: Jimp;
  timestamp: number;
  fingerprint: string;
}

/**
 * Element result cache entry
 */
interface ElementCacheEntry {
  result: ContrastResult;
  timestamp: number;
  screenshotFingerprint: string;
}

export class ContrastChecker {
  private config: Required<ContrastCheckConfig>;

  // Phase 1: Screenshot cache
  private screenshotCache = new Map<string, ScreenshotCacheEntry>();
  private screenshotHits = 0;
  private screenshotMisses = 0;

  // Phase 2: Color pair contrast cache
  private contrastCache = new Map<string, number>();
  private colorPairHits = 0;
  private colorPairMisses = 0;

  // Phase 3: Element result cache
  private elementCache = new Map<string, ElementCacheEntry>();
  private elementHits = 0;
  private elementMisses = 0;

  // Phase 5: Background color cache
  private bgColorCache = new Map<string, RGB>();
  private bgColorHits = 0;
  private bgColorMisses = 0;

  constructor(config: ContrastCheckConfig = {}) {
    this.config = {
      enableScreenshotCache: config.enableScreenshotCache ?? true,
      enableColorPairCache: config.enableColorPairCache ?? true,
      enableElementCache: config.enableElementCache ?? true,
      enableBackgroundCache: config.enableBackgroundCache ?? true,
      screenshotCacheTTL: config.screenshotCacheTTL ?? 60_000,
      maxCacheSize: {
        screenshots: config.maxCacheSize?.screenshots ?? 10,
        colorPairs: config.maxCacheSize?.colorPairs ?? 1000,
        elements: config.maxCacheSize?.elements ?? 500,
        backgrounds: config.maxCacheSize?.backgrounds ?? 200,
      },
    };
  }
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
      // Phase 3: Check element-level cache
      if (this.config.enableElementCache) {
        const elementKey = this.elementCacheKey(element, wcagLevel);
        const screenshotFingerprint = await this.getScreenshotFingerprint(screenshotPath);
        const cached = this.elementCache.get(elementKey);

        if (cached && cached.screenshotFingerprint === screenshotFingerprint) {
          this.elementHits++;
          return cached.result;
        }
        this.elementMisses++;
      }

      // Extract element bounds
      const { left, top, right, bottom } = element.bounds;
      const width = right - left;
      const height = bottom - top;

      // Skip if element is too small to analyze
      if (width < 2 || height < 2) {
        return null;
      }

      // Phase 1: Get or load screenshot from cache
      const image = await this.getOrLoadScreenshot(screenshotPath);

      // Calculate contrast with the loaded image
      const result = await this.checkContrastWithImage(image, element, wcagLevel);

      // Cache the result if element caching is enabled
      if (result && this.config.enableElementCache) {
        const elementKey = this.elementCacheKey(element, wcagLevel);
        const screenshotFingerprint = await this.getScreenshotFingerprint(screenshotPath);

        this.elementCache.set(elementKey, {
          result,
          timestamp: Date.now(),
          screenshotFingerprint,
        });

        // Cleanup element cache if needed
        this.cleanupCache(this.elementCache, this.config.maxCacheSize.elements);
      }

      return result;
    } catch (error) {
      console.error("Contrast checking error:", error);
      return null;
    }
  }

  /**
   * Phase 4: Batch process multiple elements with a single screenshot load
   * @param screenshotPath Path to the screenshot image
   * @param elements Array of text elements to check
   * @param wcagLevel WCAG compliance level (affects minimum ratio)
   * @returns Map of elements to their contrast results
   */
  async checkContrastBatch(
    screenshotPath: string,
    elements: Element[],
    wcagLevel: WcagLevel
  ): Promise<Map<Element, ContrastResult | null>> {
    const results = new Map<Element, ContrastResult | null>();

    try {
      // Load screenshot once for all elements
      const image = await this.getOrLoadScreenshot(screenshotPath);
      const screenshotFingerprint = await this.getScreenshotFingerprint(screenshotPath);

      for (const element of elements) {
        try {
          // Check element cache first
          if (this.config.enableElementCache) {
            const elementKey = this.elementCacheKey(element, wcagLevel);
            const cached = this.elementCache.get(elementKey);

            if (cached && cached.screenshotFingerprint === screenshotFingerprint) {
              this.elementHits++;
              results.set(element, cached.result);
              continue;
            }
            this.elementMisses++;
          }

          // Calculate contrast for this element
          const result = await this.checkContrastWithImage(image, element, wcagLevel);
          results.set(element, result);

          // Cache the result
          if (result && this.config.enableElementCache) {
            const elementKey = this.elementCacheKey(element, wcagLevel);
            this.elementCache.set(elementKey, {
              result,
              timestamp: Date.now(),
              screenshotFingerprint,
            });
          }
        } catch (error) {
          console.error(`Error checking contrast for element:`, error);
          results.set(element, null);
        }
      }

      // Cleanup element cache if needed
      if (this.config.enableElementCache) {
        this.cleanupCache(this.elementCache, this.config.maxCacheSize.elements);
      }
    } catch (error) {
      console.error("Batch contrast checking error:", error);
      // Return null for all elements on screenshot load failure
      for (const element of elements) {
        results.set(element, null);
      }
    }

    return results;
  }

  /**
   * Calculate contrast with a pre-loaded Jimp image
   */
  private async checkContrastWithImage(
    image: Jimp,
    element: Element,
    wcagLevel: WcagLevel
  ): Promise<ContrastResult | null> {
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

    // Phase 2: Calculate contrast ratio with caching
    const ratio = this.getCachedContrast(textColor, backgroundColor);

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
  }

  /**
   * Phase 1: Get or load screenshot from cache
   */
  private async getOrLoadScreenshot(path: string): Promise<Jimp> {
    if (!this.config.enableScreenshotCache) {
      return await Jimp.read(path);
    }

    const cached = this.screenshotCache.get(path);
    const now = Date.now();

    // Check if cache is valid (not expired)
    if (cached && (now - cached.timestamp) < this.config.screenshotCacheTTL) {
      // Verify the cached image is still valid by checking file fingerprint
      const currentFingerprint = await this.getScreenshotFingerprint(path);
      if (cached.fingerprint === currentFingerprint) {
        this.screenshotHits++;
        return cached.image;
      }
    }

    // Cache miss or expired - load fresh image
    this.screenshotMisses++;
    const image = await Jimp.read(path);
    const fingerprint = await this.getScreenshotFingerprint(path);

    this.screenshotCache.set(path, {
      image,
      timestamp: now,
      fingerprint,
    });

    // Cleanup screenshot cache if needed
    this.cleanupCache(this.screenshotCache, this.config.maxCacheSize.screenshots);

    return image;
  }

  /**
   * Phase 3: Generate screenshot fingerprint (using mtime for fast checks)
   */
  private async getScreenshotFingerprint(path: string): Promise<string> {
    try {
      const stat = await fs.stat(path);
      return `${path}:${stat.mtime.getTime()}:${stat.size}`;
    } catch (error) {
      // If file doesn't exist or can't be stat'd, use timestamp
      return `${path}:${Date.now()}`;
    }
  }

  /**
   * Phase 3: Generate element cache key
   */
  private elementCacheKey(element: Element, wcagLevel: WcagLevel): string {
    return JSON.stringify({
      text: element.text,
      bounds: element.bounds,
      class: element.class,
      wcagLevel,
    });
  }

  /**
   * Phase 2: Get cached contrast ratio or calculate and cache it
   */
  private getCachedContrast(textColor: RGB, bgColor: RGB): number {
    if (!this.config.enableColorPairCache) {
      return this.calculateContrastRatio(textColor, bgColor);
    }

    const key = this.colorPairKey(textColor, bgColor);
    let ratio = this.contrastCache.get(key);

    if (ratio !== undefined) {
      this.colorPairHits++;
      return ratio;
    }

    this.colorPairMisses++;
    ratio = this.calculateContrastRatio(textColor, bgColor);
    this.contrastCache.set(key, ratio);

    // Cleanup color pair cache if needed
    this.cleanupCache(this.contrastCache, this.config.maxCacheSize.colorPairs);

    return ratio;
  }

  /**
   * Phase 2: Generate cache key for color pair (normalized for symmetry)
   */
  private colorPairKey(c1: RGB, c2: RGB): string {
    // Normalize order (contrast is symmetric, so RGB(0,0,0) <-> RGB(255,255,255)
    // should have the same key regardless of order)
    const sum1 = c1.r + c1.g + c1.b;
    const sum2 = c2.r + c2.g + c2.b;
    const [a, b] = sum1 > sum2 ? [c1, c2] : [c2, c1];
    return `${a.r},${a.g},${a.b}:${b.r},${b.g},${b.b}`;
  }

  /**
   * Clear all caches (useful for testing or memory management)
   */
  clearCaches(): void {
    this.screenshotCache.clear();
    this.contrastCache.clear();
    this.elementCache.clear();
    this.bgColorCache.clear();

    // Reset statistics
    this.screenshotHits = 0;
    this.screenshotMisses = 0;
    this.colorPairHits = 0;
    this.colorPairMisses = 0;
    this.elementHits = 0;
    this.elementMisses = 0;
    this.bgColorHits = 0;
    this.bgColorMisses = 0;
  }

  /**
   * Get cache statistics for debugging and monitoring
   */
  getCacheStats(): CacheStats {
    return {
      screenshots: {
        size: this.screenshotCache.size,
        hits: this.screenshotHits,
        misses: this.screenshotMisses,
      },
      colorPairs: {
        size: this.contrastCache.size,
        hits: this.colorPairHits,
        misses: this.colorPairMisses,
      },
      elements: {
        size: this.elementCache.size,
        hits: this.elementHits,
        misses: this.elementMisses,
      },
      backgrounds: {
        size: this.bgColorCache.size,
        hits: this.bgColorHits,
        misses: this.bgColorMisses,
      },
    };
  }

  /**
   * Generic LRU cache cleanup based on timestamp
   */
  private cleanupCache<K, V extends { timestamp: number }>(
    cache: Map<K, V>,
    maxSize: number
  ): void {
    if (cache.size <= maxSize) {
      return;
    }

    // Convert to array and sort by timestamp (oldest first)
    const entries = Array.from(cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    // Remove oldest entries until we're at maxSize
    const toRemove = cache.size - maxSize;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
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
   * Phase 5: Includes caching for background colors by bounds
   */
  private async sampleBackgroundColor(image: Jimp, bounds: Element["bounds"]): Promise<RGB> {
    // Phase 5: Check background color cache
    if (this.config.enableBackgroundCache) {
      const key = `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
      const cached = this.bgColorCache.get(key);
      if (cached) {
        this.bgColorHits++;
        return cached;
      }
      this.bgColorMisses++;
    }

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

    const color = this.averageColor(colors);

    // Phase 5: Cache the background color
    if (this.config.enableBackgroundCache) {
      const key = `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`;
      this.bgColorCache.set(key, color);

      // Cleanup background cache if needed (simple check without timestamp)
      if (this.bgColorCache.size > this.config.maxCacheSize.backgrounds) {
        // Remove the first (oldest) entry
        const firstKey = this.bgColorCache.keys().next().value;
        if (firstKey) {
          this.bgColorCache.delete(firstKey);
        }
      }
    }

    return color;
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
