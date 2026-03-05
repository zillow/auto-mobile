import path from "path";
import crypto from "crypto";
import { logger } from "../../utils/logger";
import { Image } from "../../utils/image-utils";
import { TakeScreenshot } from "../observe/TakeScreenshot";
import { BootedDevice } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { Timer, defaultTimer } from "../../utils/SystemTimer";
import { getTempDir, TEMP_SUBDIRS } from "../../utils/tempDir";
import { FileSystem, DefaultFileSystem as CanonicalDefaultFileSystem } from "../../utils/filesystem/DefaultFileSystem";

/**
 * Screenshot capture interface for dependency injection.
 */
interface ScreenshotCapture {
  execute(): Promise<{ success: boolean; path?: string; error?: string }>;
}

interface NavigationScreenshotManagerOptions {
  screenshotDir?: string;
  maxCacheSizeBytes?: number;
  targetWidth?: number;
  targetHeight?: number;
  webpQuality?: number;
  fileSystem?: FileSystem;
  timer?: Timer;
}

/**
 * Manages screenshot capture and storage for navigation graph nodes.
 * Captures screenshots on navigation events, resizes them to ~100kb,
 * and maintains an LRU disk cache with 100MB limit.
 */
export class NavigationScreenshotManager {
  private static instance: NavigationScreenshotManager | null = null;

  private readonly screenshotDir: string;
  private readonly maxCacheSizeBytes: number;
  private readonly targetWidth: number;
  private readonly targetHeight: number;
  private readonly webpQuality: number;
  private readonly fs: FileSystem;
  private readonly timer: Timer;

  // Track pending captures to avoid duplicate work
  private pendingCaptures: Map<string, Promise<string | null>> = new Map();

  constructor(options: NavigationScreenshotManagerOptions = {}) {
    this.screenshotDir = options.screenshotDir ?? getTempDir(TEMP_SUBDIRS.NAVIGATION_SCREENSHOTS);
    this.maxCacheSizeBytes = options.maxCacheSizeBytes ?? 100 * 1024 * 1024; // 100MB
    this.targetWidth = options.targetWidth ?? 400;
    this.targetHeight = options.targetHeight ?? 800;
    this.webpQuality = options.webpQuality ?? 65;
    this.fs = options.fileSystem ?? new CanonicalDefaultFileSystem();
    this.timer = options.timer ?? defaultTimer;

    // Ensure directory exists
    this.fs.ensureDir(this.screenshotDir).catch(err => {
      logger.warn(`[NAV_SCREENSHOT] Failed to create screenshot directory: ${err}`);
    });
  }

  /**
   * Get the singleton instance of NavigationScreenshotManager.
   */
  public static getInstance(): NavigationScreenshotManager {
    if (!NavigationScreenshotManager.instance) {
      NavigationScreenshotManager.instance = new NavigationScreenshotManager();
    }
    return NavigationScreenshotManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  public static resetInstance(): void {
    NavigationScreenshotManager.instance = null;
  }

  /**
   * Create an instance for testing with custom options.
   */
  public static createForTesting(options: NavigationScreenshotManagerOptions): NavigationScreenshotManager {
    return new NavigationScreenshotManager(options);
  }

  /**
   * Generate a unique filename for a screenshot.
   * Format: {md5(appId_screenName)}_{timestamp}.webp
   */
  public generateFilename(appId: string, screenName: string): string {
    const hash = crypto
      .createHash("md5")
      .update(`${appId}_${screenName}`)
      .digest("hex")
      .substring(0, 12);
    const timestamp = this.timer.now();
    return `${hash}_${timestamp}.webp`;
  }

  /**
   * Get the hash prefix for a screen (used to find existing screenshots).
   */
  private getScreenHashPrefix(appId: string, screenName: string): string {
    return crypto
      .createHash("md5")
      .update(`${appId}_${screenName}`)
      .digest("hex")
      .substring(0, 12);
  }

  /**
   * Find existing screenshot for a screen (if any).
   */
  public async findExistingScreenshot(appId: string, screenName: string): Promise<string | null> {
    const prefix = this.getScreenHashPrefix(appId, screenName);

    try {
      const files = await this.fs.readdir(this.screenshotDir);
      const matching = files.filter(f => f.startsWith(prefix) && f.endsWith(".webp"));

      if (matching.length === 0) {
        return null;
      }

      // Return the most recent one (highest timestamp)
      matching.sort((a, b) => {
        const tsA = parseInt(a.split("_")[1]?.split(".")[0] ?? "0", 10);
        const tsB = parseInt(b.split("_")[1]?.split(".")[0] ?? "0", 10);
        return tsB - tsA;
      });

      return path.join(this.screenshotDir, matching[0]);
    } catch {
      return null;
    }
  }

  /**
   * Delete old screenshots for a screen (keep only the most recent).
   */
  private async deleteOldScreenshots(appId: string, screenName: string, keepPath: string): Promise<void> {
    const prefix = this.getScreenHashPrefix(appId, screenName);

    try {
      const files = await this.fs.readdir(this.screenshotDir);
      const matching = files.filter(f => f.startsWith(prefix) && f.endsWith(".webp"));

      for (const file of matching) {
        const fullPath = path.join(this.screenshotDir, file);
        if (fullPath !== keepPath) {
          await this.fs.unlink(fullPath).catch(() => {});
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Capture a screenshot, resize it, and store it.
   * Returns the path to the stored screenshot, or null on failure.
   */
  public async captureAndStore(
    device: BootedDevice,
    adb: AdbClient,
    appId: string,
    screenName: string,
    screenshotCapture?: ScreenshotCapture
  ): Promise<string | null> {
    const cacheKey = `${appId}_${screenName}`;

    // Check if there's already a pending capture for this screen
    const pending = this.pendingCaptures.get(cacheKey);
    if (pending) {
      logger.debug(`[NAV_SCREENSHOT] Reusing pending capture for ${screenName}`);
      return pending;
    }

    // Create the capture promise
    const capturePromise = this.doCaptureAndStore(device, adb, appId, screenName, screenshotCapture);

    // Track it
    this.pendingCaptures.set(cacheKey, capturePromise);

    try {
      const result = await capturePromise;
      return result;
    } finally {
      this.pendingCaptures.delete(cacheKey);
    }
  }

  private async doCaptureAndStore(
    device: BootedDevice,
    adb: AdbClient,
    appId: string,
    screenName: string,
    screenshotCapture?: ScreenshotCapture
  ): Promise<string | null> {
    const startTime = this.timer.now();

    try {
      // Ensure directory exists
      await this.fs.ensureDir(this.screenshotDir);

      // 1. Capture screenshot
      const capture = screenshotCapture ?? new TakeScreenshot(device, adb);
      const result = await capture.execute();

      if (!result.success || !result.path) {
        logger.warn(`[NAV_SCREENSHOT] Failed to capture screenshot: ${result.error}`);
        return null;
      }

      // 2. Read and resize the screenshot
      const originalBuffer = await this.fs.readFileBuffer(result.path);

      // Resize to target dimensions (fit inside, maintain aspect ratio)
      const resizedBuffer = await Image.fromBuffer(originalBuffer)
        .resize(this.targetWidth, this.targetHeight, true)
        .webp({ quality: this.webpQuality })
        .toBuffer();

      // 3. Save to navigation screenshots directory
      const filename = this.generateFilename(appId, screenName);
      const finalPath = path.join(this.screenshotDir, filename);
      await this.fs.writeFileBuffer(finalPath, resizedBuffer);

      // 4. Delete old screenshots for this screen
      await this.deleteOldScreenshots(appId, screenName, finalPath);

      // 5. Clean up the original screenshot
      await this.fs.remove(result.path).catch(() => {});

      // 6. Run LRU cleanup in background (fire-and-forget)
      this.cleanupLRU().catch(err => {
        logger.warn(`[NAV_SCREENSHOT] LRU cleanup failed: ${err}`);
      });

      const duration = this.timer.now() - startTime;
      const sizeKb = Math.round(resizedBuffer.length / 1024);
      logger.info(`[NAV_SCREENSHOT] Captured ${screenName}: ${sizeKb}kb in ${duration}ms`);

      return finalPath;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[NAV_SCREENSHOT] Failed to capture/store screenshot: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Clean up old screenshots to stay under the cache size limit (LRU eviction).
   */
  public async cleanupLRU(): Promise<void> {
    try {
      const exists = await this.fs.pathExists(this.screenshotDir);
      if (!exists) {
        return;
      }

      const files = await this.fs.readdir(this.screenshotDir);
      if (files.length === 0) {
        return;
      }

      // Get stats for all files
      const fileStats: Array<{
        path: string;
        size: number;
        mtimeMs: number;
      }> = [];

      for (const file of files) {
        if (!file.endsWith(".webp")) {
          continue;
        }
        const filePath = path.join(this.screenshotDir, file);
        try {
          const stats = await this.fs.stat(filePath);
          fileStats.push({
            path: filePath,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
          });
        } catch {
          // File may have been deleted
        }
      }

      // Calculate total size
      const totalSize = fileStats.reduce((sum, f) => sum + f.size, 0);

      if (totalSize <= this.maxCacheSizeBytes) {
        return;
      }

      // Sort by mtime ascending (oldest first)
      fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

      // Delete oldest files until under limit
      let currentSize = totalSize;
      let deletedCount = 0;

      for (const file of fileStats) {
        if (currentSize <= this.maxCacheSizeBytes) {
          break;
        }

        try {
          await this.fs.unlink(file.path);
          currentSize -= file.size;
          deletedCount++;
        } catch {
          // Ignore deletion errors
        }
      }

      if (deletedCount > 0) {
        logger.info(`[NAV_SCREENSHOT] LRU cleanup: deleted ${deletedCount} files, freed ${Math.round((totalSize - currentSize) / 1024)}kb`);
      }
    } catch (err) {
      logger.warn(`[NAV_SCREENSHOT] LRU cleanup error: ${err}`);
    }
  }

  /**
   * Get the screenshot directory path.
   */
  public getScreenshotDir(): string {
    return this.screenshotDir;
  }

  /**
   * Read a screenshot file and return it as a buffer.
   */
  public async readScreenshot(screenshotPath: string): Promise<Buffer | null> {
    try {
      const exists = await this.fs.pathExists(screenshotPath);
      if (!exists) {
        return null;
      }
      return await this.fs.readFileBuffer(screenshotPath);
    } catch {
      return null;
    }
  }
}
