import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { logger } from "../../utils/logger";
import { BootedDevice, ExecResult, ScreenSize } from "../../models";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export class GetScreenSize {
  private adb: AdbUtils;
  private readonly device: BootedDevice;
  private static memoryCache = new Map<string, ScreenSize>();
  private static cacheDir = path.join(process.cwd(), ".cache", "screen-size");

  /**
   * Create a Window instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
  }

  /**
   * Generate cache key from deviceId
   * @param deviceId - Device identifier
   * @returns Hashed cache key
   */
  private generateCacheKey(deviceId: string): string {
    return crypto.createHash("md5").update(deviceId).digest("hex");
  }

  /**
   * Get disk cache file path
   * @param cacheKey - Cache key for the device
   * @returns Full path to cache file
   */
  private getCacheFilePath(cacheKey: string): string {
    return path.join(GetScreenSize.cacheDir, `${cacheKey}.json`);
  }

  /**
   * Load screen size from disk cache
   * @param cacheKey - Cache key for the device
   * @returns Screen size if found, null otherwise
   */
  private loadFromDiskCache(cacheKey: string): ScreenSize | null {
    try {
      const cacheFile = this.getCacheFilePath(cacheKey);
      if (fs.existsSync(cacheFile)) {
        const data = fs.readFileSync(cacheFile, "utf8");
        const cached = JSON.parse(data);
        logger.debug(`Screen size loaded from disk cache for key: ${cacheKey}`);
        return cached;
      }
    } catch (err) {
      logger.warn(`Failed to load screen size from disk cache: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  }

  /**
   * Save screen size to disk cache
   * @param cacheKey - Cache key for the device
   * @param screenSize - Screen size to cache
   */
  private saveToDiskCache(cacheKey: string, screenSize: ScreenSize): void {
    try {
      // Ensure cache directory exists
      if (!fs.existsSync(GetScreenSize.cacheDir)) {
        fs.mkdirSync(GetScreenSize.cacheDir, { recursive: true });
      }

      const cacheFile = this.getCacheFilePath(cacheKey);
      fs.writeFileSync(cacheFile, JSON.stringify(screenSize, null, 2));
      logger.debug(`Screen size saved to disk cache for key: ${cacheKey}`);
    } catch (err) {
      logger.warn(`Failed to save screen size to disk cache: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Parse physical screen dimensions from dumpsys output
   * @param stdout - dumpsys output containing size information
   * @returns Physical width and height
   */
  public parsePhysicalDimensions(stdout: string): { width: number; height: number } {
    const physicalMatch = stdout.match(/Physical size: (\d+)x(\d+)/);
    if (!physicalMatch) {
      throw new Error("Failed to get screen size");
    }
    return {
      width: parseInt(physicalMatch[1], 10),
      height: parseInt(physicalMatch[2], 10)
    };
  }

  /**
   * Detect device rotation
   * @returns Promise with rotation value (0-3)
   */
  public async detectDeviceRotation(dumpsysResult: ExecResult): Promise<number> {
    const rotationMatch = dumpsysResult.stdout.match(/mRotation=(\d+)|mCurrentRotation=(\d+)/);

    let rotation = 0;
    if (rotationMatch) {
      // Get the rotation value from whichever group matched
      rotation = parseInt(rotationMatch[1] || rotationMatch[2], 10);
    }

    logger.debug(`Device rotation detected: ${rotation}`);
    return rotation;
  }

  /**
   * Adjust dimensions based on rotation
   * @param width - Physical width
   * @param height - Physical height
   * @param rotation - Device rotation (0-3)
   * @returns Adjusted screen size
   */
  public adjustDimensionsForRotation(width: number, height: number, rotation: number): ScreenSize {
    // Adjust dimensions based on rotation
    // 0 = portrait, 1 = landscape (90° clockwise), 2 = portrait upside down, 3 = landscape (270° clockwise)
    if (rotation === 1 || rotation === 3) {
      // In landscape mode, swap width and height
      return {
        width: height,
        height: width
      };
    }

    // In portrait mode, use original dimensions
    return {
      width,
      height
    };
  }

  /**
   * Get the screen size and resolution
   * @returns Promise with width and height
   */
  async execute(dumpsysResult?: ExecResult): Promise<ScreenSize> {
    const cacheKey = this.generateCacheKey(this.device.deviceId);

    // Check memory cache first
    if (GetScreenSize.memoryCache.has(cacheKey)) {
      logger.debug(`Screen size retrieved from memory cache for device: ${this.device.deviceId}`);
      return GetScreenSize.memoryCache.get(cacheKey)!;
    }

    // Check disk cache
    const diskCached = this.loadFromDiskCache(cacheKey);
    if (diskCached) {
      // Store in memory cache for faster access next time
      GetScreenSize.memoryCache.set(cacheKey, diskCached);
      return diskCached;
    }

    // Execute actual command if not cached
    try {
      // First get the physical screen size
      const { stdout } = await this.adb.executeCommand("shell wm size");
      const { width: physicalWidth, height: physicalHeight } = this.parsePhysicalDimensions(stdout);

      // Then check the current rotation to determine actual dimensions
      let rotation = 0;
      if (dumpsysResult) {
        rotation = await this.detectDeviceRotation(dumpsysResult);
      } else {
        // Get dumpsys result if not provided
        const dumpsysOutput = await this.adb.executeCommand("shell dumpsys window");
        rotation = await this.detectDeviceRotation(dumpsysOutput);
      }

      const screenSize = this.adjustDimensionsForRotation(physicalWidth, physicalHeight, rotation);

      // Cache the result in both memory and disk
      GetScreenSize.memoryCache.set(cacheKey, screenSize);
      this.saveToDiskCache(cacheKey, screenSize);

      logger.debug(`Screen size computed and cached for device: ${this.device.deviceId}`);
      return screenSize;
    } catch (err) {
      throw new Error(`Failed to get screen size: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
