import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { ActiveWindowInfo } from "../../models/ActiveWindowInfo";
import { logger } from "../../utils/logger";
import { NodeCryptoService } from "../../utils/crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { BootedDevice } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

export class Window {
  private adb: AdbClient;
  private cachedActiveWindow: ActiveWindowInfo | null = null;
  private readonly device: BootedDevice;
  private cacheDir: string = "/tmp/auto-mobile/window";

  /**
   * Create a Window instance
   * @param device - Optional device
   * @param adb - Optional AdbClient instance for testing
   */
  constructor(device: BootedDevice, adb: AdbClient | null = null) {
    this.adb = adb || new AdbClient(device);
    this.device = device;
  }

  /**
   * Get the cache file path based on device ID
   */
  private getCacheFilePath(): string {
    const deviceHash = NodeCryptoService.generateCacheKey(this.device.deviceId);
    return path.join(this.cacheDir, deviceHash);
  }

  public getDeviceId(): string {
    return this.device.deviceId;
  }

  /**
   * Write cache to disk
   */
  private async writeCacheToDisk(activeWindow: ActiveWindowInfo): Promise<void> {
    const filePath = this.getCacheFilePath();
    if (!filePath) {
      logger.info("[WINDOW] No device ID, skipping disk cache write");
      return;
    }

    try {
      // Ensure directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Write cache to disk
      await fs.writeFile(filePath, JSON.stringify(activeWindow), "utf-8");
      logger.debug(`Wrote active window cache to disk: ${filePath}`);
    } catch (err) {
      logger.error(`Failed to write cache to disk: ${err}`);
    }
  }

  /**
   * Read cache from disk
   */
  private async readCacheFromDisk(): Promise<ActiveWindowInfo | null> {
    const filePath = this.getCacheFilePath();
    if (!filePath) {
      logger.info("[WINDOW] No device ID, skipping disk cache read");
      return null;
    }

    try {
      const data = await fs.readFile(filePath, "utf-8");
      const activeWindow = JSON.parse(data) as ActiveWindowInfo;
      logger.debug(`Read active window cache from disk: ${filePath}`);
      return activeWindow;
    } catch (err) {
      // File doesn't exist or other error - this is normal
      logger.debug(`No disk cache found or error reading: ${err}`);
      return null;
    }
  }

  /**
   * Set cached active window from external source (e.g., UI stability waiting)
   */
  public async setCachedActiveWindow(activeWindow: ActiveWindowInfo): Promise<void> {
    this.cachedActiveWindow = activeWindow;
    await this.writeCacheToDisk(activeWindow);
    logger.info("[WINDOW] Cached active window from external source");
  }

  /**
   * Clear the cached active window
   */
  public async clearCache(): Promise<void> {
    this.cachedActiveWindow = null;

    // Also remove from disk
    const filePath = this.getCacheFilePath();
    if (filePath) {
      try {
        await fs.unlink(filePath);
        logger.info("[WINDOW] Cleared cached active window from disk");
      } catch (err) {
        // File might not exist, which is fine
        logger.debug(`Could not remove disk cache: ${err}`);
      }
    }

    logger.info("[WINDOW] Cleared cached active window");
  }

  async getCachedActiveWindow(): Promise<ActiveWindowInfo | null> {
    if (!this.cachedActiveWindow) {
      logger.info("[WINDOW] Using disk cached active window");
      const diskCache = await this.readCacheFromDisk();
      if (diskCache) {
        this.cachedActiveWindow = diskCache;
        logger.info("[WINDOW] Using disk cached active window");
        return diskCache;
      }
    }
    return this.cachedActiveWindow;
  }

  /**
   * Get information about the active window
   * @param forceRefresh - Force refresh the cache (default: false)
   * @param perf - Optional performance tracker
   * @returns Promise with active window information
   */
  async getActive(
    forceRefresh: boolean = false,
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<ActiveWindowInfo> {
    // Return cached value if available and not forcing refresh
    if (!forceRefresh && this.cachedActiveWindow) {
      logger.info("[WINDOW] Using memory cached active window");
      return this.cachedActiveWindow;
    }

    // Try to read from disk cache if not in memory and not forcing refresh
    if (!forceRefresh && !this.cachedActiveWindow) {
      logger.info("[WINDOW] Using disk cached active window");
      const diskCache = await perf.track("readDiskCache", () => this.readCacheFromDisk());
      if (diskCache) {
        this.cachedActiveWindow = diskCache;
        logger.info("[WINDOW] Using disk cached active window");
        return diskCache;
      }
    }

    try {
      const { stdout } = await perf.track("adbDumpsysWindowWindows", () =>
        this.adb.executeCommand(`shell "dumpsys window windows"`)
      );

      // Default values
      let activityName = "";
      let packageName = "";
      let layoutSeqSum = 0;

      // First try to get from imeControlTarget (original approach)
      const imeControlMatch = stdout.match(
        /imeControlTarget.*?Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}/
      );

      if (imeControlMatch && imeControlMatch.length >= 3) {
        packageName = imeControlMatch[1];
        activityName = imeControlMatch[2];
      } else {
        // Handle Pop-Up Window case
        const popupControlMatch = stdout.match(
          /imeControlTarget.*?Window\{([0-9a-f]+)\s+u\d+\s+Pop-Up Window\}/i
        );

        if (popupControlMatch) {
          const hexRef = popupControlMatch[1];
          // Find the corresponding Window entry for this hex reference
          const windowRegex = new RegExp(`Window #\\d+ Window\\{${hexRef} u\\d+ Pop-Up Window\\}:([\\s\\S]*?)(?=Window #\\d+|$)`);
          const windowMatch = stdout.match(windowRegex);

          if (windowMatch) {
            // Look for mActivityRecord line within this window block
            const activityRecordMatch = windowMatch[1].match(
              /mActivityRecord=ActivityRecord\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)(?:\s+t\d+)?\}/
            );

            if (activityRecordMatch && activityRecordMatch.length >= 3) {
              packageName = activityRecordMatch[1];
              activityName = activityRecordMatch[2];
            }
          }
        }

        // If still no match, try fallback approaches
        if (!packageName || !activityName) {
          // Fallback: Look for visible application windows (not system UI)
          const visibleAppMatches = stdout.matchAll(
            /Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}:[\s\S]*?mViewVisibility=0x0[\s\S]*?isOnScreen=true[\s\S]*?isVisible=true/gs
          );

          for (const match of visibleAppMatches) {
            if (match[1] && match[2] && !match[1].includes("android.systemui") && !match[1].includes("nexuslauncher")) {
              packageName = match[1];
              activityName = match[2];
              break; // Use the first visible app window found
            }
          }

          // If still no match, try a broader pattern for any application window
          if (!packageName || !activityName) {
            const anyAppMatch = stdout.match(
              /Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}:[\s\S]*?ty=BASE_APPLICATION/
            );
            if (anyAppMatch && anyAppMatch.length >= 3) {
              packageName = anyAppMatch[1];
              activityName = anyAppMatch[2];
            }
          }
        }

        // If still no match, look for the first visible application window that's on screen
        if (!packageName || !activityName) {
          // Look for windows with isOnScreen=true and isVisible=true and ty=BASE_APPLICATION
          const visibleAppRegex = /Window #\d+ Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}:[\s\S]*?ty=BASE_APPLICATION[\s\S]*?isOnScreen=true[\s\S]*?isVisible=true/gs;
          const visibleMatch = visibleAppRegex.exec(stdout);

          if (visibleMatch && visibleMatch.length >= 3) {
            packageName = visibleMatch[1];
            activityName = visibleMatch[2];
          }
        }
      }

      // Extract layout sequence sum from all windows
      const layoutSeqMatches = stdout.matchAll(/mLayoutSeq=([\d\.]+)/g);

      if (layoutSeqMatches) {
        // for each layoutSeqMatch, add up into layoutSeqSum
        for (const match of layoutSeqMatches) {
          // if layoutSeq is an integer
          const layoutSeqInt = parseInt(match[1], 10);
          if (!isNaN(layoutSeqInt)) {
            layoutSeqSum += layoutSeqInt;
          }
        }
      }

      const result = { appId: packageName, activityName, layoutSeqSum };

      // Cache the result
      this.cachedActiveWindow = result;
      await this.writeCacheToDisk(result);
      logger.info("[WINDOW] Cached new active window information");

      if (!packageName || !activityName) {
        const sample = stdout.trim().slice(0, 200);
        logger.warn(
          `[WINDOW] Failed to parse active window from dumpsys output. Sample: ${sample || "<empty>"}` 
        );
      }

      return result;
    } catch (err) {
      logger.error(`Failed to get active window information: ${err}`);
      return {
        appId: "",
        activityName: "",
        layoutSeqSum: 0
      };
    }
  }

  /**
   * Get a hash of the current activity name
   * @param perf - Optional performance tracker
   * @returns Promise with activity name hash
   */
  async getActiveHash(
    perf: PerformanceTracker = new NoOpPerformanceTracker()
  ): Promise<string> {
    logger.info("[WINDOW] Getting hash of active window");
    // Always force refresh when getting hash to ensure it reflects current state
    const activeWindow = await this.getActive(true, perf);
    const activityString = JSON.stringify(activeWindow);
    return NodeCryptoService.generateCacheKey(activityString);
  }
}
