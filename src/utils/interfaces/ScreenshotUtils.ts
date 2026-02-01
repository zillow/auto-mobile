/**
 * Interface for screenshot utilities
 * Provides image manipulation, comparison, and analysis capabilities
 */
export interface ScreenshotUtils {
  /**
   * Get screenshot from cache or load from disk
   * @param filePath Path to screenshot file
   * @returns Promise with screenshot buffer and perceptual hash
   */
  getCachedScreenshot(filePath: string): Promise<{ buffer: Buffer; hash: string }>;

  /**
   * Generate a perceptual hash from image buffer for fast similarity checking
   * @param buffer Image buffer
   * @returns Promise with perceptual hash string
   */
  generatePerceptualHash(buffer: Buffer): Promise<string>;

  /**
   * Calculate Hamming distance between two perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Hamming distance (lower = more similar)
   */
  calculateHammingDistance(hash1: string, hash2: string): number;

  /**
   * Fast similarity check using perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Similarity percentage (0-100)
   */
  getPerceptualSimilarity(hash1: string, hash2: string): number;

  /**
   * Check if a buffer contains PNG image data
   * @param buffer Buffer to check
   * @returns True if buffer appears to be PNG data
   */
  isPngBuffer(buffer: Buffer): boolean;

  /**
   * Convert image buffer to PNG format using Sharp
   * @param buffer Input image buffer
   * @returns Promise with PNG buffer
   */
  convertToPng(buffer: Buffer): Promise<Buffer>;

  /**
   * Get image dimensions from buffer
   * @param buffer Image buffer
   * @returns Promise with width and height
   */
  getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }>;

  /**
   * Resize image to match dimensions if needed
   * @param buffer Image buffer to resize
   * @param targetWidth Target width
   * @param targetHeight Target height
   * @returns Promise with resized buffer
   */
  resizeImageIfNeeded(
    buffer: Buffer,
    targetWidth: number,
    targetHeight: number
  ): Promise<Buffer>;

  /**
   * Compare two image buffers and return detailed comparison result
   * @param buffer1 First image buffer
   * @param buffer2 Second image buffer
   * @param threshold Pixelmatch threshold (0-1, default 0.1)
   * @param fastMode Enable fast mode for bulk comparisons (lower quality but faster)
   * @returns Promise with comparison result
   */
  compareImages(
    buffer1: Buffer,
    buffer2: Buffer,
    threshold?: number,
    fastMode?: boolean
  ): Promise<{ similarity: number; pixelDifference: number; totalPixels: number; filePath?: string }>;

  /**
   * Get all screenshot files from a directory
   * @param cacheDir Cache directory path
   * @returns Promise with array of screenshot file paths
   */
  getScreenshotFiles(cacheDir: string): Promise<string[]>;

  /**
   * Batch compare multiple screenshots in parallel for better performance
   * @param targetBuffer Target screenshot buffer to compare against
   * @param screenshotPaths Array of screenshot file paths to compare
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param fastMode Enable fast mode for bulk comparisons
   * @returns Promise with array of comparison results
   */
  batchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent?: number,
    fastMode?: boolean
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>>;

  /**
   * Two-stage batch comparison: fast perceptual hash filtering + precise pixel comparison
   * @param targetBuffer Target screenshot buffer to compare against
   * @param screenshotPaths Array of screenshot file paths to compare
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param fastMode Enable fast mode for bulk comparisons
   * @returns Promise with array of comparison results
   */
  optimizedBatchCompareScreenshots(
    targetBuffer: Buffer,
    screenshotPaths: string[],
    tolerancePercent?: number,
    fastMode?: boolean
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>>;

  /**
   * Find similar screenshots in cache directory within tolerance
   * @param targetBuffer Target screenshot buffer to compare against
   * @param cacheDir Cache directory to search
   * @param tolerancePercent Similarity tolerance percentage (e.g., 0.2 for 0.2%)
   * @param maxComparisons Maximum number of files to compare (default 10)
   * @returns Promise with similar screenshot result
   */
  findSimilarScreenshots(
    targetBuffer: Buffer,
    cacheDir: string,
    tolerancePercent?: number,
    maxComparisons?: number
  ): Promise<{ filePath: string; similarity: number; matchFound: boolean }>;

  /**
   * Extract timestamp from screenshot filename
   * Assumes filename format: screenshot_timestamp.extension or hierarchy_timestamp.json
   * @param filePath Path to screenshot file
   * @returns Timestamp portion of filename or null if not extractable
   */
  extractHashFromFilename(filePath: string): string;

  /**
   * Generate a simple hash from image buffer for fallback cache key
   * @param buffer Image buffer
   * @returns MD5 hash string
   */
  generateImageHash(buffer: Buffer): string;
}
