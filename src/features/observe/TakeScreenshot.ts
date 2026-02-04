import fs from "fs-extra";
import path from "path";
import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { Window } from "./Window";
import { logger } from "../../utils/logger";
import { ScreenshotResult } from "../../models/ScreenshotResult";
import { Image } from "../../utils/image-utils";
import { BootedDevice } from "../../models";
import { ScreenshotJobHandle, ScreenshotJobOptions, ScreenshotJobTracker } from "../../utils/ScreenshotJobTracker";
import { OPERATION_CANCELLED_MESSAGE } from "../../utils/constants";
import { ensureSecureTempDirSync, TEMP_SUBDIRS } from "../../utils/tempDir";
import type { ScreenshotService } from "./interfaces/ScreenshotService";
import { XCTestServiceClient } from "./ios/XCTestServiceClient";
import { getDeviceDataStreamServer } from "../../daemon/deviceDataStreamSocketServer";

/** Secure file mode: owner read/write only */
const SECURE_FILE_MODE = 0o600;

/**
 * Write buffer to file atomically with secure permissions.
 * Uses "wx" flag to fail if file exists (prevents TOCTOU race) and
 * mode 0o600 for owner-only read/write access.
 */
async function writeFileSecure(filePath: string, data: Buffer): Promise<void> {
  const handle = await fs.promises.open(filePath, "wx", SECURE_FILE_MODE);
  try {
    await handle.write(data);
  } finally {
    await handle.close();
  }
}

export interface ScreenshotOptions {
  format?: "png" | "webp";
  quality?: number;
  lossless?: boolean;
}

export class TakeScreenshot implements ScreenshotService {
  private readonly device: BootedDevice;
  private adb: AdbExecutor;
  private adbFactory: AdbClientFactory;
  private window: Window;
  private static cacheDir: string | null = null;
  private static readonly MAX_CACHE_SIZE_BYTES = 128 * 1024 * 1024; // 128MB

  /**
   * Get the cache directory, creating it with secure permissions if needed.
   * Uses lazy initialization to ensure the directory is created securely.
   */
  private static getCacheDir(): string {
    if (!TakeScreenshot.cacheDir) {
      TakeScreenshot.cacheDir = ensureSecureTempDirSync(TEMP_SUBDIRS.SCREENSHOTS);
    }
    return TakeScreenshot.cacheDir;
  }

  /**
   * Create a TakeScreenshot instance
   * @param device - Optional device
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   */
  constructor(
    device: BootedDevice,
    adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory,
  ) {
    this.device = device;
    // Detect if the argument is a factory (has create method) or an executor
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      this.adbFactory = adbFactoryOrExecutor as AdbClientFactory;
      this.adb = this.adbFactory.create(device);
    } else if (adbFactoryOrExecutor) {
      // Legacy path: wrap the executor in a factory for downstream dependencies
      const executor = adbFactoryOrExecutor as AdbExecutor;
      this.adb = executor;
      this.adbFactory = { create: () => executor };
    } else {
      this.adbFactory = defaultAdbClientFactory;
      this.adb = this.adbFactory.create(device);
    }
    this.window = new Window(device, this.adbFactory);

    // Manage cache size (getCacheDir ensures directory exists with secure permissions)
    this.cleanupCache();
  }

  /**
   * Clean up the cache directory if it exceeds the maximum size
   */
  private async cleanupCache(): Promise<void> {
    try {
      const cacheDir = TakeScreenshot.getCacheDir();

      // Get all files in cache with their stats
      const files = await fs.readdir(cacheDir);
      const fileStats = await Promise.all(
        files.map(async file => {
          const filePath = path.join(cacheDir, file);
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
    return path.join(TakeScreenshot.getCacheDir(), `screenshot_${timestamp}.${fileExtension}`);
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
    options: ScreenshotOptions = { format: "png" },
    signal?: AbortSignal
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();
    logger.info(`[SCREENSHOT] *** Starting screenshot capture with startTime: ${startTime}, format: ${options.format} ***`);

    try {
      if (signal?.aborted) {
        return { success: false, error: OPERATION_CANCELLED_MESSAGE };
      }
      // Generate unique filename with startTime
      const finalPath = this.generateScreenshotPath(startTime, options);

      // Capture screenshot with fallback
      const captureResult = await this.captureScreenshot(finalPath, options, signal);
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
   * Start a tracked screenshot capture that can be awaited or cancelled later.
   */
  startTrackedCapture(
    options: ScreenshotOptions = { format: "png" },
    trackerOptions: ScreenshotJobOptions = {}
  ): ScreenshotJobHandle {
    return ScreenshotJobTracker.startJob(
      this.device.deviceId,
      signal => this.execute(options, signal),
      trackerOptions
    );
  }

  /**
   * Capture screenshot using screencap method with fallback
   * @param finalPath - Path to save the screenshot
   * @param options - Screenshot format options
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureScreenshot(
    finalPath: string,
    options: ScreenshotOptions = { format: "png" },
    signal?: AbortSignal
  ): Promise<ScreenshotResult> {

    logger.info(`[SCREENSHOT] Starting screenshot capture with format: ${options.format}`);

    switch (this.device.platform) {
      case "android":
        return await this.captureAndroidScreenshot(finalPath, options, signal);
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
    options: ScreenshotOptions = { format: "png" },
    signal?: AbortSignal
  ): Promise<ScreenshotResult> {

    logger.info(`[SCREENSHOT] Starting screenshot capture with format: ${options.format}`);

    // Try base64 approach first (faster for smaller screenshots)
    try {
      return await this.captureScreenshotBase64(finalPath, options, signal);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("maxBuffer") || errorMessage.includes("stdout") || errorMessage.includes("buffer")) {
        logger.info(`[SCREENSHOT] Base64 approach failed (${errorMessage}), falling back to file pull approach`);
        return await this.captureScreenshotFilePull(finalPath, options, signal);
      } else {
        // For other errors, don't fallback
        throw err;
      }
    }
  }

  /**
   * Capture screenshot using XCTestService
   * @param finalPath - Path to save the screenshot
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureiOSScreenshot(
    finalPath: string,
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();

    try {
      const client = XCTestServiceClient.getInstance(this.device);

      // Ensure connected before requesting screenshot
      if (!await client.ensureConnected()) {
        return {
          success: false,
          error: "Failed to connect to XCTestService",
        };
      }

      // Request screenshot from XCTestService
      const result = await client.requestScreenshot(10000); // 10 second timeout

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || "No screenshot data returned",
        };
      }

      // Decode base64 and save to file securely
      const imageBuffer = Buffer.from(result.data, "base64");
      await writeFileSecure(finalPath, imageBuffer);

      const durationMs = Date.now() - startTime;
      logger.info(`[SCREENSHOT] iOS screenshot captured in ${durationMs}ms, saved to ${finalPath}`);

      // Push to observation stream for IDE plugins
      this.pushScreenshotToStream(result.data, imageBuffer);

      return {
        success: true,
        path: finalPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[SCREENSHOT] iOS screenshot capture failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Push screenshot to the device data stream for IDE plugins.
   */
  private pushScreenshotToStream(base64Data: string, imageBuffer: Buffer): void {
    const server = getDeviceDataStreamServer();
    if (!server) {
      return;
    }

    // Try to get dimensions from the image
    let width = 1080;
    let height = 2340;

    try {
      // PNG header contains dimensions at bytes 16-24
      if (imageBuffer.length >= 24 && imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
        width = imageBuffer.readUInt32BE(16);
        height = imageBuffer.readUInt32BE(20);
      }
    } catch {
      // Use defaults if we can't read dimensions
    }

    try {
      server.pushScreenshotUpdate(this.device.deviceId, base64Data, width, height);
    } catch (error) {
      logger.debug(`[SCREENSHOT] Failed to push screenshot to observation stream: ${error}`);
    }
  }

  /**
   * Capture screenshot using base64 encoding (faster but may hit buffer limits)
   * @param finalPath - Path to save the screenshot
   * @param options - Screenshot format options
   * @returns ScreenshotResult with path to the saved screenshot or error
   */
  private async captureScreenshotBase64(
    finalPath: string,
    options: ScreenshotOptions = { format: "png" },
    signal?: AbortSignal
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();
    logger.info(`[SCREENSHOT] Trying base64 approach`);

    const cmdStartTime = Date.now();
    const tempFile = "/sdcard/screenshot.png";

    // Single command: screencap -> base64 encode -> remove temp file
    const command = `shell "screencap -p ${tempFile} && base64 ${tempFile} && rm ${tempFile}"`;
    // Use larger maxBuffer (50MB) to handle high-resolution screenshots
    const maxBuffer = 50 * 1024 * 1024; // 50MB
    const result = await this.adb.executeCommand(command, undefined, maxBuffer, undefined, signal);
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

    // Handle format conversion and save securely
    if (options.format !== "webp") {
      // For PNG, save directly
      const saveStartTime = Date.now();
      await writeFileSecure(finalPath, imageBuffer);
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

      // Save the webp file securely
      const saveStartTime = Date.now();
      await writeFileSecure(finalPath, convertedImage);
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
    options: ScreenshotOptions = { format: "png" },
    signal?: AbortSignal
  ): Promise<ScreenshotResult> {
    const startTime = Date.now();
    logger.info(`[SCREENSHOT] Using file pull approach`);

    try {
      // Use file pull approach instead of base64 to avoid stdout buffer issues
      const cmdStartTime = Date.now();
      const tempFile = "/sdcard/screenshot.png";
      const tempLocalFile = `${finalPath}.temp`;

      // Step 1: Take screenshot on device
      const screencapResult = await this.adb.executeCommand(`shell screencap -p ${tempFile}`, undefined, undefined, undefined, signal);
      if (screencapResult.stderr && screencapResult.stderr.includes("error")) {
        throw new Error(`Screencap failed: ${screencapResult.stderr}`);
      }

      // Step 2: Pull file from device to local filesystem
      const pullResult = await this.adb.executeCommand(`pull ${tempFile} ${tempLocalFile}`, undefined, undefined, undefined, signal);
      if (pullResult.stderr && pullResult.stderr.includes("error")) {
        throw new Error(`Failed to pull screenshot: ${pullResult.stderr}`);
      }

      // Step 3: Clean up temp file on device
      await this.adb.executeCommand(`shell rm ${tempFile}`, undefined, undefined, undefined, signal);

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

        // Save the webp file securely and remove temp file
        const saveStartTime = Date.now();
        await writeFileSecure(finalPath, convertedImage);
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
