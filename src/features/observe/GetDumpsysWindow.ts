import { AdbClientFactory, defaultAdbClientFactory } from "../../utils/android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "../../utils/android-cmdline-tools/interfaces/AdbExecutor";
import { BootedDevice, ExecResult } from "../../models";
import * as fs from "fs/promises";
import * as path from "path";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";
import { getTempDir, TEMP_SUBDIRS } from "../../utils/tempDir";
import type { DumpsysWindow } from "./interfaces/DumpsysWindow";

export class GetDumpsysWindow implements DumpsysWindow {
  private adb: AdbExecutor;
  private readonly device: BootedDevice;
  private static memoryCache = new Map<string, { data: ExecResult; timestamp: number }>();
  private static readonly CACHE_TTL_MS = 30000; // 30 seconds
  private readonly cacheDir: string;
  private readonly cacheFilePath: string;

  /**
   * Create a GetDumpsysWindow instance
   * @param device - Optional device
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
    this.cacheDir = getTempDir(TEMP_SUBDIRS.CACHE);
    this.cacheFilePath = path.join(this.cacheDir, `dumpsys-window-${device.deviceId}.json`);
  }

  /**
   * Get cached dumpsys window data, using memory cache first, then disk cache
   * @param perf - Optional performance tracker
   * @returns Promise with cached rotation value or executes fresh command
   */
  public async execute(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    signal?: AbortSignal
  ): Promise<ExecResult> {
    // Check memory cache first
    const memoryCached = GetDumpsysWindow.memoryCache.get(this.device.deviceId);
    if (memoryCached && this.isCacheValid(memoryCached.timestamp)) {
      return memoryCached.data;
    }

    // Check disk cache
    try {
      const diskCached = await perf.track("loadDiskCache", () => this.loadFromDiskCache());
      if (diskCached && this.isCacheValid(diskCached.timestamp)) {
        // Update memory cache with disk data
        GetDumpsysWindow.memoryCache.set(this.device.deviceId, diskCached);
        return diskCached.data;
      }
    } catch (error) {
      // Disk cache read failed, continue to refresh
    }

    // No valid cache found, refresh and return
    return await this.refresh(perf, signal);
  }

  /**
   * Refresh dumpsys window data and update both memory and disk cache
   * @param perf - Optional performance tracker
   * @returns Promise with fresh rotation value
   */
  public async refresh(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    signal?: AbortSignal
  ): Promise<ExecResult> {
    const result = await perf.track("adbDumpsysWindow", () =>
      this.adb.executeCommand("shell dumpsys window", undefined, undefined, undefined, signal)
    );
    const timestamp = Date.now();
    const cacheEntry = { data: result, timestamp };

    // Update memory cache
    GetDumpsysWindow.memoryCache.set(this.device.deviceId, cacheEntry);

    // Update disk cache
    try {
      await perf.track("saveDiskCache", () => this.saveToDiskCache(cacheEntry));
    } catch (error) {
      // Disk cache write failed, but we still return the result
      console.warn(`Failed to write disk cache for device ${this.device.deviceId}:`, error);
    }

    return result;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < GetDumpsysWindow.CACHE_TTL_MS;
  }

  private async loadFromDiskCache(): Promise<{ data: ExecResult; timestamp: number } | null> {
    try {
      const cacheData = await fs.readFile(this.cacheFilePath, "utf-8");
      return JSON.parse(cacheData);
    } catch (error) {
      return null;
    }
  }

  private async saveToDiskCache(cacheEntry: { data: ExecResult; timestamp: number }): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheEntry), "utf-8");
  }
}
