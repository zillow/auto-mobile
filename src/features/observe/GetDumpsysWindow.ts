import { AdbUtils } from "../../utils/android-cmdline-tools/adb";
import { BootedDevice, ExecResult } from "../../models";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export class GetDumpsysWindow {
  private adb: AdbUtils;
  private readonly device: BootedDevice;
  private static memoryCache = new Map<string, { data: ExecResult; timestamp: number }>();
  private static readonly CACHE_TTL_MS = 30000; // 30 seconds
  private readonly cacheDir: string;
  private readonly cacheFilePath: string;

  /**
   * Create a GetDumpsysWindow instance
   * @param device - Optional device
   * @param adb - Optional AdbUtils instance for testing
   */
  constructor(device: BootedDevice, adb: AdbUtils | null = null) {
    this.device = device;
    this.adb = adb || new AdbUtils(device);
    this.cacheDir = path.join(os.tmpdir(), "auto-mobile-cache");
    this.cacheFilePath = path.join(this.cacheDir, `dumpsys-window-${device.deviceId}.json`);
  }

  /**
   * Get cached dumpsys window data, using memory cache first, then disk cache
   * @returns Promise with cached rotation value or executes fresh command
   */
  public async execute(): Promise<ExecResult> {
    // Check memory cache first
    const memoryCached = GetDumpsysWindow.memoryCache.get(this.device.deviceId);
    if (memoryCached && this.isCacheValid(memoryCached.timestamp)) {
      return memoryCached.data;
    }

    // Check disk cache
    try {
      const diskCached = await this.loadFromDiskCache();
      if (diskCached && this.isCacheValid(diskCached.timestamp)) {
        // Update memory cache with disk data
        GetDumpsysWindow.memoryCache.set(this.device.deviceId, diskCached);
        return diskCached.data;
      }
    } catch (error) {
      // Disk cache read failed, continue to refresh
    }

    // No valid cache found, refresh and return
    return await this.refresh();
  }

  /**
   * Refresh dumpsys window data and update both memory and disk cache
   * @returns Promise with fresh rotation value
   */
  public async refresh(): Promise<ExecResult> {
    const result = await this.adb.executeCommand("shell dumpsys window");
    const timestamp = Date.now();
    const cacheEntry = { data: result, timestamp };

    // Update memory cache
    GetDumpsysWindow.memoryCache.set(this.device.deviceId, cacheEntry);

    // Update disk cache
    try {
      await this.saveToDiskCache(cacheEntry);
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
