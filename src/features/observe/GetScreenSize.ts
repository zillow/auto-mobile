import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { DeviceDetection } from "../../utils/DeviceDetection";
import { logger } from "../../utils/logger";
import { BootedDevice, ExecResult, ScreenSize as ScreenSizeModel } from "../../models";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { XCTestServiceClient } from "./ios";
import type { ScreenSize } from "./interfaces/ScreenSize";

export class GetScreenSize implements ScreenSize {
  private adb: AdbExecutor;
  private readonly device: BootedDevice;
  private static memoryCache = new Map<string, ScreenSize>();
  private static cacheDir = path.join(process.cwd(), ".cache", "screen-size");

  /**
   * Create a GetScreenSize instance
   * @param device - Device to get screen size for
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   */
  constructor(device: BootedDevice, adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory) {
    this.device = device;
    // Detect if the argument is a factory (has create method) or an executor
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      this.adb = (adbFactoryOrExecutor as AdbClientFactory).create(device);
    } else if (adbFactoryOrExecutor) {
      this.adb = adbFactoryOrExecutor as AdbExecutor;
    } else {
      this.adb = defaultAdbClientFactory.create(device);
    }
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
  private loadFromDiskCache(cacheKey: string): ScreenSizeModel | null {
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
  private saveToDiskCache(cacheKey: string, screenSize: ScreenSizeModel): void {
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
   * Extract screen size from view hierarchy root node bounds.
   * The root node (XCUIApplication) bounds represent the full screen dimensions.
   * Format: "[left,top][right,bottom]" e.g., "[0,0][402,874]"
   */
  private extractScreenSizeFromHierarchy(viewHierarchy: { hierarchy?: { node?: { $?: { bounds?: string } } } }): ScreenSizeModel | null {
    const rootNode = viewHierarchy?.hierarchy?.node;
    if (!rootNode?.$?.bounds) {
      return null;
    }

    const boundsStr = rootNode.$.bounds;
    const match = boundsStr.match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!match) {
      return null;
    }

    const left = parseInt(match[1], 10);
    const top = parseInt(match[2], 10);
    const right = parseInt(match[3], 10);
    const bottom = parseInt(match[4], 10);

    const width = right - left;
    const height = bottom - top;

    if (width > 0 && height > 0) {
      return { width, height };
    }

    return null;
  }

  /**
   * Adjust dimensions based on rotation
   * @param width - Physical width
   * @param height - Physical height
   * @param rotation - Device rotation (0-3)
   * @returns Adjusted screen size
   */
  public adjustDimensionsForRotation(width: number, height: number, rotation: number): ScreenSizeModel {
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
   * Get screen size for Android devices
   * @param dumpsysResult - Optional dumpsys result for optimization
   * @param perf - Optional performance tracker
   * @returns Promise with screen size
   */
  private async getAndroidScreenSize(
    dumpsysResult?: ExecResult,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<ScreenSizeModel> {
    // First get the physical screen size
    const { stdout } = await perf.track("adbWmSize", () =>
      this.adb.executeCommand("shell wm size")
    );
    const { width: physicalWidth, height: physicalHeight } = this.parsePhysicalDimensions(stdout);

    // Then check the current rotation to determine actual dimensions
    let rotation = 0;
    if (dumpsysResult) {
      rotation = await this.detectDeviceRotation(dumpsysResult);
    } else {
      // Get dumpsys result if not provided
      const dumpsysOutput = await perf.track("adbDumpsysWindow", () =>
        this.adb.executeCommand("shell dumpsys window")
      );
      rotation = await this.detectDeviceRotation(dumpsysOutput);
    }

    const screenSize = this.adjustDimensionsForRotation(physicalWidth, physicalHeight, rotation);

    // Cache the result in both memory and disk
    const cacheKey = this.generateCacheKey(this.device.deviceId);
    GetScreenSize.memoryCache.set(cacheKey, screenSize);
    this.saveToDiskCache(cacheKey, screenSize);

    logger.debug(`Android screen size computed and cached for device: ${this.device.deviceId}`);
    return screenSize;
  }

  /**
   * Get the screen size and resolution
   * @param dumpsysResult - Optional dumpsys result for optimization
   * @param perf - Optional performance tracker
   * @returns Promise with width and height
   */
  async execute(
    dumpsysResult?: ExecResult,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<ScreenSizeModel> {
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
      const isiOSDevice = DeviceDetection.isiOSDevice(this.device.deviceId);

      if (isiOSDevice) {
        // iOS device - use XCTestServiceClient to get hierarchy and extract screen size
        const client = XCTestServiceClient.getInstance(this.device);
        const hierarchyResult = await perf.track("iOSHierarchy", () =>
          client.getAccessibilityHierarchy()
        );

        if (hierarchyResult) {
          const screenSize = this.extractScreenSizeFromHierarchy(hierarchyResult);
          if (screenSize) {
            // Cache the result
            const cacheKey = this.generateCacheKey(this.device.deviceId);
            GetScreenSize.memoryCache.set(cacheKey, screenSize);
            this.saveToDiskCache(cacheKey, screenSize);
            logger.debug(`[iOS] Screen size from hierarchy: ${screenSize.width}x${screenSize.height}`);
            return screenSize;
          }
        }

        throw new Error("Failed to get iOS screen size from XCTestServiceClient hierarchy");
      } else {
        // Android device - use adb to get screen size
        return await this.getAndroidScreenSize(dumpsysResult, perf);
      }
    } catch (err) {
      throw new Error(`Failed to get screen size: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
