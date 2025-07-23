import fs from "fs-extra";
import path from "path";
import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { Window } from "./Window";
import { logger } from "../../utils/logger";
import { ScreenshotResult } from "../../models/ScreenshotResult";
import { Image } from "../../utils/image-utils";
import { BootedDevice } from "../../models";

export interface ScreenshotOptions {
  format?: "png" | "webp";
  quality?: number;
  lossless?: boolean;
}

export class TakeScreenshot {
  private readonly device: BootedDevice;
  private adb: AdbUtils;
  private window: Window;
  private static cacheDir: string = path.join("/tmp/auto-mobile", "screenshots");
  private static readonly MAX_CACHE_SIZE_BYTES = 128 * 1024 * 1024; // 128MB

  /**
   * Create a TakeScreenshot instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(
    device: BootedDevice,
    adb: AdbUtils | null = null,
  ) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.window = new Window(device, this.adb);

    // Ensure cache directory exists
    if (!fs.existsSync(TakeScreenshot.cacheDir)) {
      fs.mkdirSync(TakeScreenshot.cacheDir, { recursive: true });
    }

    // Manage cache size
    this.cleanupCache();
  }

  /**
   * Clean up the cache directory if it exceeds the maximum size
   */
  private async cleanupCache(): Promise<void> {
    try {
      if (!fs.existsSync(TakeScreenshot.cacheDir)) {return;}

      // Get all files in cache with their stats
      const files = await fs.readdir(TakeScreenshot.cacheDir);
      const fileStats = await Promise.all(
        files.map(async file => {
          const filePath = path.join(TakeScreenshot.cacheDir, file);
          const stats = await fs.stat(filePath);
          return { path: filePath, stats, mtime: stats.mtime.getTime() };
        })
      );

      // Calculate total size
      const totalSize = fileStats.reduce((sum, file) => sum + file.stats.size, 0);

      // If we're over the limit, remove oldest files until under limit
      if (totalSize > TakeScreenshot.MAX_CACHE_SIZE_BYTES) {
        // Sort by modification time (oldest first)
        fileStats.sort((a, b) => a.mtime - b.mtime);

        let currentSize = totalSize;
        for (const file of fileStats) {
          if (currentSize <= TakeScreenshot.MAX_CACHE_SIZE_BYTES) {break;}

          await fs.unlink(file.path);
          currentSize -= file.stats.size;
          logger.debug(`Removed cached screenshot: ${file.path}`);
        }
      }
    } catch (err) {
      logger.warn("Failed to cleanup screenshot cache:", err);
    }
  }

  /**
   * Generate screenshot file path
   * @param timestamp - Timestamp for unique filename
   * @param options - Screenshot options
   * @returns Full file path for screenshot
   */
  generateScreenshotPath(timestamp: number, options: ScreenshotOptions): string {
    const fileExtension = options.format === "webp" ? "webp" : "png";
    return path.join(TakeScreenshot.cacheDir, `screenshot_${timestamp}.${fileExtension}`);
  }

  /**
   * Get activity hash for screenshot naming
   * @param activityHash - Optional provided hash
   * @returns Promise with activity hash
   */
  public async getActivityHash(activityHash: string | null): Promise<string> {
    return !activityHash ? await this.window.getActiveHash() : activityHash;
  }

  /**
   * Take a screenshot of the device
   * @param options - Optional screenshot format options
   * @returns Promise with screenshot result including success status and path if successful
   */
  async execute(
    options: ScreenshotOptions = { format: "png" }
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();
    logger.info(`[SCREENSHOT] *** Starting screenshot capture with startTime: ${startTime}, format: ${options.format} ***`);

    try {
      // Generate unique filename with startTime
      const finalPath = this.generateScreenshotPath(startTime, options);

      // Capture screenshot with fallback
      const captureResult = await this.captureScreenshot(finalPath, options);
      const totalDuration = Date.now() - startTime;

      logger.info(`[SCREENSHOT] *** Screenshot capture completed: success=${captureResult.success}, total execute time: ${totalDuration}ms ***`);
      return captureResult;
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`[SCREENSHOT] Execute failed after ${totalDuration}ms: ${errorMessage}`);
      return {
        success: false,
        error: `Failed to take screenshot: ${errorMessage}`
      };
    }
  }

  /**
   * Capture screenshot using screencap method with fallback
   * @param finalPath - Path to save the screenshot
   * @param options - Screenshot format options
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureScreenshot(
    finalPath: string,
    options: ScreenshotOptions = { format: "png" }
  ): Promise<ScreenshotResult> {

    logger.info(`[SCREENSHOT] Starting screenshot capture with format: ${options.format}`);

    switch (this.device.platform) {
      case "android":
        return await this.captureAndroidScreenshot(finalPath, options);
      case "ios":
        return await this.captureiOSScreenshot(finalPath);
      default:
        throw new Error(`Unsupported platform: ${this.device.platform}`);
    }
  }

  /**
   * Capture screenshot using screencap method with fallback
   * @param finalPath - Path to save the screenshot
   * @param options - Screenshot format options
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureAndroidScreenshot(
    finalPath: string,
    options: ScreenshotOptions = { format: "png" }
  ): Promise<ScreenshotResult> {

    logger.info(`[SCREENSHOT] Starting screenshot capture with format: ${options.format}`);

    // Try base64 approach first (faster for smaller screenshots)
    try {
      return await this.captureScreenshotBase64(finalPath, options);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("maxBuffer") || errorMessage.includes("stdout") || errorMessage.includes("buffer")) {
        logger.info(`[SCREENSHOT] Base64 approach failed (${errorMessage}), falling back to file pull approach`);
        return await this.captureScreenshotFilePull(finalPath, options);
      } else {
        // For other errors, don't fallback
        throw err;
      }
    }
  }

  /**
   * Capture screenshot using screencap method with fallback
   * @param finalPath - Path to save the screenshot
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureiOSScreenshot(
    finalPath: string,
  ): Promise<ScreenshotResult> {
    return {
      success: true,
      path: finalPath,
    } as ScreenshotResult;
  }

  /**
   * Capture screenshot using base64 encoding (faster but may hit buffer limits)
   * @param finalPath - Path to save the screenshot
   * @param options - Screenshot format options
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureScreenshotBase64(
    finalPath: string,
    options: ScreenshotOptions = { format: "png" }
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();
    logger.info(`[SCREENSHOT] Trying base64 approach`);

    const cmdStartTime = Date.now();
    const tempFile = "/sdcard/screenshot.png";

    // Single command: screencap -> base64 encode -> remove temp file
    const command = `shell "screencap -p ${tempFile} && base64 ${tempFile} && rm ${tempFile}"`;
    // Use larger maxBuffer (50MB) to handle high-resolution screenshots
    const maxBuffer = 50 * 1024 * 1024; // 50MB
    const result = await this.adb.executeCommand(command, undefined, maxBuffer);
    const cmdDuration = Date.now() - cmdStartTime;
    logger.info(`[SCREENSHOT] Combined ADB command took ${cmdDuration}ms`);

    if (!result.stdout || result.stdout.trim().length === 0) {
      throw new Error("No base64 data received from screencap command");
    }

    // Decode base64 data to buffer
    const decodeStartTime = Date.now();
    const cleanedOutput = result.stdout.replace(/[\r\n]/g, "");
    const imageBuffer = Buffer.from(cleanedOutput, "base64");
    const decodeDuration = Date.now() - decodeStartTime;
    logger.info(`[SCREENSHOT] Base64 decode took ${decodeDuration}ms, buffer size: ${imageBuffer.length} bytes`);

    // Handle format conversion and save
    if (options.format !== "webp") {
      // For PNG, save directly
      const saveStartTime = Date.now();
      await fs.writeFile(finalPath, imageBuffer);
      const saveDuration = Date.now() - saveStartTime;
      logger.info(`[SCREENSHOT] PNG file save took ${saveDuration}ms`);
    } else {
      // Convert to WebP
      const convertStartTime = Date.now();
      const image = Image.fromBuffer(imageBuffer);
      const transformer = image.webp({
        quality: options.quality || 75,
        lossless: options.lossless
      });
      const convertedImage = await transformer.toBuffer();
      const convertDuration = Date.now() - convertStartTime;
      logger.info(`[SCREENSHOT] WebP conversion took ${convertDuration}ms`);

      // Save the webp file
      const saveStartTime = Date.now();
      await fs.writeFile(finalPath, convertedImage);
      const saveDuration = Date.now() - saveStartTime;
      logger.info(`[SCREENSHOT] WebP file save took ${saveDuration}ms`);
    }

    const totalDuration = Date.now() - startTime;
    logger.info(`[SCREENSHOT] Base64 screenshot capture completed in ${totalDuration}ms`);

    return {
      success: true,
      path: finalPath
    };
  }

  /**
   * Capture screenshot using file pull approach (more reliable for large screenshots)
   * @param finalPath - Path to save the screenshot
   * @param options - Screenshot format options
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureScreenshotFilePull(
    finalPath: string,
    options: ScreenshotOptions = { format: "png" }
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();
    logger.info(`[SCREENSHOT] Using file pull approach`);

    try {
      // Use file pull approach instead of base64 to avoid stdout buffer issues
      const cmdStartTime = Date.now();
      const tempFile = "/sdcard/screenshot.png";
      const tempLocalFile = `${finalPath}.temp`;

      // Step 1: Take screenshot on device
      const screencapResult = await this.adb.executeCommand(`shell screencap -p ${tempFile}`);
      if (screencapResult.stderr && screencapResult.stderr.includes("error")) {
        throw new Error(`Screencap failed: ${screencapResult.stderr}`);
      }

      // Step 2: Pull file from device to local filesystem
      const pullResult = await this.adb.executeCommand(`pull ${tempFile} ${tempLocalFile}`);
      if (pullResult.stderr && pullResult.stderr.includes("error")) {
        throw new Error(`Failed to pull screenshot: ${pullResult.stderr}`);
      }

      // Step 3: Clean up temp file on device
      await this.adb.executeCommand(`shell rm ${tempFile}`);

      const cmdDuration = Date.now() - cmdStartTime;
      logger.info(`[SCREENSHOT] Screenshot capture and pull took ${cmdDuration}ms`);

      // Step 4: Read the pulled file into buffer
      const readStartTime = Date.now();
      const imageBuffer = await fs.readFile(tempLocalFile);
      const readDuration = Date.now() - readStartTime;
      logger.info(`[SCREENSHOT] File read took ${readDuration}ms, buffer size: ${imageBuffer.length} bytes`);

      // Step 5: Handle format conversion and save to final path
      if (options.format !== "webp") {
        // For PNG, move the temp file to final path
        const saveStartTime = Date.now();
        await fs.move(tempLocalFile, finalPath);
        const saveDuration = Date.now() - saveStartTime;
        logger.info(`[SCREENSHOT] PNG file move took ${saveDuration}ms`);
      } else {
        // Convert to WebP
        const convertStartTime = Date.now();
        const image = Image.fromBuffer(imageBuffer);
        const transformer = image.webp({
          quality: options.quality || 75,
          lossless: options.lossless
        });
        const convertedImage = await transformer.toBuffer();
        const convertDuration = Date.now() - convertStartTime;
        logger.info(`[SCREENSHOT] WebP conversion took ${convertDuration}ms`);

        // Save the webp file and remove temp file
        const saveStartTime = Date.now();
        await fs.writeFile(finalPath, convertedImage);
        await fs.remove(tempLocalFile);
        const saveDuration = Date.now() - saveStartTime;
        logger.info(`[SCREENSHOT] WebP file save took ${saveDuration}ms`);
      }

      const totalDuration = Date.now() - startTime;
      logger.info(`[SCREENSHOT] File pull screenshot capture completed in ${totalDuration}ms`);

      return {
        success: true,
        path: finalPath
      };
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(`[SCREENSHOT] File pull screenshot capture failed after ${totalDuration}ms: ${errorMessage}`);

      // Clean up any temp files
      try {
        const tempLocalFile = `${finalPath}.temp`;
        if (await fs.pathExists(tempLocalFile)) {
          await fs.remove(tempLocalFile);
        }
      } catch (cleanupErr) {
        logger.debug(`Failed to cleanup temp file: ${cleanupErr}`);
      }

      throw err;
    }
  }
}
