import fs from "fs-extra";
import path from "path";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { logger } from "./logger";
import { readFileAsync, readdirAsync } from "./io";
import { DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT } from "./constants";
import { CryptoUtils } from "./crypto";

export interface ScreenshotComparisonResult {
  similarity: number; // 0-100 percentage
  pixelDifference: number;
  totalPixels: number;
  filePath?: string;
}

export interface SimilarScreenshotResult {
  filePath: string;
  similarity: number;
  matchFound: boolean;
}

export class ScreenshotUtils {
  private static readonly PNG_HEADER = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // In-memory screenshot cache with LRU eviction
  private static screenshotCache = new Map<string, { buffer: Buffer; hash: string; lastAccess: number }>();
  private static readonly MAX_CACHE_ENTRIES = 50;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Get screenshot from cache or load from disk
   * @param filePath Path to screenshot file
   * @returns Promise with screenshot buffer and perceptual hash
   */
  static async getCachedScreenshot(filePath: string): Promise<{ buffer: Buffer; hash: string }> {
    const normalizedPath = path.normalize(filePath);
    const now = Date.now();

    // Check memory cache first
    const cached = ScreenshotUtils.screenshotCache.get(normalizedPath);
    if (cached && (now - cached.lastAccess) < ScreenshotUtils.CACHE_TTL_MS) {
      cached.lastAccess = now;
      logger.debug(`Screenshot cache hit: ${path.basename(filePath)}`);
      return { buffer: cached.buffer, hash: cached.hash };
    }

    // Load from disk and generate perceptual hash
    logger.debug(`Screenshot cache miss: ${path.basename(filePath)}`);
    const buffer = await readFileAsync(filePath);
    const hash = await ScreenshotUtils.generatePerceptualHash(buffer);

    // Add to cache with LRU eviction
    ScreenshotUtils.addToCache(normalizedPath, buffer, hash, now);

    return { buffer, hash };
  }

  /**
   * Add screenshot to cache with LRU eviction
   * @param filePath File path as cache key
   * @param buffer Screenshot buffer
   * @param hash Perceptual hash
   * @param timestamp Current timestamp
   */
  private static addToCache(filePath: string, buffer: Buffer, hash: string, timestamp: number): void {
    // Remove oldest entries if cache is full
    if (ScreenshotUtils.screenshotCache.size >= ScreenshotUtils.MAX_CACHE_ENTRIES) {
      const entries = Array.from(ScreenshotUtils.screenshotCache.entries());
      entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

      // Remove oldest 10 entries
      for (let i = 0; i < 10 && i < entries.length; i++) {
        ScreenshotUtils.screenshotCache.delete(entries[i][0]);
      }

      logger.debug(`Evicted ${Math.min(10, entries.length)} old screenshot cache entries`);
    }

    ScreenshotUtils.screenshotCache.set(filePath, {
      buffer,
      hash,
      lastAccess: timestamp
    });
  }

  /**
   * Generate a perceptual hash from image buffer for fast similarity checking
   * @param buffer Image buffer
   * @returns Promise with perceptual hash string
   */
  static async generatePerceptualHash(buffer: Buffer): Promise<string> {
    try {
      // Resize to small standard size for consistent hashing
      const hashBuffer = await sharp(buffer)
        .resize(8, 8, { fit: "fill", kernel: "nearest" })
        .greyscale()
        .raw()
        .toBuffer();

      // Convert to binary hash using average pixel value
      const totalPixels = 64; // 8x8
      const averageValue = hashBuffer.reduce((sum, pixel) => sum + pixel, 0) / totalPixels;

      let hash = "";
      for (let i = 0; i < totalPixels; i++) {
        hash += hashBuffer[i] > averageValue ? "1" : "0";
      }

      return hash;
    } catch (error) {
      logger.warn(`Failed to generate perceptual hash: ${(error as Error).message}`);
      return "";
    }
  }

  /**
   * Calculate Hamming distance between two perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Hamming distance (lower = more similar)
   */
  static calculateHammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) {
      return Math.max(hash1.length, hash2.length); // Maximum possible distance
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  /**
   * Fast similarity check using perceptual hashes
   * @param hash1 First perceptual hash
   * @param hash2 Second perceptual hash
   * @returns Similarity percentage (0-100)
   */
  static getPerceptualSimilarity(hash1: string, hash2: string): number {
    const distance = ScreenshotUtils.calculateHammingDistance(hash1, hash2);
    const maxDistance = Math.max(hash1.length, hash2.length);
    return ((maxDistance - distance) / maxDistance) * 100;
  }

  /**
   * Check if a buffer contains PNG image data
   * @param buffer Buffer to check
   * @returns True if buffer appears to be PNG data
   */
  static isPngBuffer(buffer: Buffer): boolean {
    if (buffer.length < 8) {
      return false;
    }
    return buffer.subarray(0, 8).equals(ScreenshotUtils.PNG_HEADER);
  }

  /**
   * Convert image buffer to PNG format using Sharp
   * @param buffer Input image buffer
   * @returns Promise with PNG buffer
   */
  static async convertToPng(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer).png().toBuffer();
    } catch (error) {
      throw new Error(`Failed to convert image to PNG: ${(error as Error).message}`);
    }
  }

  /**
   * Get image dimensions from buffer
   * @param buffer Image buffer
   * @returns Promise with width and height
   */
  static async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (error) {
      throw new Error(`Failed to get image dimensions: ${(error as Error).message}`);
    }
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
    const { width, height } = await ScreenshotUtils.getImageDimensions(buffer);

    if (width === targetWidth && height === targetHeight) {
      return buffer;
    }

    logger.debug(`Resizing image from ${width}x${height} to ${targetWidth}x${targetHeight}`);

    try {
      return await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: "fill",
          kernel: "nearest" // Fast resize for comparison purposes
        })
        .png()
        .toBuffer();
    } catch (error) {
      throw new Error(`Failed to resize image: ${(error as Error).message}`);
    }
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
    const comparisonStart = Date.now();
    logger.debug(`Starting image comparison with threshold ${threshold}${fastMode ? " (fast mode)" : ""}`);

    try {
      // Ensure both images are PNG format
      let png1Buffer = ScreenshotUtils.isPngBuffer(buffer1) ? buffer1 : await ScreenshotUtils.convertToPng(buffer1);
      let png2Buffer = ScreenshotUtils.isPngBuffer(buffer2) ? buffer2 : await ScreenshotUtils.convertToPng(buffer2);

      // Get dimensions
      const dims1 = await ScreenshotUtils.getImageDimensions(png1Buffer);
      const dims2 = await ScreenshotUtils.getImageDimensions(png2Buffer);

      logger.debug(`Image 1 dimensions: ${dims1.width}x${dims1.height}`);
      logger.debug(`Image 2 dimensions: ${dims2.width}x${dims2.height}`);

      // In fast mode, use smaller target dimensions for quicker comparison
      const targetWidth = fastMode
        ? Math.min(dims1.width, dims2.width, 400) // Cap at 400px width for fast mode
        : Math.min(dims1.width, dims2.width);
      const targetHeight = fastMode
        ? Math.min(dims1.height, dims2.height, 600) // Cap at 600px height for fast mode
        : Math.min(dims1.height, dims2.height);

      // Resize images to match if needed (use the smaller dimensions for performance)
      if (dims1.width !== targetWidth || dims1.height !== targetHeight) {
        png1Buffer = await ScreenshotUtils.resizeImageIfNeeded(png1Buffer, targetWidth, targetHeight);
      }
      if (dims2.width !== targetWidth || dims2.height !== targetHeight) {
        png2Buffer = await ScreenshotUtils.resizeImageIfNeeded(png2Buffer, targetWidth, targetHeight);
      }

      // Parse PNG data
      const img1 = PNG.sync.read(png1Buffer);
      const img2 = PNG.sync.read(png2Buffer);

      const { width, height } = img1;
      const totalPixels = width * height;

      logger.debug(`Comparing images: ${width}x${height} (${totalPixels} pixels)`);

      // Perform pixel comparison with adjusted threshold for fast mode
      const adjustedThreshold = fastMode ? Math.min(threshold * 1.5, 0.2) : threshold;
      const pixelDifference = pixelmatch(
        img1.data,
        img2.data,
        undefined, // No diff output needed
        width,
        height,
        {
          threshold: adjustedThreshold,
          includeAA: false // Ignore anti-aliased pixels
        }
      );

      const similarity = ((totalPixels - pixelDifference) / totalPixels) * 100;
      const comparisonTime = Date.now() - comparisonStart;

      logger.debug(`Image comparison completed in ${comparisonTime}ms: ${pixelDifference}/${totalPixels} different pixels (${similarity.toFixed(2)}% similar)`);

      return {
        similarity,
        pixelDifference,
        totalPixels
      };
    } catch (error) {
      const comparisonTime = Date.now() - comparisonStart;
      logger.warn(`Image comparison failed after ${comparisonTime}ms: ${(error as Error).message}`);

      return {
        similarity: 0,
        pixelDifference: -1,
        totalPixels: 0
      };
    }
  }

  /**
   * Get all screenshot files from a directory
   * @param cacheDir Cache directory path
   * @returns Promise with array of screenshot file paths
   */
  static async getScreenshotFiles(cacheDir: string): Promise<string[]> {
    try {
      if (!await fs.pathExists(cacheDir)) {
        logger.debug(`Cache directory does not exist: ${cacheDir}`);
        return [];
      }

      const files = await readdirAsync(cacheDir);
      const screenshotFiles = files
        .filter(file => file.endsWith(".png") || file.endsWith(".webp"))
        .map(file => path.join(cacheDir, file));

      logger.debug(`Found ${screenshotFiles.length} screenshot files in ${cacheDir}`);
      return screenshotFiles;
    } catch (error) {
      logger.warn(`Failed to get screenshot files from ${cacheDir}: ${(error as Error).message}`);
      return [];
    }
  }

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
    tolerancePercent: number = DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
    fastMode: boolean = true
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    const batchStart = Date.now();
    const minSimilarity = 100 - tolerancePercent;

    logger.info(`Starting batch comparison of ${screenshotPaths.length} screenshots (fast mode: ${fastMode})`);

    try {
      const comparisonPromises = screenshotPaths.map(async filePath => {
        try {
          const cachedBuffer = await readFileAsync(filePath);
          const comparisonResult = await ScreenshotUtils.compareImages(targetBuffer, cachedBuffer, 0.1, fastMode);

          return {
            filePath,
            similarity: comparisonResult.similarity,
            matchFound: comparisonResult.similarity >= minSimilarity
          };
        } catch (error) {
          logger.debug(`Failed to compare ${path.basename(filePath)}: ${(error as Error).message}`);
          return {
            filePath,
            similarity: 0,
            matchFound: false
          };
        }
      });

      const results = await Promise.all(comparisonPromises);
      const batchTime = Date.now() - batchStart;

      const matches = results.filter(r => r.matchFound);
      logger.info(`Batch comparison completed in ${batchTime}ms: ${matches.length}/${results.length} matches found`);

      return results;
    } catch (error) {
      const batchTime = Date.now() - batchStart;
      logger.warn(`Batch comparison failed after ${batchTime}ms: ${(error as Error).message}`);
      return [];
    }
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
    tolerancePercent: number = DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
    fastMode: boolean = true
  ): Promise<Array<{ filePath: string; similarity: number; matchFound: boolean }>> {
    const batchStart = Date.now();
    const minSimilarity = 100 - tolerancePercent;

    logger.info(`Starting optimized two-stage batch comparison of ${screenshotPaths.length} screenshots`);

    try {
      // Stage 1: Fast perceptual hash filtering
      const targetPerceptualHash = await ScreenshotUtils.generatePerceptualHash(targetBuffer);
      logger.debug(`Target perceptual hash: ${targetPerceptualHash}`);

      // Load all screenshots and their perceptual hashes in parallel
      const stage1Results = await Promise.all(
        screenshotPaths.map(async filePath => {
          try {
            const { buffer, hash } = await ScreenshotUtils.getCachedScreenshot(filePath);
            const perceptualSimilarity = ScreenshotUtils.getPerceptualSimilarity(targetPerceptualHash, hash);

            return {
              filePath,
              buffer,
              perceptualSimilarity,
              isCandidate: perceptualSimilarity >= (minSimilarity - 10) // 10% buffer for perceptual hash
            };
          } catch (error) {
            logger.debug(`Failed to process ${path.basename(filePath)}: ${(error as Error).message}`);
            return null;
          }
        })
      );

      const candidates = stage1Results
        .filter((result): result is NonNullable<typeof result> => result !== null && result.isCandidate);

      const stage1Time = Date.now() - batchStart;
      logger.info(`Stage 1 (perceptual hash) completed in ${stage1Time}ms: ${candidates.length}/${screenshotPaths.length} candidates selected`);

      if (candidates.length === 0) {
        return screenshotPaths.map(filePath => ({
          filePath,
          similarity: 0,
          matchFound: false
        }));
      }

      // Stage 2: Precise pixel comparison for candidates only
      const stage2Start = Date.now();
      const preciseResults = await Promise.all(
        candidates.map(async candidate => {
          try {
            const comparisonResult = await ScreenshotUtils.compareImages(
              targetBuffer,
              candidate.buffer,
              0.1,
              fastMode
            );

            return {
              filePath: candidate.filePath,
              similarity: comparisonResult.similarity,
              matchFound: comparisonResult.similarity >= minSimilarity
            };
          } catch (error) {
            logger.debug(`Stage 2 failed for ${path.basename(candidate.filePath)}: ${(error as Error).message}`);
            return {
              filePath: candidate.filePath,
              similarity: 0,
              matchFound: false
            };
          }
        })
      );

      // Fill in results for non-candidates
      const finalResults = screenshotPaths.map(filePath => {
        const preciseResult = preciseResults.find(r => r.filePath === filePath);
        if (preciseResult) {
          return preciseResult;
        }

        // For non-candidates, use perceptual similarity as approximate result
        const stage1Result = stage1Results.find(r => r?.filePath === filePath);
        return {
          filePath,
          similarity: stage1Result?.perceptualSimilarity || 0,
          matchFound: false
        };
      });

      const stage2Time = Date.now() - stage2Start;
      const totalTime = Date.now() - batchStart;
      const matches = finalResults.filter(r => r.matchFound);

      logger.info(`Stage 2 (pixel comparison) completed in ${stage2Time}ms for ${candidates.length} candidates`);
      logger.info(`Optimized batch comparison completed in ${totalTime}ms: ${matches.length}/${screenshotPaths.length} matches found`);

      return finalResults;
    } catch (error) {
      const totalTime = Date.now() - batchStart;
      logger.warn(`Optimized batch comparison failed after ${totalTime}ms: ${(error as Error).message}`);
      return [];
    }
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
    tolerancePercent: number = DEFAULT_FUZZY_MATCH_TOLERANCE_PERCENT,
    maxComparisons: number = 10
  ): Promise<SimilarScreenshotResult> {
    const searchStart = Date.now();
    const minSimilarity = 100 - tolerancePercent;

    logger.info(`Searching for screenshots with ≥${minSimilarity}% similarity (tolerance: ${tolerancePercent}%) in ${cacheDir}`);

    try {
      const screenshotFiles = await ScreenshotUtils.getScreenshotFiles(cacheDir);

      if (screenshotFiles.length === 0) {
        logger.info("No screenshot files found in cache directory");
        return {
          filePath: "",
          similarity: 0,
          matchFound: false
        };
      }

      // Sort files by modification time (newest first) to check recent screenshots first
      const filesWithStats = await Promise.all(
        screenshotFiles.map(async filePath => {
          const stats = await fs.stat(filePath);
          return { filePath, mtime: stats.mtime.getTime() };
        })
      );

      filesWithStats.sort((a, b) => b.mtime - a.mtime);
      const filesToCheck = filesWithStats.slice(0, maxComparisons);

      logger.info(`Comparing against ${filesToCheck.length} most recent screenshots (max: ${maxComparisons})`);

      let bestMatch: SimilarScreenshotResult = {
        filePath: "",
        similarity: 0,
        matchFound: false
      };

      for (const { filePath } of filesToCheck) {
        try {
          logger.debug(`Comparing against: ${path.basename(filePath)}`);

          const cachedBuffer = await readFileAsync(filePath);
          const comparisonResult = await ScreenshotUtils.compareImages(targetBuffer, cachedBuffer, 0.1, true);

          logger.info(`${path.basename(filePath)}: ${comparisonResult.similarity.toFixed(2)}% similarity (${comparisonResult.pixelDifference}/${comparisonResult.totalPixels} different pixels)`);

          if (comparisonResult.similarity > bestMatch.similarity) {
            bestMatch = {
              filePath,
              similarity: comparisonResult.similarity,
              matchFound: comparisonResult.similarity >= minSimilarity
            };
          }

          // If we found a match within tolerance, we can stop searching
          if (comparisonResult.similarity >= minSimilarity) {
            logger.info(`✓ Found matching screenshot: ${path.basename(filePath)} (${comparisonResult.similarity.toFixed(2)}% similarity)`);
            break;
          }
        } catch (error) {
          logger.warn(`Failed to compare against ${path.basename(filePath)}: ${(error as Error).message}`);
        }
      }

      const searchTime = Date.now() - searchStart;

      if (bestMatch.matchFound) {
        logger.info(`Screenshot search completed in ${searchTime}ms: Found match with ${bestMatch.similarity.toFixed(2)}% similarity`);
      } else {
        logger.info(`Screenshot search completed in ${searchTime}ms: No match found (best: ${bestMatch.similarity.toFixed(2)}%)`);
      }

      return bestMatch;
    } catch (error) {
      const searchTime = Date.now() - searchStart;
      logger.warn(`Screenshot search failed after ${searchTime}ms: ${(error as Error).message}`);

      return {
        filePath: "",
        similarity: 0,
        matchFound: false
      };
    }
  }

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
    return CryptoUtils.generateCacheKey(buffer);
  }
}
