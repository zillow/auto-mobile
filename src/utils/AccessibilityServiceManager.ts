import { AdbClient } from "./android-cmdline-tools/AdbClient";
import { logger } from "./logger";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { BootedDevice } from "../models";
import { APK_URL, APK_SHA256_CHECKSUM } from "../constants/release";
import crypto from "crypto";
import os from "os";

const execAsync = promisify(exec);

/**
 * Interface for accessibility service management
 */
export interface AccessibilityServiceManager {
  setup(force?: boolean): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }>;
  isInstalled(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  getInstalledApkSha256(): Promise<string | null>;
  isVersionCompatible(): Promise<boolean>;
  ensureCompatibleVersion(): Promise<AccessibilityVersionCheckResult>;
  downloadApk(): Promise<string>;
  install(apkPath: string): Promise<void>;
  enable(): Promise<void>;
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

type InstalledApkSha256Result = {
  sha256: string | null;
  source: "device" | "host" | "none";
  apkPath?: string;
  error?: string;
};

export class AndroidAccessibilityServiceManager implements AccessibilityServiceManager {
  private readonly device: BootedDevice;
  private adb: AdbClient;
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

  private attemptedAutomatedSetup: boolean = false;
  private static instances: Map<string, AndroidAccessibilityServiceManager> = new Map();
  private static expectedChecksumOverride: string | null = null;

  private constructor(device: BootedDevice, adb: AdbClient) {
    // home should either be process.env.HOME or bash resolution of home for current user
    const homeDir = process.env.HOME || require("os").homedir();
    if (!homeDir) {
      throw new Error("Home directory for current user not found");
    }
    this.device = device;
    this.adb = adb || new AdbClient(this.device);
  }

  public static getInstance(device: BootedDevice, adb: AdbClient | null = null): AndroidAccessibilityServiceManager {
    if (!AndroidAccessibilityServiceManager.instances.has(device.deviceId)) {
      AndroidAccessibilityServiceManager.instances.set(device.deviceId, new AndroidAccessibilityServiceManager(
        device,
        adb || new AdbClient(device)
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

  public static setExpectedChecksumForTesting(checksum: string | null): void {
    AndroidAccessibilityServiceManager.expectedChecksumOverride = checksum;
  }

  /**
   * Clear the cached availability status
   */
  public clearAvailabilityCache(): void {
    this.cachedAvailability = null;
    this.cachedInstallation = null;
    this.cachedEnabled = null;
    logger.info("[ACCESSIBILITY_SERVICE] Cleared all availability caches");
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
    const tempDir = "/tmp/auto-mobile/";
    const apkPath = path.join(tempDir, `accessibility-service.apk`);
    await fs.mkdir(tempDir, { recursive: true });

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
        logger.info("Downloading APK", { url: AndroidAccessibilityServiceManager.APK_URL, destination: apkPath });

        // Use curl to download the APK
        const { stderr } = await execAsync(`curl -L -o "${apkPath}" "${AndroidAccessibilityServiceManager.APK_URL}"`);

        if (stderr && !stderr.includes("100")) {
          logger.warn("Download may have failed", { stderr });
        }
      }

      // Verify the file exists and has reasonable size (should be > 10KB)
      const stats = await fs.stat(apkPath);
      if (stats.size < 10000) {
        throw new Error(`Downloaded APK is too small (${stats.size} bytes), likely invalid`);
      }

      const expectedChecksum = this.getExpectedChecksum();
      // Perform checksum verification (only if checksum is provided)
      if (expectedChecksum.length > 0) {
        const { stdout: sha256sum } = await execAsync(`sha256sum "${apkPath}"`);
        const actualChecksum = sha256sum.split(" ")[0];

        if (actualChecksum !== expectedChecksum) {
          logger.warn("APK checksum verification failed", {
            expected: expectedChecksum,
            actual: actualChecksum
          });
          throw new Error(`APK checksum verification failed. Expected: ${expectedChecksum}, Got: ${actualChecksum}`);
        }

        logger.info("APK checksum verified successfully", { checksum: actualChecksum });
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
        await fs.unlink(apkPath);
      } catch {
      }

      throw new Error(`Failed to download APK: ${error instanceof Error ? error.message : String(error)}`);
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
    try {
      logger.info("Enabling Accessibility Service via settings commands");

      // Get current enabled services
      const result = await this.adb.executeCommand("shell settings get secure enabled_accessibility_services");
      let currentServices = result.stdout.trim();

      // Handle null or empty values
      if (currentServices === "null" || currentServices === "") {
        currentServices = "";
      }

      // Build the service component name
      const serviceComponent = `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`;

      // Check if service is already in the list
      if (currentServices.includes(serviceComponent)) {
        logger.info("Accessibility Service is already enabled");
      } else {
        // Append service to list (colon-separated)
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
    } catch (error) {
      throw new Error(`Failed to enable Accessibility Service via settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disable Accessibility Service via adb settings commands
   */
  async disableViaSettings(): Promise<void> {
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
        if (filteredServices.length === 0 || (filteredServices.length === 1 && filteredServices[0] === "")) {
          await this.adb.executeCommand("shell settings put secure accessibility_enabled 0");
          logger.info("Disabled accessibility globally (no other services remain)");
        }
      }

      logger.info("Accessibility Service disabled successfully via settings");

      // Clear cache after disabling
      this.clearAvailabilityCache();
    } catch (error) {
      throw new Error(`Failed to disable Accessibility Service via settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Enable Accessibility Service
   */
  async enable(): Promise<void> {
    return this.enableViaSettings();
  }

  /**
   * Clean up temporary APK file
   */
  async cleanupApk(apkPath: string): Promise<void> {
    try {
      await fs.unlink(apkPath);
      logger.info("Temporary APK file cleaned up", { path: apkPath });
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
  async setup(force: boolean = false): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    let apkPath: string | null = null;
    if (this.attemptedAutomatedSetup) {
      try {
        const [installed, enabled] = await Promise.all([
          this.isInstalled(),
          this.isEnabled()
        ]);
        if (installed && enabled) {
          return {
            success: true,
            message: "Accessibility Service was already installed and has been activated",
          };
        }
      } catch (error) {
        logger.warn(`[ACCESSIBILITY_SERVICE] Failed to re-check service status: ${error}`);
      }
      return {
        success: false,
        message: "Setup already attempted",
      };
    }

    try {
      const compatibilityResult = await this.ensureCompatibleVersion();
      if (compatibilityResult.status === "failed") {
        return {
          success: false,
          message: "Failed to ensure compatible Accessibility Service version",
          error: compatibilityResult.error || compatibilityResult.upgradeError || compatibilityResult.reinstallError
        };
      }
      if (compatibilityResult.status === "upgraded" || compatibilityResult.status === "reinstalled") {
        return {
          success: true,
          message: "Accessibility Service upgraded to a compatible version",
        };
      }

      // Check if already installed and setup (unless force is true)
      if (!force && await this.isInstalled() && await this.isEnabled()) {
        return {
          success: true,
          message: "Accessibility Service was already installed and has been activated",
        };
      }

      this.attemptedAutomatedSetup = true;
      // Download APK if not installed or force is true
      if (force || !await this.isInstalled()) {
        apkPath = await this.downloadApk();
        await this.install(apkPath);
      }

      // Enable if not enabled
      if (!await this.isEnabled()) {
        await this.enable();
      }

      return {
        success: true,
        message: "Accessibility Service installed and activated successfully",
      };

    } catch (error) {
      return {
        success: false,
        message: "Failed to setup Accessibility Service",
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // Clean up APK file if it was downloaded
      if (apkPath) {
        await this.cleanupApk(apkPath);
      }
    }
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
      normalized.includes("temporary failure in name resolution")
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
    const explicitSkip = process.env.AUTO_MOBILE_ACCESSIBILITY_SERVICE_SHA_SKIP_CHECK;
    if (explicitSkip && explicitSkip.toLowerCase() === "true") {
      return true;
    }
    const skipEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM;
    if (skipEnv && (skipEnv === "1" || skipEnv.toLowerCase() === "true")) {
      return true;
    }
    return this.getApkPathOverride() !== null;
  }

  private shouldSkipDownloadIfInstalled(): boolean {
    const skipEnv = process.env.AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED;
    return Boolean(skipEnv && (skipEnv === "1" || skipEnv.toLowerCase() === "true"));
  }
}
