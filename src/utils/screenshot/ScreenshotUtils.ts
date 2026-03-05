import path from "path";
import { NodeCryptoService } from "../crypto";
import { ScreenshotComparator, ScreenshotComparisonResult } from "./ScreenshotComparator";
import { PerceptualHasher } from "./PerceptualHasher";
import { ScreenshotCache } from "./ScreenshotCache";
import { ScreenshotMatcher, SimilarScreenshotResult } from "./ScreenshotMatcher";


/**
 * Facade class that maintains backward compatibility with the original ScreenshotUtils API
 * while delegating to specialized classes for each responsibility.
 */
export class ScreenshotUtils {
  // Re-export the PNG header constant for backward compatibility
  private static readonly PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // ============================================================================
  // Pixel-level Comparison (delegates to ScreenshotComparator)
  // ============================================================================

  /**
   * Check if a buffer contains PNG image data
   * @param buffer Buffer to check
   * @returns True if buffer appears to be PNG data
   */
  static isPngBuffer(buffer: Buffer): boolean {
    return ScreenshotComparator.isPngBuffer(buffer);
  }

  /**
   * Convert image buffer to PNG format using Sharp
   * @param buffer Input image buffer
   * @returns Promise with PNG buffer
   */
  static async convertToPng(buffer: Buffer): Promise<Buffer> {
    return ScreenshotComparator.convertToPng(buffer);
  }

  /**
   * Get image dimensions from buffer
   * @param buffer Image buffer
   * @returns Promise with width and height
   */
  static async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    return ScreenshotComparator.getImageDimensions(buffer);
  }

  /**
   * Resize image to match dimensions if needed
   * @param buffer Image buffer to resize
   * @param targetWidth Target width
   * @param targetHeight Target height
   * @returns Promise with resized buffer
   */
  static async resizeImageIfNeeded(
    buffer: Buffer,
    targetWidth: number,
    targetHeight: number
  ): Promise<Buffer> {
    return ScreenshotComparator.resizeImageIfNeeded(buffer, targetWidth, targetHeight);
  }

  /**
   * Compare two image buffers and return detailed comparison result
   * @param buffer1 First image buffer
   * @param buffer2 Second image buffer
   * @param threshold Pixelmatch threshold (0-1, default 0.1)
   * @param fastMode Enable fast mode for bulk comparisons (lower quality but faster)
   * @returns Promise with comparison result
   */
  static async compareImages(
    buffer1: Buffer,
    buffer2: Buffer,
    threshold: number = 0.1,
    fastMode: boolean = false
  ): Promise<ScreenshotComparisonResult> {
    return ScreenshotComparator.compareImages(buffer1, buffer2, threshold, fastMode);
  }

  // ============================================================================
  // Perceptual Hashing (delegates to PerceptualHasher)
  // ============================================================================

  /**
   * Generate a perceptual hash from image buffer for fast similarity checking
   * @param buffer Image buffer
   * @returns Promise with perceptual hash string
   */
  static async generatePerceptualHash(buffer: Buffer): Promise<string> {
    return PerceptualHasher.generatePerceptualHash(buffer);
  }

  /**
   * Calculate Hamming distance between two perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Hamming distance (lower = more similar)
   */
  static calculateHammingDistance(hash1: string, hash2: string): number {
    return PerceptualHasher.calculateHammingDistance(hash1, hash2);
  }

  /**
   * Fast similarity check using perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Similarity percentage (0-100)
   */
  static getPerceptualSimilarity(hash1: string, hash2: string): number {
    return PerceptualHasher.getPerceptualSimilarity(hash1, hash2);
  }

  // ============================================================================
  // Caching Operations (delegates to ScreenshotCache)
  // ============================================================================

  /**
   * Get screenshot from cache or load from disk
   * @param filePath Path to screenshot file
   * @returns Promise with screenshot buffer and perceptual hash
   */
  static async getCachedScreenshot(filePath: string): Promise<{ buffer: Buffer; hash: string }> {
    return ScreenshotCache.getCachedScreenshot(filePath);
  }

  /**
   * Get all screenshot files from a directory
   * @param cacheDir Cache directory path
   * @returns Promise with array of screenshot file paths
   */
  static async getScreenshotFiles(cacheDir: string): Promise<string[]> {
    return ScreenshotCache.getScreenshotFiles(cacheDir);
  }

  // ============================================================================
  // Screenshot Matching (delegates to ScreenshotMatcher)
  // ============================================================================

  /**
   * Batch compare multiple screenshots in parallel for better performance
   * @param targetBuffer Target screenshot buffer to compare against
   * @param screenshotPaths Array of screenshot file paths to compare
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param fastMode Enable fast mode for bulk comparisons
   * @returns Promise with array of comparison results
   */
  static async batchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent?: number,
    fastMode?: boolean
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    return ScreenshotMatcher.batchCompareScreenshots(targetBuffer, screenshotPaths, tolerancePercent, fastMode);
  }

  /**
   * Two-stage batch comparison: fast perceptual hash filtering + precise pixel comparison
   * @param targetBuffer Target screenshot buffer to compare against
   * @param screenshotPaths Array of screenshot file paths to compare
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param fastMode Enable fast mode for bulk comparisons
   * @returns Promise with array of comparison results
   */
  static async optimizedBatchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent?: number,
    fastMode?: boolean
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    return ScreenshotMatcher.optimizedBatchCompareScreenshots(targetBuffer, screenshotPaths, tolerancePercent, fastMode);
  }

  /**
   * Find similar screenshots in cache directory within tolerance
   * @param targetBuffer Target screenshot buffer to compare against
   * @param cacheDir Cache directory to search
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param maxComparisons Maximum number of files to compare (default 10)
   * @returns Promise with similar screenshot result
   */
  static async findSimilarScreenshots(
    targetBuffer: Buffer,
    cacheDir: string,
    tolerancePercent?: number,
    maxComparisons?: number
  ): Promise<SimilarScreenshotResult> {
    return ScreenshotMatcher.findSimilarScreenshots(targetBuffer, cacheDir, tolerancePercent, maxComparisons);
  }

  // ============================================================================
  // Utility Methods (kept in facade)
  // ============================================================================

  /**
   * Extract timestamp from screenshot filename
   * Assumes filename format: screenshot_timestamp.extension or hierarchy_timestamp.json
   * @param filePath Path to screenshot file
   * @returns Timestamp portion of filename or null if not extractable
   */
  static extractHashFromFilename(filePath: string): string {
    const filename = path.basename(filePath, path.extname(filePath));

    // Handle screenshot_timestamp format
    if (filename.startsWith("screenshot_")) {
      const timestamp = filename.substring("screenshot_".length);
      if (timestamp && /^\d+$/.test(timestamp)) {
        return timestamp;
      }
    }

    // Handle hierarchy_timestamp format
    if (filename.startsWith("hierarchy_")) {
      const timestamp = filename.substring("hierarchy_".length);
      if (timestamp && /^\d+$/.test(timestamp)) {
        return timestamp;
      }
    }

    // Legacy format: try to extract from end
    const parts = filename.split("_");
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        return lastPart;
      }
    }

    throw new Error("Unable to extract timestamp from filename");
  }

  /**
   * Generate a simple hash from image buffer for fallback cache key
   * @param buffer Image buffer
   * @returns MD5 hash string
   */
  static generateImageHash(buffer: Buffer): string {
    return NodeCryptoService.generateCacheKey(buffer);
  }
}
