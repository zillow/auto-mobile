import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { ActiveWindowInfo } from "../../models/ActiveWindowInfo";
import { logger } from "../../utils/logger";
import { NodeCryptoService } from "../../utils/crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { BootedDevice } from "../../models";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { getTempDir, TEMP_SUBDIRS } from "../../utils/tempDir";
import type { Window as WindowInterface } from "./interfaces/Window";

// AdbExecutor extended with optional AdbClient-specific methods
type ExtendedAdbExecutor = AdbExecutor & { getAndroidApiLevel?: () => Promise<number | null> };

export class Window implements WindowInterface {
  private adb: ExtendedAdbExecutor;
  private cachedActiveWindow: ActiveWindowInfo | null = null;
  private readonly device: BootedDevice;
  private cacheDir: string = getTempDir(TEMP_SUBDIRS.WINDOW);

  /**
   * Create a Window instance
   * @param device - Optional device
   * @param adbFactoryOrExecutor - Factory for creating AdbClient instances, or an AdbExecutor for testing
   */
  constructor(device: BootedDevice, adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory) {
    // Detect if the argument is a factory (has create method) or an executor
    if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
      this.adb = (adbFactoryOrExecutor as AdbClientFactory).create(device);
    } else if (adbFactoryOrExecutor) {
      this.adb = adbFactoryOrExecutor as ExtendedAdbExecutor;
    } else {
      this.adb = defaultAdbClientFactory.create(device);
    }
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

      // Detect API level for parsing strategy
      let apiLevel: number | null = null;
      if (typeof this.adb.getAndroidApiLevel === "function") {
        apiLevel = await this.adb.getAndroidApiLevel();
      }

      let parsed: { appId: string; activityName: string } | null = null;

      if (apiLevel !== null && apiLevel !== undefined && apiLevel <= 27) {
        // API 27 and below: try mCurrentFocus/mFocusedApp first (most reliable when present)
        parsed = parseDumpsysWindowFocus(stdout);
        if (!parsed) {
          // Fall back to window block scanning (ty=1 + isReadyForDisplay)
          parsed = parseActiveWindowLegacy(stdout);
        }
        if (!parsed) {
          // Try separate dumpsys window command (shorter output)
          parsed = await this.parseActiveWindowFromDumpsysWindow();
        }
        if (!parsed) {
          // Fall through to modern as safety net
          parsed = parseActiveWindowModern(stdout);
        }
      } else {
        parsed = parseActiveWindowModern(stdout);
      }

      const packageName = parsed?.appId ?? "";
      const activityName = parsed?.activityName ?? "";

      // Extract layout sequence sum from all windows
      let layoutSeqSum = 0;
      const layoutSeqMatches = stdout.matchAll(/mLayoutSeq=([\d\.]+)/g);

      if (layoutSeqMatches) {
        for (const match of layoutSeqMatches) {
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
   * Parse mCurrentFocus/mFocusedApp from simpler `dumpsys window` output (API 25 fallback)
   */
  private async parseActiveWindowFromDumpsysWindow(): Promise<{ appId: string; activityName: string } | null> {
    try {
      const { stdout } = await this.adb.executeCommand(`shell "dumpsys window"`);
      return parseDumpsysWindowFocus(stdout);
    } catch (err) {
      logger.error(`Failed to get dumpsys window for legacy fallback: ${err}`);
      return null;
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

/**
 * Parse active window from dumpsys window windows output for API 26+ (modern format).
 * Uses 5-pattern fallback chain: imeControlTarget → Pop-Up → visible app → BASE_APPLICATION → visible+BASE_APPLICATION.
 */
export function parseActiveWindowModern(stdout: string): { appId: string; activityName: string } | null {
  let packageName = "";
  let activityName = "";

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
      const windowRegex = new RegExp(`Window #\\d+ Window\\{${hexRef} u\\d+ Pop-Up Window\\}:([\\s\\S]*?)(?=Window #\\d+|$)`);
      const windowMatch = stdout.match(windowRegex);

      if (windowMatch) {
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
      const visibleAppMatches = stdout.matchAll(
        /Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}:[\s\S]*?mViewVisibility=0x0[\s\S]*?isOnScreen=true[\s\S]*?isVisible=true/gs
      );

      for (const match of visibleAppMatches) {
        if (match[1] && match[2] && !match[1].includes("android.systemui") && !match[1].includes("nexuslauncher")) {
          packageName = match[1];
          activityName = match[2];
          break;
        }
      }

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

    if (!packageName || !activityName) {
      const visibleAppRegex = /Window #\d+ Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}:[\s\S]*?ty=BASE_APPLICATION[\s\S]*?isOnScreen=true[\s\S]*?isVisible=true/gs;
      const visibleMatch = visibleAppRegex.exec(stdout);

      if (visibleMatch && visibleMatch.length >= 3) {
        packageName = visibleMatch[1];
        activityName = visibleMatch[2];
      }
    }
  }

  if (packageName && activityName) {
    return { appId: packageName, activityName };
  }
  return null;
}

/**
 * Parse active window from dumpsys window windows output for API 25 and below (legacy format).
 * Looks for Window blocks with ty=1 (BASE_APPLICATION equivalent) and isReadyForDisplay()=true.
 */
export function parseActiveWindowLegacy(stdout: string): { appId: string; activityName: string } | null {
  // Split into individual window blocks to avoid matching across blocks
  const blockRegex = /Window #\d+ Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}:([\s\S]*?)(?=Window #\d+|$)/g;
  const blocks = [...stdout.matchAll(blockRegex)];

  for (const block of blocks) {
    const pkg = block[1];
    const activity = block[2];
    const content = block[3];

    if (!pkg || !activity) {continue;}
    if (pkg.includes("android.systemui") || pkg.includes("nexuslauncher")) {continue;}

    // Check for ty=1 (BASE_APPLICATION on legacy) and isReadyForDisplay()=true within this block
    if (/\bty=1\b/.test(content) && /isReadyForDisplay\(\)=true/.test(content)) {
      return { appId: pkg, activityName: activity };
    }
  }

  return null;
}

/**
 * Parse mCurrentFocus/mFocusedApp from `dumpsys window` output (simpler format, API 25 fallback).
 */
export function parseDumpsysWindowFocus(stdout: string): { appId: string; activityName: string } | null {
  // Try mCurrentFocus=Window{...pkg/activity}
  const currentFocusMatch = stdout.match(
    /mCurrentFocus=Window\{[^}]*?\s+u\d+\s+([^\s/]+)\/([^\s}]+)\}/
  );
  if (currentFocusMatch && currentFocusMatch.length >= 3) {
    return { appId: currentFocusMatch[1], activityName: currentFocusMatch[2] };
  }

  // Try mFocusedApp=AppWindowToken{...pkg/activity}
  const focusedAppMatch = stdout.match(
    /mFocusedApp=AppWindowToken\{[^}]*?\s+([^\s/]+)\/([^\s}]+)/
  );
  if (focusedAppMatch && focusedAppMatch.length >= 3) {
    return { appId: focusedAppMatch[1], activityName: focusedAppMatch[2] };
  }

  return null;
}
