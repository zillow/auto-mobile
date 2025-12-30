import { AdbClient } from "./android-cmdline-tools/AdbClient";
import { logger } from "./logger";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { LaunchApp } from "../features/action/LaunchApp";
import { TapOnElement } from "../features/action/TapOnElement";
import { PressButton } from "../features/action/PressButton";
import { TerminateApp } from "../features/action/TerminateApp";
import { BootedDevice } from "../models";
import { APK_URL, APK_SHA256_CHECKSUM } from "../constants/release";

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
  downloadApk(): Promise<string>;
  install(apkPath: string): Promise<void>;
  enable(): Promise<void>;
  cleanupApk(apkPath: string): Promise<void>;
}

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
   * Download APK
   */
  async downloadApk(): Promise<string> {
    const tempDir = "/tmp/auto-mobile/";
    const apkPath = path.join(tempDir, `accessibility-service.apk`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      logger.info("Downloading APK", { url: AndroidAccessibilityServiceManager.APK_URL, destination: apkPath });

      // Use curl to download the APK
      const { stderr } = await execAsync(`curl -L -o "${apkPath}" "${AndroidAccessibilityServiceManager.APK_URL}"`);

      if (stderr && !stderr.includes("100")) {
        logger.warn("Download may have failed", { stderr });
      }

      // Verify the file exists and has reasonable size (should be > 10KB)
      const stats = await fs.stat(apkPath);
      if (stats.size < 10000) {
        throw new Error(`Downloaded APK is too small (${stats.size} bytes), likely invalid`);
      }

      // Perform checksum verification (only if checksum is provided)
      if (APK_SHA256_CHECKSUM.length > 0) {
        const { stdout: sha256sum } = await execAsync(`sha256sum "${apkPath}"`);
        const actualChecksum = sha256sum.split(" ")[0];

        if (actualChecksum !== APK_SHA256_CHECKSUM) {
          logger.warn("APK checksum verification failed", {
            expected: APK_SHA256_CHECKSUM,
            actual: actualChecksum
          });
          throw new Error(`APK checksum verification failed. Expected: ${APK_SHA256_CHECKSUM}, Got: ${actualChecksum}`);
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
   * Enable Accessibility Service
   */
  async enable(): Promise<void> {
    try {
      logger.info("Enabling Accessibility Service input method");

      await new TerminateApp(this.device).execute(AndroidAccessibilityServiceManager.PACKAGE);

      await new LaunchApp(this.device).execute(
        AndroidAccessibilityServiceManager.PACKAGE,
        false,
        false,
        AndroidAccessibilityServiceManager.ACTIVITY
      );

      await new TapOnElement(this.device).execute({
        text: "Open Accessibility Settings",
        action: "tap"
      });

      await new TapOnElement(this.device).execute({
        text: "AutoMobile A11Y Service",
        action: "tap"
      });

      await new TapOnElement(this.device).execute({
        text: "Use AutoMobile A11Y Service",
        action: "tap"
      });

      await new TapOnElement(this.device).execute({
        elementId: "android:id/accessibility_permission_enable_allow_button",
        action: "tap"
      });

      await new PressButton(this.device).execute("back");
      await new PressButton(this.device).execute("back");
      await new PressButton(this.device).execute("back");

      logger.info("Accessibility Service enabled successfully");
    } catch (error) {
      throw new Error(`Failed to enable Accessibility Service: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      return {
        success: false,
        message: "Setup already attempted",
      };
    }

    try {
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
}
