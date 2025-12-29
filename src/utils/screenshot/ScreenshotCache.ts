import fs from "fs-extra";
import path from "path";
import { logger } from "../logger";
import { readFileAsync, readdirAsync } from "../io";
import { PerceptualHasher } from "./PerceptualHasher";

export class ScreenshotCache {
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
    const cached = ScreenshotCache.screenshotCache.get(normalizedPath);
    if (cached && (now - cached.lastAccess) < ScreenshotCache.CACHE_TTL_MS) {
      cached.lastAccess = now;
      logger.debug(`Screenshot cache hit: ${path.basename(filePath)}`);
      return { buffer: cached.buffer, hash: cached.hash };
    }

    // Load from disk and generate perceptual hash
    logger.debug(`Screenshot cache miss: ${path.basename(filePath)}`);
    const buffer = await readFileAsync(filePath);
    const hash = await PerceptualHasher.generatePerceptualHash(buffer);

    // Add to cache with LRU eviction
    ScreenshotCache.addToCache(normalizedPath, buffer, hash, now);

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
    if (ScreenshotCache.screenshotCache.size >= ScreenshotCache.MAX_CACHE_ENTRIES) {
      const entries = Array.from(ScreenshotCache.screenshotCache.entries());
      entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

      // Remove oldest 10 entries
      for (let i = 0; i < 10 && i < entries.length; i++) {
        ScreenshotCache.screenshotCache.delete(entries[i][0]);
      }

      logger.debug(`Evicted ${Math.min(10, entries.length)} old screenshot cache entries`);
    }

    ScreenshotCache.screenshotCache.set(filePath, {
      buffer,
      hash,
      lastAccess: timestamp
    });
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
}
