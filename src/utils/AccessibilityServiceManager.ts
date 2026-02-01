import { AdbClientFactory, defaultAdbClientFactory } from "./android-cmdline-tools/AdbClientFactory";
import type { AdbExecutor } from "./android-cmdline-tools/interfaces/AdbExecutor";
import { logger } from "./logger";
import * as fs from "fs/promises";
import { createWriteStream } from "fs";
import * as path from "path";
import { exec } from "child_process";
import { createReadStream } from "fs";
import { promisify } from "util";
import { BootedDevice } from "../models";
import { APK_URL, APK_SHA256_CHECKSUM } from "../constants/release";
import AdmZip from "adm-zip";
import crypto from "crypto";
import http from "http";
import https from "https";
import os from "os";
import { accessibilityDetector } from "./AccessibilityDetector";
import type { AccessibilityDetector } from "./interfaces/AccessibilityDetector";
import { NoOpPerformanceTracker, type PerformanceTracker } from "./PerformanceTracker";

const execAsync = promisify(exec);

/**
 * Result of accessibility service setup
 */
export interface AccessibilitySetupResult {
  success: boolean;
  message: string;
  error?: string;
  perfTiming?: ReturnType<PerformanceTracker["getTimings"]>;
}

/**
 * Interface for accessibility service management
 */
export interface AccessibilityServiceManager {
  setup(force?: boolean, perf?: PerformanceTracker): Promise<AccessibilitySetupResult>;
  isInstalled(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isEnabledForUser(userId: number): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  getInstalledApkSha256(): Promise<string | null>;
  isVersionCompatible(): Promise<boolean>;
  ensureCompatibleVersion(): Promise<AccessibilityVersionCheckResult>;
  downloadApk(): Promise<string>;
  install(apkPath: string): Promise<void>;
  enable(): Promise<void>;
  enableForUser(userId: number): Promise<void>;
  cleanupApk(apkPath: string): Promise<void>;
}

export interface AccessibilityVersionCheckResult {
  status: "skipped" | "not_installed" | "compatible" | "upgraded" | "reinstalled" | "failed";
  expectedSha256?: string;
  installedSha256?: string | null;
  installedShaSource?: "device" | "host" | "none";
  installedApkPath?: string | null;
  attemptedDownload?: boolean;
  attemptedInstall?: boolean;
  attemptedReinstall?: boolean;
  downloadUnavailable?: boolean;
  error?: string;
  upgradeError?: string;
  reinstallError?: string;
}

export interface ToggleCapabilities {
  supportsSettingsToggle: boolean;
  deviceType: "emulator" | "physical";
  apiLevel: number | null;
  reason?: string;
}

type InstalledApkSha256Result = {
  sha256: string | null;
  source: "device" | "host" | "none";
  apkPath?: string;
  error?: string;
};

export class AndroidAccessibilityServiceManager implements AccessibilityServiceManager {
  private readonly device: BootedDevice;
  private adb: AdbExecutor;
  public static readonly PACKAGE = "dev.jasonpearson.automobile.accessibilityservice";
  public static readonly ACTIVITY = "dev.jasonpearson.automobile.accessibilityservice.MainActivity";
  private static readonly APK_URL = APK_URL;

  // Static cache for service availability
  private cachedAvailability: { isAvailable: boolean; timestamp: number } | null = null;
  private static readonly AVAILABILITY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  // Static caches for individual status checks
  private cachedInstallation: { isInstalled: boolean; timestamp: number } | null = null;
  private cachedEnabled: { isEnabled: boolean; timestamp: number } | null = null;
  private static readonly STATUS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Cache for toggle capabilities (settings permissions don't change during session)
  private cachedToggleCapabilities: ToggleCapabilities | null = null;

  private attemptedAutomatedSetup: boolean = false;
  private static instances: Map<string, AndroidAccessibilityServiceManager> = new Map();
  private static expectedChecksumOverride: string | null = null;
  private static accessibilityDetectorOverride: AccessibilityDetector | null = null;

  // Static prefetch state for APK download optimization
  private static prefetchPromise: Promise<string | null> | null = null;
  private static prefetchedApkPath: string | null = null;
  private static prefetchError: Error | null = null;

  // Static factory for creating ADB clients
  private static adbFactory: AdbClientFactory = defaultAdbClientFactory;

  private constructor(device: BootedDevice, adb: AdbExecutor) {
    // home should either be process.env.HOME or bash resolution of home for current user
    const homeDir = process.env.HOME || require("os").homedir();
    if (!homeDir) {
      throw new Error("Home directory for current user not found");
    }
    this.device = device;
    this.adb = adb;
  }

  public static getInstance(device: BootedDevice, adbFactoryOrExecutor: AdbClientFactory | AdbExecutor | null = defaultAdbClientFactory): AndroidAccessibilityServiceManager {
    if (!AndroidAccessibilityServiceManager.instances.has(device.deviceId)) {
      let adb: AdbExecutor;
      let factory: AdbClientFactory;
      // Detect if the argument is a factory (has create method) or an executor
      if (adbFactoryOrExecutor && typeof (adbFactoryOrExecutor as AdbClientFactory).create === "function") {
        factory = adbFactoryOrExecutor as AdbClientFactory;
        adb = factory.create(device);
      } else if (adbFactoryOrExecutor) {
        // Legacy path: wrap the executor in a factory for downstream dependencies
        const executor = adbFactoryOrExecutor as AdbExecutor;
        adb = executor;
        factory = { create: () => executor };
      } else {
        factory = defaultAdbClientFactory;
        adb = factory.create(device);
      }
      AndroidAccessibilityServiceManager.adbFactory = factory;
      AndroidAccessibilityServiceManager.instances.set(device.deviceId, new AndroidAccessibilityServiceManager(
        device,
        adb
      ));
    }
    return AndroidAccessibilityServiceManager.instances.get(device.deviceId)!;
  }

  /**
   * Reset all instances (for testing)
   */
  public static resetInstances(): void {
    AndroidAccessibilityServiceManager.instances.clear();
  }

  /**
   * Prefetch the accessibility service APK asynchronously.
   * Call this at server startup to warm the cache before first device connection.
   * This is a no-op if prefetch is already in progress or completed.
   */
  public static prefetchApk(): void {
    // Skip if already prefetching or prefetched
    if (AndroidAccessibilityServiceManager.prefetchPromise !== null) {
      logger.info("[ACCESSIBILITY_SERVICE] APK prefetch already initiated, skipping");
      return;
    }

    // Skip if there's an override path (local APK)
    const overridePath = process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH?.trim();
    if (overridePath && overridePath.length > 0) {
      logger.info("[ACCESSIBILITY_SERVICE] Using local APK override, skipping prefetch");
      return;
    }

    logger.info("[ACCESSIBILITY_SERVICE] Starting APK prefetch");
    const startTime = Date.now();

    AndroidAccessibilityServiceManager.prefetchPromise = AndroidAccessibilityServiceManager.doPrefetch()
      .then(apkPath => {
        const duration = Date.now() - startTime;
        if (apkPath) {
          AndroidAccessibilityServiceManager.prefetchedApkPath = apkPath;
          logger.info(`[ACCESSIBILITY_SERVICE] APK prefetch completed in ${duration}ms`, { path: apkPath });
        }
        return apkPath;
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        AndroidAccessibilityServiceManager.prefetchError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`[ACCESSIBILITY_SERVICE] APK prefetch failed after ${duration}ms`, {
          error: AndroidAccessibilityServiceManager.prefetchError.message
        });
        return null;
      });
  }

  /**
   * Internal prefetch implementation
   */
  private static async doPrefetch(): Promise<string | null> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-mobile-prefetch-"));
    const apkPath = path.join(tempDir, "accessibility-service.apk");

    // Download the APK
    logger.info("[ACCESSIBILITY_SERVICE] Prefetch: downloading APK", { url: APK_URL, destination: apkPath });
    await AndroidAccessibilityServiceManager.downloadApkFromUrlStatic(APK_URL, apkPath);

    // Verify the file exists and has reasonable size
    const stats = await fs.stat(apkPath);
    if (stats.size < 10000) {
      throw new Error(`Prefetched APK is too small (${stats.size} bytes), likely invalid`);
    }

    // Verify APK integrity
    AndroidAccessibilityServiceManager.verifyApkIntegrityStatic(apkPath);

    // Verify checksum if provided
    const expectedChecksum = AndroidAccessibilityServiceManager.expectedChecksumOverride ?? APK_SHA256_CHECKSUM;
    if (expectedChecksum.length > 0) {
      const actualChecksum = await AndroidAccessibilityServiceManager.computeFileSha256Static(apkPath);
      if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
        // Clean up invalid file
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw new Error(`APK checksum verification failed. Expected: ${expectedChecksum}, Got: ${actualChecksum}`);
      }
      logger.info("[ACCESSIBILITY_SERVICE] Prefetch: checksum verified", { checksum: actualChecksum });
    }

    logger.info("[ACCESSIBILITY_SERVICE] Prefetch: APK ready", { path: apkPath, size: stats.size });
    return apkPath;
  }

  /**
   * Get the prefetched APK path, waiting for prefetch to complete if in progress.
   * Returns null if prefetch failed or was not initiated.
   */
  public static async getPrefetchedApkPath(): Promise<string | null> {
    if (AndroidAccessibilityServiceManager.prefetchPromise === null) {
      return null;
    }

    try {
      await AndroidAccessibilityServiceManager.prefetchPromise;
      return AndroidAccessibilityServiceManager.prefetchedApkPath;
    } catch {
      return null;
    }
  }

  /**
   * Consume the prefetched APK path by copying it to a new location.
   * This allows multiple devices to use the prefetched APK.
   * Returns null if no prefetched APK is available.
   */
  public static async consumePrefetchedApk(destinationPath: string): Promise<boolean> {
    const prefetchedPath = await AndroidAccessibilityServiceManager.getPrefetchedApkPath();
    if (!prefetchedPath) {
      return false;
    }

    try {
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(prefetchedPath, destinationPath);
      logger.info("[ACCESSIBILITY_SERVICE] Copied prefetched APK", {
        source: prefetchedPath,
        destination: destinationPath
      });
      return true;
    } catch (error) {
      logger.warn("[ACCESSIBILITY_SERVICE] Failed to copy prefetched APK", {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Clean up the prefetched APK file
   */
  public static async cleanupPrefetchedApk(): Promise<void> {
    if (AndroidAccessibilityServiceManager.prefetchedApkPath) {
      try {
        const tempDir = path.dirname(AndroidAccessibilityServiceManager.prefetchedApkPath);
        await fs.rm(tempDir, { recursive: true, force: true });
        logger.info("[ACCESSIBILITY_SERVICE] Cleaned up prefetched APK", { path: tempDir });
      } catch (error) {
        logger.warn("[ACCESSIBILITY_SERVICE] Failed to clean up prefetched APK", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      AndroidAccessibilityServiceManager.prefetchedApkPath = null;
    }
    AndroidAccessibilityServiceManager.prefetchPromise = null;
    AndroidAccessibilityServiceManager.prefetchError = null;
  }

  /**
   * Static download helper for prefetch (no device/adb context)
   */
  private static async downloadApkFromUrlStatic(url: string, destination: string): Promise<void> {
    // Try curl first, then wget, then Node HTTP
    try {
      await execAsync(`curl --fail --location --retry 3 --retry-delay 1 --silent --show-error -o "${destination}" "${url}"`);
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      const combinedMessage = `${err.message ?? ""} ${err.stderr ?? ""}`.toLowerCase();
      const isUnavailable = err.code === "ENOENT" ||
        combinedMessage.includes("command not found") ||
        combinedMessage.includes("not recognized");
      if (!isUnavailable) {
        throw error;
      }
    }

    try {
      await execAsync(`wget --tries=3 --timeout=30 -O "${destination}" "${url}"`);
      return;
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string };
      const combinedMessage = `${err.message ?? ""} ${err.stderr ?? ""}`.toLowerCase();
      const isUnavailable = err.code === "ENOENT" ||
        combinedMessage.includes("command not found") ||
        combinedMessage.includes("not recognized");
      if (!isUnavailable) {
        throw error;
      }
    }

    // Node HTTP fallback
    await AndroidAccessibilityServiceManager.downloadWithNodeHttpStatic(url, destination, 0);
  }

  /**
   * Static Node HTTP download for prefetch
   */
  private static async downloadWithNodeHttpStatic(url: string, destination: string, redirectCount: number): Promise<void> {
    if (redirectCount > 5) {
      throw new Error(`Too many redirects while downloading ${url}`);
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const transport = url.startsWith("https:") ? https : http;
      const request = transport.get(
        url,
        { headers: { "User-Agent": "auto-mobile" } },
        response => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            const redirectedUrl = new URL(response.headers.location, url).toString();
            void AndroidAccessibilityServiceManager.downloadWithNodeHttpStatic(redirectedUrl, destination, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (statusCode !== 200) {
            response.resume();
            reject(new Error(`Download failed with status ${statusCode} from ${url}`));
            return;
          }

          const fileStream = createWriteStream(destination);
          response.pipe(fileStream);
          fileStream.on("finish", () => fileStream.close(() => resolve()));
          fileStream.on("error", err => {
            fileStream.close();
            reject(err);
          });
        }
      );

      request.setTimeout(30000, () => {
        request.destroy(new Error(`Download request timed out for ${url}`));
      });
      request.on("error", reject);
    });
  }

  /**
   * Static APK integrity verification for prefetch
   */
  private static verifyApkIntegrityStatic(apkPath: string): void {
    try {
      const zip = new AdmZip(apkPath);
      const entries = zip.getEntries();
      const hasManifest = entries.some(entry => entry.entryName === "AndroidManifest.xml");
      if (!hasManifest) {
        throw new Error("AndroidManifest.xml missing");
      }
    } catch (error) {
      throw new Error(`APK integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Static SHA256 computation for prefetch
   */
  private static async computeFileSha256Static(apkPath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(apkPath);
      stream.on("data", chunk => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    return hash.digest("hex");
  }

  public static setExpectedChecksumForTesting(checksum: string | null): void {
    AndroidAccessibilityServiceManager.expectedChecksumOverride = checksum;
  }

  public static setAccessibilityDetectorForTesting(detector: AccessibilityDetector | null): void {
    AndroidAccessibilityServiceManager.accessibilityDetectorOverride = detector;
  }

  private getAccessibilityDetector(): AccessibilityDetector {
    return AndroidAccessibilityServiceManager.accessibilityDetectorOverride || accessibilityDetector;
  }

  /**
   * Clear the cached availability status
   */
  public clearAvailabilityCache(): void {
    this.cachedAvailability = null;
    this.cachedInstallation = null;
    this.cachedEnabled = null;
    this.cachedToggleCapabilities = null;
    logger.info("[ACCESSIBILITY_SERVICE] Cleared all availability caches");
  }

  /**
   * Reset the setup state to allow a fresh setup attempt.
   * Call this when observe detects accessibilityState.enabled: false
   * to force a full re-setup on the next attempt.
   */
  public resetSetupState(): void {
    this.attemptedAutomatedSetup = false;
    this.clearAvailabilityCache();
    logger.info("[ACCESSIBILITY_SERVICE] Reset setup state - next setup will be a full attempt");
  }

  private async execShell(command: string): Promise<{ stdout: string; stderr: string }> {
    return execAsync(command);
  }

  private async tryChecksumCommand(command: string, tool: string): Promise<string | null> {
    try {
      const { stdout } = await this.execShell(command);
      const checksum = stdout.trim().split(/\s+/)[0];
      if (!checksum) {
        logger.warn("APK checksum command returned no output", { tool });
        return null;
      }
      return checksum;
    } catch (error) {
      logger.info("APK checksum tool unavailable, falling back", {
        tool,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private async computeFileSha256(apkPath: string): Promise<{ checksum: string; source: "sha256sum" | "shasum" | "node" }> {
    const sha256sum = await this.tryChecksumCommand(`sha256sum "${apkPath}"`, "sha256sum");
    if (sha256sum) {
      return { checksum: sha256sum, source: "sha256sum" };
    }

    const shasum = await this.tryChecksumCommand(`shasum -a 256 "${apkPath}"`, "shasum");
    if (shasum) {
      return { checksum: shasum, source: "shasum" };
    }

    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(apkPath);
      stream.on("data", chunk => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve());
    });
    return { checksum: hash.digest("hex"), source: "node" };
  }

  /**
   * Check if Accessibility Service is installed on the device
   */
  async isInstalled(): Promise<boolean> {
    // Check cache first
    if (this.cachedInstallation && this.cachedInstallation.isInstalled) {
      const cacheAge = Date.now() - this.cachedInstallation.timestamp;
      if (cacheAge < AndroidAccessibilityServiceManager.STATUS_CACHE_TTL) {
        logger.info(`[ACCESSIBILITY_SERVICE] Using cached installation status (age: ${cacheAge}ms): ${this.cachedInstallation.isInstalled ? "installed" : "not installed"}`);
        return this.cachedInstallation.isInstalled;
      } else {
        this.cachedInstallation = null;
      }
    }

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Checking if accessibility service is installed");
      const result = await this.adb.executeCommand(`shell pm list packages | grep ${AndroidAccessibilityServiceManager.PACKAGE}`, undefined, undefined, true);
      const isInstalled = result.stdout.includes(AndroidAccessibilityServiceManager.PACKAGE);

      // Cache the result
      this.cachedInstallation = {
        isInstalled,
        timestamp: Date.now()
      };

      logger.info(`[ACCESSIBILITY_SERVICE] Service installation status: ${isInstalled ? "installed" : "not installed"} (cached for ${AndroidAccessibilityServiceManager.STATUS_CACHE_TTL / 1000 / 60} minutes)`);
      return isInstalled;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error checking installation status: ${error}`);
      return false;
    }
  }

  /**
   * Check if Accessibility Service is enabled as an input method
   */
  async isEnabled(): Promise<boolean> {
    // Check cache first
    if (this.cachedEnabled && this.cachedEnabled.isEnabled) {
      const cacheAge = Date.now() - this.cachedEnabled.timestamp;
      if (cacheAge < AndroidAccessibilityServiceManager.STATUS_CACHE_TTL) {
        logger.info(`[ACCESSIBILITY_SERVICE] Using cached enabled status (age: ${cacheAge}ms): ${this.cachedEnabled.isEnabled ? "enabled" : "disabled"}`);
        return this.cachedEnabled.isEnabled;
      } else {
        this.cachedEnabled = null;
      }
    }

    try {
      logger.info("[ACCESSIBILITY_SERVICE] Checking if accessibility service is enabled");
      const result = await this.adb.executeCommand("shell settings get secure enabled_accessibility_services");
      const isEnabled = result.stdout.includes(AndroidAccessibilityServiceManager.PACKAGE);

      // Cache the result
      this.cachedEnabled = {
        isEnabled,
        timestamp: Date.now()
      };

      logger.info(`[ACCESSIBILITY_SERVICE] Service enabled status: ${isEnabled ? "enabled" : "disabled"} (cached for ${AndroidAccessibilityServiceManager.STATUS_CACHE_TTL / 1000 / 60} minutes)`);
      return isEnabled;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error checking enabled status: ${error}`);
      return false;
    }
  }

  /**
   * Check if Accessibility Service is enabled for a specific user profile
   * @param userId - The Android user ID to check (e.g., 10 for work profile)
   */
  async isEnabledForUser(userId: number): Promise<boolean> {
    try {
      logger.info(`[ACCESSIBILITY_SERVICE] Checking if accessibility service is enabled for user ${userId}`);
      const result = await this.adb.executeCommand(`shell settings --user ${userId} get secure enabled_accessibility_services`);
      const isEnabled = result.stdout.includes(AndroidAccessibilityServiceManager.PACKAGE);
      logger.info(`[ACCESSIBILITY_SERVICE] Service enabled status for user ${userId}: ${isEnabled ? "enabled" : "disabled"}`);
      return isEnabled;
    } catch (error) {
      logger.warn(`[ACCESSIBILITY_SERVICE] Error checking enabled status for user ${userId}: ${error}`);
      return false;
    }
  }

  /**
   * Check if the accessibility service is both installed and enabled
   * @returns Promise<boolean> - True if available for use, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    const startTime = Date.now();

    // Check cache first
    if (this.cachedAvailability && this.cachedAvailability.isAvailable) {
      const cacheAge = Date.now() - this.cachedAvailability.timestamp;
      if (cacheAge < AndroidAccessibilityServiceManager.AVAILABILITY_CACHE_TTL) {
        logger.info(`[ACCESSIBILITY_SERVICE] Using cached overall availability (age: ${cacheAge}ms): ${this.cachedAvailability.isAvailable}`);
        return this.cachedAvailability.isAvailable;
      } else {
        this.cachedAvailability = null;
      }
    }

    logger.info(`[ACCESSIBILITY_SERVICE] Checking availability (no cached result available)`);

    try {
      // Check installation and enabled status in parallel for better performance
      const [installed, enabled] = await Promise.all([
        this.isInstalled(),
        this.isEnabled()
      ]);

      const available = installed && enabled;
      const duration = Date.now() - startTime;

      // Cache the result
      this.cachedAvailability = {
        isAvailable: available,
        timestamp: Date.now()
      };

      logger.info(`[ACCESSIBILITY_SERVICE] Availability check completed in ${duration}ms - Available: ${available} (cached for ${AndroidAccessibilityServiceManager.AVAILABILITY_CACHE_TTL / 1000 / 60} minutes)`);
      return available;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[ACCESSIBILITY_SERVICE] Availability check failed after ${duration}ms: ${error}`);

      // Clear cache on error
      this.cachedAvailability = null;

      return false;
    }
  }

  /**
   * Get SHA256 of installed accessibility service APK.
   */
  async getInstalledApkSha256(): Promise<string | null> {
    const result = await this.getInstalledApkSha256WithDetails();
    return result.sha256;
  }

  /**
   * Check if installed APK SHA256 matches expected release checksum.
   */
  async isVersionCompatible(): Promise<boolean> {
    const expectedSha = this.getExpectedChecksum();
    if (expectedSha.length === 0) {
      logger.warn("[ACCESSIBILITY_SERVICE] Version check skipped (no checksum provided)");
      return true;
    }

    const installedSha = await this.getInstalledApkSha256();
    if (!installedSha) {
      return false;
    }

    return installedSha.toLowerCase() === expectedSha.toLowerCase();
  }

  /**
   * Ensure installed accessibility service version matches expected checksum.
   */
  async ensureCompatibleVersion(): Promise<AccessibilityVersionCheckResult> {
    this.clearAvailabilityCache();

    const expectedSha = this.getExpectedChecksum();
    if (expectedSha.length === 0) {
      return {
        status: "skipped",
        expectedSha256: expectedSha
      };
    }

    const isInstalled = await this.isInstalled();
    if (!isInstalled) {
      return {
        status: "not_installed",
        expectedSha256: expectedSha
      };
    }

    if (this.shouldSkipDownloadIfInstalled()) {
      logger.warn("[ACCESSIBILITY_SERVICE] Skipping APK download/version check (preinstalled APK allowed)");
      return {
        status: "skipped",
        expectedSha256: expectedSha
      };
    }

    const installedShaResult = await this.getInstalledApkSha256WithDetails();
    const result: AccessibilityVersionCheckResult = {
      status: "compatible",
      expectedSha256: expectedSha,
      installedSha256: installedShaResult.sha256,
      installedShaSource: installedShaResult.source,
      installedApkPath: installedShaResult.apkPath
    };

    const installedSha = installedShaResult.sha256;
    const needsReinstallDueToUnknownSha = !installedSha;

    if (!installedSha && installedShaResult.error) {
      logger.warn("[ACCESSIBILITY_SERVICE] Unable to determine installed APK checksum, forcing reinstall", {
        error: installedShaResult.error
      });
    }

    if (installedSha && installedSha.toLowerCase() === expectedSha.toLowerCase()) {
      return result;
    }

    if (needsReinstallDueToUnknownSha) {
      logger.warn("[ACCESSIBILITY_SERVICE] Installed APK checksum unavailable, forcing reinstall");
    } else {
      logger.info("[ACCESSIBILITY_SERVICE] Installed APK SHA mismatch, attempting upgrade", {
        expected: expectedSha,
        actual: installedSha
      });
    }

    let apkPath: string | null = null;
    try {
      result.attemptedDownload = true;
      apkPath = await this.downloadApk();

      if (!needsReinstallDueToUnknownSha) {
        try {
          result.attemptedInstall = true;
          await this.adb.executeCommand(`install -r -d "${apkPath}"`);
          logger.info("[ACCESSIBILITY_SERVICE] APK upgraded successfully");
          this.clearAvailabilityCache();
          return {
            ...result,
            status: "upgraded"
          };
        } catch (upgradeError) {
          const upgradeMessage = upgradeError instanceof Error ? upgradeError.message : String(upgradeError);
          logger.warn("[ACCESSIBILITY_SERVICE] Upgrade failed, attempting reinstall", { error: upgradeMessage });
          result.upgradeError = upgradeMessage;
        }
      }

      try {
        result.attemptedReinstall = true;
        await this.adb.executeCommand(`shell pm uninstall ${AndroidAccessibilityServiceManager.PACKAGE}`);
        await this.install(apkPath);
        await this.enable();
        logger.info("[ACCESSIBILITY_SERVICE] APK reinstalled and service re-enabled");
        this.clearAvailabilityCache();
        return {
          ...result,
          status: "reinstalled"
        };
      } catch (reinstallError) {
        const reinstallMessage = reinstallError instanceof Error ? reinstallError.message : String(reinstallError);
        return {
          ...result,
          status: "failed",
          reinstallError: reinstallMessage
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const downloadUnavailable = this.isNetworkError(message);
      return {
        ...result,
        status: "failed",
        downloadUnavailable,
        error: downloadUnavailable
          ? "Unable to download the latest accessibility service APK while offline. Connect to the internet and retry."
          : message
      };
    } finally {
      if (apkPath) {
        await this.cleanupApk(apkPath);
      }
    }
  }

  /**
   * Download APK
   */
  async downloadApk(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-mobile-"));
    const apkPath = path.join(tempDir, "accessibility-service.apk");

    try {
      const overridePath = this.getApkPathOverride();
      if (overridePath) {
        logger.info("Using local accessibility service APK", { path: overridePath });
        const stats = await fs.stat(overridePath);
        if (!stats.isFile()) {
          throw new Error(`Accessibility APK override is not a file: ${overridePath}`);
        }
        await fs.copyFile(overridePath, apkPath);
      } else {
        // Try to use prefetched APK first (already downloaded and validated at server startup)
        const usedPrefetch = await AndroidAccessibilityServiceManager.consumePrefetchedApk(apkPath);
        if (usedPrefetch) {
          logger.info("Using prefetched accessibility service APK", { path: apkPath });
        } else {
          logger.info("Downloading APK", { url: AndroidAccessibilityServiceManager.APK_URL, destination: apkPath });
          await this.downloadApkFromUrl(AndroidAccessibilityServiceManager.APK_URL, apkPath);
        }
      }

      // Verify the file exists and has reasonable size (should be > 10KB)
      const stats = await fs.stat(apkPath);
      if (stats.size < 10000) {
        throw new Error(`Downloaded APK is too small (${stats.size} bytes), likely invalid`);
      }

      this.verifyApkIntegrity(apkPath);

      const expectedChecksum = this.getExpectedChecksum();
      // Perform checksum verification (only if checksum is provided)
      if (expectedChecksum.length > 0) {
        const { checksum: actualChecksum, source } = await this.computeFileSha256(apkPath);
        const normalizedActual = actualChecksum.toLowerCase();
        const normalizedExpected = expectedChecksum.toLowerCase();

        if (normalizedActual !== normalizedExpected) {
          logger.warn("APK checksum verification failed", {
            expected: normalizedExpected,
            actual: normalizedActual
          });
          throw new Error(`APK checksum verification failed. Expected: ${normalizedExpected}, Got: ${normalizedActual}`);
        }

        logger.info("APK checksum verified successfully", { checksum: normalizedActual, source });
      } else {
        logger.warn("APK checksum verification SKIPPED - no checksum provided (development mode)", {
          apkUrl: AndroidAccessibilityServiceManager.APK_URL
        });
      }

      logger.info("APK downloaded successfully", { path: apkPath, size: stats.size });
      return apkPath;
    } catch (error) {
      // Clean up failed download
      try {
        await this.cleanupApk(apkPath);
      } catch {
      }

      throw new Error(`Failed to download APK: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async downloadApkFromUrl(url: string, destination: string): Promise<void> {
    try {
      await this.downloadWithCurl(url, destination);
      return;
    } catch (error) {
      if (!this.isCommandUnavailable(error, "curl")) {
        throw error;
      }
      logger.warn("curl unavailable, falling back to alternate downloader", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await this.downloadWithWget(url, destination);
      return;
    } catch (error) {
      if (!this.isCommandUnavailable(error, "wget")) {
        throw error;
      }
      logger.warn("wget unavailable, falling back to Node HTTP download", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await this.downloadWithNodeHttp(url, destination, 0);
  }

  private async downloadWithCurl(url: string, destination: string): Promise<void> {
    const command = `curl --fail --location --retry 3 --retry-delay 1 --silent --show-error -o "${destination}" "${url}"`;
    await this.execShell(command);
  }

  private async downloadWithWget(url: string, destination: string): Promise<void> {
    const command = `wget --tries=3 --timeout=30 -O "${destination}" "${url}"`;
    await this.execShell(command);
  }

  private async downloadWithNodeHttp(url: string, destination: string, redirectCount: number): Promise<void> {
    if (redirectCount > 5) {
      throw new Error(`Too many redirects while downloading ${url}`);
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const transport = url.startsWith("https:") ? https : http;
      const request = transport.get(
        url,
        { headers: { "User-Agent": "auto-mobile" } },
        response => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            const redirectedUrl = new URL(response.headers.location, url).toString();
            void this.downloadWithNodeHttp(redirectedUrl, destination, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (statusCode !== 200) {
            response.resume();
            reject(new Error(`Download failed with status ${statusCode} from ${url}`));
            return;
          }

          const fileStream = createWriteStream(destination);
          response.pipe(fileStream);
          fileStream.on("finish", () => fileStream.close(() => resolve()));
          fileStream.on("error", err => {
            fileStream.close();
            reject(err);
          });
        }
      );

      request.setTimeout(30000, () => {
        request.destroy(new Error(`Download request timed out for ${url}`));
      });
      request.on("error", reject);
    });
  }

  private isCommandUnavailable(error: unknown, command: string): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const err = error as NodeJS.ErrnoException & { stderr?: string };
    const numericCode = typeof err.code === "number" ? err.code : Number(err.code);
    if (err.code === "ENOENT" || (!Number.isNaN(numericCode) && numericCode === 127)) {
      return true;
    }

    const combinedMessage = `${err.message ?? ""} ${err.stderr ?? ""}`.toLowerCase();
    if (combinedMessage.includes("command not found") ||
      combinedMessage.includes("not recognized as an internal or external command") ||
      combinedMessage.includes(`${command}: not found`)) {
      return true;
    }

    return false;
  }

  private verifyApkIntegrity(apkPath: string): void {
    try {
      const zip = new AdmZip(apkPath);
      const entries = zip.getEntries();
      const hasManifest = entries.some(entry => entry.entryName === "AndroidManifest.xml");
      if (!hasManifest) {
        throw new Error("AndroidManifest.xml missing");
      }
    } catch (error) {
      throw new Error(`APK integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Install APK
   */
  async install(apkPath: string): Promise<void> {
    try {
      logger.info("Installing APK", { path: apkPath });

      const result = await this.adb.executeCommand(`install "${apkPath}"`);
      const resultString = result.toString().toLowerCase();

      if (resultString.includes("failure") || resultString.includes("error")) {
        throw new Error(`Installation failed: ${result.toString()}`);
      }

      if (!resultString.includes("success")) {
        logger.warn("Installation result unclear", { result: result.toString() });
      }

      logger.info("APK installed successfully");
    } catch (error) {
      throw new Error(`Failed to install APK: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enable Accessibility Service via adb settings commands
   */
  async enableViaSettings(): Promise<void> {
    // Check if settings toggle is supported
    const capabilities = await this.getToggleCapabilities();
    if (!capabilities.supportsSettingsToggle) {
      const errorMsg = `Settings-based accessibility toggle is not supported on this device. ${capabilities.reason || ""}`;
      logger.error("[ACCESSIBILITY_SERVICE] " + errorMsg, { capabilities });
      throw new Error(errorMsg);
    }

    try {
      logger.info("Enabling Accessibility Service via settings commands");

      // Get current enabled services
      const result = await this.adb.executeCommand("shell settings get secure enabled_accessibility_services");
      let currentServices = result.stdout.trim();

      // Issue #384: preserve existing enabled services; settings may return "null" or empty.
      if (currentServices === "null" || currentServices === "") {
        currentServices = "";
      }

      // Build the service component name
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Check if service is already in the list
      if (currentServices.includes(serviceComponent)) {
        logger.info("Accessibility Service is already enabled");
      } else {
        // Issue #384: append to the colon-separated list instead of overwriting other services.
        const updatedServices = currentServices
          ? `${currentServices}:${serviceComponent}`
          : serviceComponent;

        // Set updated list
        await this.adb.executeCommand(`shell settings put secure enabled_accessibility_services "${updatedServices}"`);
        logger.info("Added AutoMobile service to enabled_accessibility_services");
      }

      // Enable accessibility globally
      await this.adb.executeCommand("shell settings put secure accessibility_enabled 1");
      logger.info("Accessibility Service enabled successfully via settings");

      // Clear cache after enabling
      this.clearAvailabilityCache();
      // Also invalidate the accessibility detector cache so observe reports correct state
      this.getAccessibilityDetector().invalidateCache(this.device.deviceId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      // Categorize error types for clearer feedback
      if (errorLower.includes("permission denied") || errorLower.includes("not permitted")) {
        throw new Error(`Permission denied while enabling Accessibility Service. The device may require root access, device owner status, or special shell permissions. Original error: ${errorMsg}`);
      } else if (errorLower.includes("device not found") || errorLower.includes("no devices") || errorLower.includes("offline")) {
        throw new Error(`Device connection lost while enabling Accessibility Service. Ensure the device is connected and adb is responsive. Original error: ${errorMsg}`);
      } else if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
        throw new Error(`Timeout while enabling Accessibility Service. The device may be unresponsive. Original error: ${errorMsg}`);
      } else {
        throw new Error(`Failed to enable Accessibility Service via settings. This may indicate an ADB communication issue or device state problem. Original error: ${errorMsg}`);
      }
    }
  }

  /**
   * Disable Accessibility Service via adb settings commands
   */
  async disableViaSettings(): Promise<void> {
    // Check if settings toggle is supported
    const capabilities = await this.getToggleCapabilities();
    if (!capabilities.supportsSettingsToggle) {
      const errorMsg = `Settings-based accessibility toggle is not supported on this device. ${capabilities.reason || ""}`;
      logger.error("[ACCESSIBILITY_SERVICE] " + errorMsg, { capabilities });
      throw new Error(errorMsg);
    }

    try {
      logger.info("Disabling Accessibility Service via settings commands");

      // Get current enabled services
      const result = await this.adb.executeCommand("shell settings get secure enabled_accessibility_services");
      const currentServices = result.stdout.trim();

      // Handle null or empty values
      if (currentServices === "null" || currentServices === "") {
        logger.info("No accessibility services enabled");
        return;
      }

      // Parse service list
      // Issue #384: remove only the AutoMobile entry and preserve all other enabled services.
      const serviceList = currentServices.split(":");

      // Remove AutoMobile service from list
      const filteredServices = serviceList.filter(service => !service.includes(AndroidAccessibilityServiceManager.PACKAGE));

      // Check if service was in the list
      if (filteredServices.length === serviceList.length) {
        logger.info("Accessibility Service was not enabled");
      } else {
        // Set updated list
        const updatedServices = filteredServices.join(":");
        await this.adb.executeCommand(`shell settings put secure enabled_accessibility_services "${updatedServices}"`);
        logger.info("Removed AutoMobile service from enabled_accessibility_services");

        // Conditionally disable accessibility if no other services remain
        // Edge case: a trailing separator can yield [""]; treat it as no remaining services.
        if (filteredServices.length === 0 || (filteredServices.length === 1 && filteredServices[0] === "")) {
          await this.adb.executeCommand("shell settings put secure accessibility_enabled 0");
          logger.info("Disabled accessibility globally (no other services remain)");
        }
      }

      logger.info("Accessibility Service disabled successfully via settings");

      // Clear cache after disabling
      this.clearAvailabilityCache();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      // Categorize error types for clearer feedback
      if (errorLower.includes("permission denied") || errorLower.includes("not permitted")) {
        throw new Error(`Permission denied while disabling Accessibility Service. The device may require root access, device owner status, or special shell permissions. Original error: ${errorMsg}`);
      } else if (errorLower.includes("device not found") || errorLower.includes("no devices") || errorLower.includes("offline")) {
        throw new Error(`Device connection lost while disabling Accessibility Service. Ensure the device is connected and adb is responsive. Original error: ${errorMsg}`);
      } else if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
        throw new Error(`Timeout while disabling Accessibility Service. The device may be unresponsive. Original error: ${errorMsg}`);
      } else {
        throw new Error(`Failed to disable Accessibility Service via settings. This may indicate an ADB communication issue or device state problem. Original error: ${errorMsg}`);
      }
    }
  }

  /**
   * Enable Accessibility Service
   */
  async enable(): Promise<void> {
    return this.enableViaSettings();
  }

  /**
   * Enable Accessibility Service for a specific user profile via adb settings commands
   * @param userId - The Android user ID to enable for (e.g., 10 for work profile)
   */
  async enableForUser(userId: number): Promise<void> {
    // Check if settings toggle is supported
    const capabilities = await this.getToggleCapabilities();
    if (!capabilities.supportsSettingsToggle) {
      const errorMsg = `Settings-based accessibility toggle is not supported on this device. ${capabilities.reason || ""}`;
      logger.error("[ACCESSIBILITY_SERVICE] " + errorMsg, { capabilities });
      throw new Error(errorMsg);
    }

    try {
      logger.info(`[ACCESSIBILITY_SERVICE] Enabling Accessibility Service via settings commands for user ${userId}`);

      // Get current enabled services for this user
      const result = await this.adb.executeCommand(`shell settings --user ${userId} get secure enabled_accessibility_services`);
      let currentServices = result.stdout.trim();

      // Issue #384: preserve existing enabled services; settings may return "null" or empty.
      if (currentServices === "null" || currentServices === "") {
        currentServices = "";
      }

      // Build the service component name
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Check if service is already in the list
      if (currentServices.includes(serviceComponent)) {
        logger.info(`[ACCESSIBILITY_SERVICE] Accessibility Service is already enabled for user ${userId}`);
      } else {
        // Issue #384: append to the colon-separated list instead of overwriting other services.
        const updatedServices = currentServices
          ? `${currentServices}:${serviceComponent}`
          : serviceComponent;

        // Set updated list
        await this.adb.executeCommand(`shell settings --user ${userId} put secure enabled_accessibility_services "${updatedServices}"`);
        logger.info(`[ACCESSIBILITY_SERVICE] Added AutoMobile service to enabled_accessibility_services for user ${userId}`);
      }

      // Enable accessibility globally for this user
      await this.adb.executeCommand(`shell settings --user ${userId} put secure accessibility_enabled 1`);
      logger.info(`[ACCESSIBILITY_SERVICE] Accessibility Service enabled successfully via settings for user ${userId}`);

      // Clear cache after enabling (main user cache - per-user caching not implemented)
      this.clearAvailabilityCache();
      // Also invalidate the accessibility detector cache so observe reports correct state
      this.getAccessibilityDetector().invalidateCache(this.device.deviceId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      // Categorize error types for clearer feedback
      if (errorLower.includes("permission denied") || errorLower.includes("not permitted")) {
        throw new Error(`Permission denied while enabling Accessibility Service for user ${userId}. The device may require root access, device owner status, or special shell permissions. Original error: ${errorMsg}`);
      } else if (errorLower.includes("device not found") || errorLower.includes("no devices") || errorLower.includes("offline")) {
        throw new Error(`Device connection lost while enabling Accessibility Service for user ${userId}. Ensure the device is connected and adb is responsive. Original error: ${errorMsg}`);
      } else if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
        throw new Error(`Timeout while enabling Accessibility Service for user ${userId}. The device may be unresponsive. Original error: ${errorMsg}`);
      } else {
        throw new Error(`Failed to enable Accessibility Service via settings for user ${userId}. This may indicate an ADB communication issue or device state problem. Original error: ${errorMsg}`);
      }
    }
  }

  /**
   * Clean up temporary APK file
   */
  async cleanupApk(apkPath: string): Promise<void> {
    try {
      const tempRoot = path.resolve(os.tmpdir());
      const tempDir = path.resolve(path.dirname(apkPath));
      const tempBase = path.basename(tempDir);
      const relativeTempDir = path.relative(tempRoot, tempDir);
      const isTempDir = Boolean(relativeTempDir)
        && !relativeTempDir.startsWith("..")
        && !path.isAbsolute(relativeTempDir)
        && tempBase.startsWith("auto-mobile-");

      await fs.rm(apkPath, { force: true });
      if (isTempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
        logger.info("Temporary APK directory cleaned up", { path: tempDir });
      } else {
        logger.info("Temporary APK file cleaned up", { path: apkPath });
      }
    } catch (error) {
      logger.warn("Failed to clean up temporary APK file", {
        path: apkPath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Complete setup process for Accessibility Service
   */
  async setup(force: boolean = false, perf: PerformanceTracker = new NoOpPerformanceTracker()): Promise<AccessibilitySetupResult> {
    perf.serial("a11yServiceSetup");
    let apkPath: string | null = null;

    if (this.attemptedAutomatedSetup) {
      try {
        const [installed, enabled] = await perf.track("recheckStatus", async () => {
          return Promise.all([
            this.isInstalled(),
            this.isEnabled()
          ]);
        });
        if (installed && enabled) {
          perf.end();
          return {
            success: true,
            message: "Accessibility Service was already installed and has been activated",
            perfTiming: perf.getTimings(),
          };
        }
      } catch (error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Failed to re-check service status: ${error}`);
      }
      perf.end();
      return {
        success: false,
        message: "Setup already attempted",
        perfTiming: perf.getTimings(),
      };
    }

    try {
      const compatibilityResult = await perf.track("ensureCompatibleVersion", () => this.ensureCompatibleVersion());
      if (compatibilityResult.status === "failed") {
        perf.end();
        return {
          success: false,
          message: "Failed to ensure compatible Accessibility Service version",
          error: compatibilityResult.error || compatibilityResult.upgradeError || compatibilityResult.reinstallError,
          perfTiming: perf.getTimings(),
        };
      }
      if (compatibilityResult.status === "upgraded" || compatibilityResult.status === "reinstalled") {
        perf.end();
        return {
          success: true,
          message: "Accessibility Service upgraded to a compatible version",
          perfTiming: perf.getTimings(),
        };
      }

      // Check if already installed and setup (unless force is true)
      const isAlreadyInstalled = await perf.track("checkInstalled", () => this.isInstalled());
      const isAlreadyEnabled = await perf.track("checkEnabled", () => this.isEnabled());
      if (!force && isAlreadyInstalled && isAlreadyEnabled) {
        perf.end();
        return {
          success: true,
          message: "Accessibility Service was already installed and has been activated",
          perfTiming: perf.getTimings(),
        };
      }

      this.attemptedAutomatedSetup = true;
      // Download APK if not installed or force is true
      if (force || !isAlreadyInstalled) {
        apkPath = await perf.track("downloadApk", () => this.downloadApk());
        await perf.track("installApk", () => this.install(apkPath!));
      }

      // Enable if not enabled
      if (!isAlreadyEnabled) {
        await perf.track("enableService", () => this.enable());
      }

      perf.end();
      return {
        success: true,
        message: "Accessibility Service installed and activated successfully",
        perfTiming: perf.getTimings(),
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorLower = errorMsg.toLowerCase();

      // Provide categorized error messages for better debugging
      let message = "Failed to setup Accessibility Service";
      if (errorLower.includes("permission denied") || errorLower.includes("not permitted")) {
        message = "Failed to setup Accessibility Service due to permission error";
      } else if (errorLower.includes("device not found") || errorLower.includes("no devices") || errorLower.includes("offline")) {
        message = "Failed to setup Accessibility Service due to device connection issue";
      } else if (errorLower.includes("timeout") || errorLower.includes("timed out")) {
        message = "Failed to setup Accessibility Service due to timeout";
      } else if (errorLower.includes("download") || errorLower.includes("network") || errorLower.includes("unreachable")) {
        message = "Failed to setup Accessibility Service due to network/download error";
      } else if (errorLower.includes("not supported")) {
        message = "Failed to setup Accessibility Service - settings toggle not supported on this device";
      } else if (errorLower.includes("installation failed") || errorLower.includes("install")) {
        message = "Failed to setup Accessibility Service due to APK installation error";
      }

      perf.end();
      return {
        success: false,
        message,
        error: errorMsg,
        perfTiming: perf.getTimings(),
      };
    } finally {
      // Clean up APK file if it was downloaded
      if (apkPath) {
        await this.cleanupApk(apkPath);
      }
    }
  }

  /**
   * Detect if device is an emulator or physical device
   * Returns [isEmulator, hadError] tuple to track detection success
   */
  private async isEmulator(): Promise<[boolean, boolean]> {
    try {
      const result = await this.adb.executeCommand("shell getprop ro.kernel.qemu", undefined, undefined, true);
      const qemuProp = result.stdout.trim();
      // ro.kernel.qemu is "1" on emulators, empty or "0" on physical devices
      if (qemuProp === "1") {
        return [true, false];
      }

      // Fallback: check ro.product.model for common emulator strings
      const modelResult = await this.adb.executeCommand("shell getprop ro.product.model", undefined, undefined, true);
      const model = modelResult.stdout.trim().toLowerCase();
      return [model.includes("emulator") || model.includes("sdk"), false];
    } catch (error) {
      logger.warn("[ACCESSIBILITY_SERVICE] Error detecting device type", { error });
      // Default to physical device on error (more conservative), but mark as errored
      return [false, true];
    }
  }

  /**
   * Get device API level
   * Returns [apiLevel, hadError] tuple to track detection success
   */
  private async getApiLevel(): Promise<[number | null, boolean]> {
    try {
      const result = await this.adb.executeCommand("shell getprop ro.build.version.sdk", undefined, undefined, true);
      const apiLevel = parseInt(result.stdout.trim(), 10);
      return [isNaN(apiLevel) ? null : apiLevel, false];
    } catch (error) {
      logger.warn("[ACCESSIBILITY_SERVICE] Error getting API level", { error });
      return [null, true];
    }
  }

  /**
   * Check if the device supports programmatic accessibility toggle via settings commands
   * @returns Promise<boolean> - True if settings-based toggle is supported
   */
  async canUseSettingsToggle(): Promise<boolean> {
    const capabilities = await this.getToggleCapabilities();
    return capabilities.supportsSettingsToggle;
  }

  /**
   * Get detailed capabilities for accessibility service toggling
   * @returns Promise<ToggleCapabilities> - Capability information including device type and reason if unavailable
   */
  async getToggleCapabilities(): Promise<ToggleCapabilities> {
    // Return cached result if available
    if (this.cachedToggleCapabilities) {
      logger.info("[ACCESSIBILITY_SERVICE] Using cached toggle capabilities");
      return this.cachedToggleCapabilities;
    }

    logger.info("[ACCESSIBILITY_SERVICE] Detecting toggle capabilities");

    const [isEmulator, emulatorDetectionError] = await this.isEmulator();
    const [apiLevel, apiLevelDetectionError] = await this.getApiLevel();
    const deviceType = isEmulator ? "emulator" : "physical";

    let supportsSettingsToggle = false;
    let reason: string | undefined;

    // If we had detection errors, don't make definitive claims about support
    const hadDetectionError = emulatorDetectionError || apiLevelDetectionError;

    if (hadDetectionError) {
      supportsSettingsToggle = false;
      reason = "Unable to detect device capabilities due to transient error. Retry may succeed.";
      logger.warn("[ACCESSIBILITY_SERVICE] Detection error - not caching result", {
        emulatorDetectionError,
        apiLevelDetectionError
      });
    } else if (isEmulator) {
      // Emulators generally support settings-based toggle
      supportsSettingsToggle = true;
      logger.info("[ACCESSIBILITY_SERVICE] Emulator detected - settings toggle supported");
    } else {
      // Physical devices may require special permissions
      supportsSettingsToggle = false;
      reason = "Physical devices may require root, device owner status, or special shell permissions for programmatic accessibility toggle";
      logger.info("[ACCESSIBILITY_SERVICE] Physical device detected - settings toggle may not be supported", { reason });
    }

    // Additional API level checks could be added here if needed
    if (!hadDetectionError && apiLevel !== null && apiLevel < 16) {
      supportsSettingsToggle = false;
      reason = `API level ${apiLevel} is too old (requires API 16+)`;
      logger.warn("[ACCESSIBILITY_SERVICE] API level too old for settings toggle", { apiLevel });
    }

    const capabilities: ToggleCapabilities = {
      supportsSettingsToggle,
      deviceType,
      apiLevel,
      reason
    };

    // Only cache if we successfully detected capabilities without errors
    // This prevents transient errors from creating sticky false negatives
    if (!hadDetectionError) {
      this.cachedToggleCapabilities = capabilities;
      logger.info("[ACCESSIBILITY_SERVICE] Toggle capabilities detected and cached", capabilities);
    } else {
      logger.info("[ACCESSIBILITY_SERVICE] Toggle capabilities detected but not cached due to detection errors", capabilities);
    }

    return capabilities;
  }

  private async getInstalledApkSha256WithDetails(): Promise<InstalledApkSha256Result> {
    const apkPath = await this.getInstalledApkPath();
    if (!apkPath) {
      return {
        sha256: null,
        source: "none",
        error: "Installed APK path not found"
      };
    }

    try {
      const shaResult = await this.adb.executeCommand(`shell sha256sum "${apkPath}"`);
      const sha256 = shaResult.stdout.trim().split(/\s+/)[0];
      if (sha256) {
        return {
          sha256,
          source: "device",
          apkPath
        };
      }
    } catch (error) {
      logger.warn("[ACCESSIBILITY_SERVICE] sha256sum unavailable or failed, falling back to host hash", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-mobile-apk-"));
    const safeDeviceId = (this.device.deviceId || "device").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const localApkPath = path.join(tempDir, `accessibility-service-installed-${safeDeviceId}.apk`);

    try {
      await this.adb.executeCommand(`pull "${apkPath}" "${localApkPath}"`);
      const apkBuffer = await fs.readFile(localApkPath);
      const sha256 = crypto.createHash("sha256").update(apkBuffer).digest("hex");
      return {
        sha256,
        source: "host",
        apkPath
      };
    } catch (error) {
      return {
        sha256: null,
        source: "none",
        apkPath,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
      }
    }
  }

  private async getInstalledApkPath(): Promise<string | null> {
    try {
      const pathResult = await this.adb.executeCommand(
        `shell pm path ${AndroidAccessibilityServiceManager.PACKAGE}`,
        undefined,
        undefined,
        true
      );
      const line = pathResult.stdout
        .split("\n")
        .map(entry => entry.trim())
        .find(entry => entry.startsWith("package:"));

      if (!line) {
        return null;
      }

      return line.replace("package:", "").trim() || null;
    } catch (error) {
      logger.warn("[ACCESSIBILITY_SERVICE] Failed to resolve installed APK path", {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private getExpectedChecksum(): string {
    if (this.shouldSkipChecksum()) {
      return "";
    }
    return AndroidAccessibilityServiceManager.expectedChecksumOverride ?? APK_SHA256_CHECKSUM;
  }

  private isNetworkError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("could not resolve host") ||
      normalized.includes("failed to connect") ||
      normalized.includes("network is unreachable") ||
      normalized.includes("connection timed out") ||
      normalized.includes("timed out") ||
      normalized.includes("name lookup timed out") ||
      normalized.includes("temporary failure in name resolution") ||
      normalized.includes("enotfound") ||
      normalized.includes("econnrefused") ||
      normalized.includes("ehostunreach") ||
      normalized.includes("enetunreach") ||
      normalized.includes("etimedout")
    );
  }

  private getApkPathOverride(): string | null {
    const override = process.env.AUTOMOBILE_ACCESSIBILITY_APK_PATH;
    if (!override) {
      return null;
    }
    const trimmed = override.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private shouldSkipChecksum(): boolean {
    // @deprecated AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK - use AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM instead
    const explicitSkip = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM ??
      process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK;
    if (explicitSkip && (explicitSkip === "1" || explicitSkip.toLowerCase() === "true")) {
      return true;
    }
    return this.getApkPathOverride() !== null;
  }

  private shouldSkipDownloadIfInstalled(): boolean {
    const skipEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED;
    return Boolean(skipEnv && (skipEnv === "1" || skipEnv.toLowerCase() === "true"));
  }
}
