import { BootedDevice, ActionableError } from "../../models";
import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { AndroidEmulatorClient } from "../../utils/android-cmdline-tools/AndroidEmulatorClient";
import { SnapshotStorage, SnapshotManifest } from "../../utils/snapshotStorage";
import { logger } from "../../utils/logger";
import { promises as fs } from "fs";
import * as path from "path";

export interface CaptureSnapshotArgs {
  snapshotName?: string;
  includeAppData?: boolean;
  includeSettings?: boolean;
  useVmSnapshot?: boolean;
}

export interface CaptureSnapshotResult {
  snapshotName: string;
  timestamp: string;
  snapshotType: "vm" | "adb";
  manifest: SnapshotManifest;
}

/**
 * Capture device state snapshot
 * Supports VM snapshots for emulators and ADB-based capture for all devices
 */
export class CaptureSnapshot {
  private device: BootedDevice;
  private adb: AdbClient;
  private emulator: AndroidEmulatorClient;
  private storage: SnapshotStorage;

  constructor(device: BootedDevice, adb?: AdbClient, emulator?: AndroidEmulatorClient) {
    if (device.platform !== "android") {
      throw new ActionableError("Snapshot capture is currently only supported for Android devices");
    }

    this.device = device;
    this.adb = adb || new AdbClient(device);
    this.emulator = emulator || new AndroidEmulatorClient();
    this.storage = new SnapshotStorage();
  }

  /**
   * Execute snapshot capture
   */
  async execute(args: CaptureSnapshotArgs): Promise<CaptureSnapshotResult> {
    const {
      snapshotName: userProvidedName,
      includeAppData = true,
      includeSettings = true,
      useVmSnapshot = true
    } = args;

    // Generate snapshot name if not provided
    const snapshotName = userProvidedName || this.storage.generateSnapshotName(this.device.name);

    // Check if snapshot already exists
    if (await this.storage.snapshotExists(snapshotName)) {
      throw new ActionableError(`Snapshot '${snapshotName}' already exists. Please choose a different name or delete the existing snapshot.`);
    }

    logger.info(`Capturing snapshot '${snapshotName}' for device ${this.device.deviceId}`);

    // Determine if we can use VM snapshot
    const isEmulator = this.device.deviceId.startsWith("emulator-");
    const shouldUseVmSnapshot = useVmSnapshot && isEmulator;

    let manifest: SnapshotManifest;

    if (shouldUseVmSnapshot) {
      manifest = await this.captureVmSnapshot(snapshotName, includeSettings);
    } else {
      manifest = await this.captureAdbSnapshot(snapshotName, includeAppData, includeSettings);
    }

    // Save manifest
    await this.storage.saveManifest(manifest);

    logger.info(`Snapshot '${snapshotName}' captured successfully (type: ${manifest.snapshotType})`);

    return {
      snapshotName: manifest.snapshotName,
      timestamp: manifest.timestamp,
      snapshotType: manifest.snapshotType,
      manifest
    };
  }

  /**
   * Capture VM snapshot using emulator console
   */
  private async captureVmSnapshot(
    snapshotName: string,
    includeSettings: boolean
  ): Promise<SnapshotManifest> {
    logger.info(`Using VM snapshot for emulator ${this.device.deviceId}`);

    try {
      // Save VM snapshot using ADB emu command
      const saveCommand = `emu avd snapshot save ${snapshotName}`;
      logger.info(`Executing: adb -s ${this.device.deviceId} ${saveCommand}`);

      const result = await this.adb.executeCommand(saveCommand);

      if (result.stderr && result.stderr.includes("KO")) {
        throw new Error(`VM snapshot failed: ${result.stderr}`);
      }

      logger.info(`VM snapshot saved successfully`);

      // Capture settings if requested (VM snapshot doesn't include this metadata)
      let settings;
      if (includeSettings) {
        settings = await this.captureSettings();
      }

      // Get foreground app
      const foregroundApp = await this.getForegroundApp();

      // Create manifest
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: this.device.deviceId,
        deviceName: this.device.name,
        platform: "android",
        snapshotType: "vm",
        includeAppData: true, // VM snapshot includes everything
        includeSettings: includeSettings,
        foregroundApp,
        settings
      };

      return manifest;
    } catch (error) {
      logger.error(`Failed to capture VM snapshot: ${error}`);
      throw new ActionableError(`Failed to capture VM snapshot: ${error}`);
    }
  }

  /**
   * Capture ADB-based snapshot
   */
  private async captureAdbSnapshot(
    snapshotName: string,
    includeAppData: boolean,
    includeSettings: boolean
  ): Promise<SnapshotManifest> {
    logger.info(`Using ADB-based snapshot for device ${this.device.deviceId}`);

    try {
      // Get list of installed packages
      const packages = await this.getInstalledPackages();
      logger.info(`Found ${packages.length} installed packages`);

      // Capture settings if requested
      let settings;
      if (includeSettings) {
        settings = await this.captureSettings();
        await this.saveSettings(snapshotName, settings);
      }

      // Capture app data if requested
      if (includeAppData) {
        await this.captureAppData(snapshotName, packages);
      }

      // Get foreground app
      const foregroundApp = await this.getForegroundApp();

      // Create manifest
      const manifest: SnapshotManifest = {
        snapshotName,
        timestamp: new Date().toISOString(),
        deviceId: this.device.deviceId,
        deviceName: this.device.name,
        platform: "android",
        snapshotType: "adb",
        includeAppData,
        includeSettings,
        packages,
        foregroundApp,
        settings
      };

      return manifest;
    } catch (error) {
      logger.error(`Failed to capture ADB snapshot: ${error}`);
      throw new ActionableError(`Failed to capture ADB snapshot: ${error}`);
    }
  }

  /**
   * Get list of installed packages
   */
  private async getInstalledPackages(): Promise<string[]> {
    const result = await this.adb.executeCommand("shell pm list packages");
    return result.stdout
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("package:"))
      .map(line => line.replace("package:", ""));
  }

  /**
   * Get currently foreground app
   */
  private async getForegroundApp(): Promise<string | undefined> {
    try {
      const foregroundApp = await this.adb.getForegroundApp();
      return foregroundApp?.packageName;
    } catch (error) {
      logger.warn(`Failed to get foreground app: ${error}`);
      return undefined;
    }
  }

  /**
   * Capture device settings
   */
  private async captureSettings(): Promise<{
    global: Record<string, string>;
    secure: Record<string, string>;
    system: Record<string, string>;
  }> {
    logger.info("Capturing device settings");

    const settingsTypes = ["global", "secure", "system"];
    const settings: any = {};

    for (const type of settingsTypes) {
      try {
        const result = await this.adb.executeCommand(`shell settings list ${type}`);
        settings[type] = this.parseSettings(result.stdout);
        logger.info(`Captured ${Object.keys(settings[type]).length} ${type} settings`);
      } catch (error) {
        logger.warn(`Failed to capture ${type} settings: ${error}`);
        settings[type] = {};
      }
    }

    return settings;
  }

  /**
   * Parse settings output into key-value pairs
   */
  private parseSettings(output: string): Record<string, string> {
    const settings: Record<string, string> = {};

    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {continue;}

      const match = trimmed.match(/^(.+?)=(.*)$/);
      if (match) {
        settings[match[1]] = match[2];
      }
    }

    return settings;
  }

  /**
   * Save settings to snapshot directory
   */
  private async saveSettings(
    snapshotName: string,
    settings: any
  ): Promise<void> {
    // Ensure snapshot directory exists before writing
    const snapshotDir = this.storage.getSnapshotPath(snapshotName);
    await fs.mkdir(snapshotDir, { recursive: true });

    const settingsPath = this.storage.getSettingsPath(snapshotName);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    logger.info(`Saved settings to ${settingsPath}`);
  }

  /**
   * Capture app data using adb backup
   */
  private async captureAppData(snapshotName: string, packages: string[]): Promise<void> {
    logger.info(`Capturing app data for ${packages.length} packages`);

    const appDataPath = this.storage.getAppDataPath(snapshotName);
    await fs.mkdir(appDataPath, { recursive: true });

    // Note: adb backup requires interactive confirmation on device
    // For a production implementation, we'd use adb pull with appropriate permissions
    // For now, we'll save package list and app paths for restoration
    const packageListPath = path.join(appDataPath, "packages.txt");
    await fs.writeFile(packageListPath, packages.join("\n"), "utf-8");

    logger.info(`Saved package list to ${packageListPath}`);
    logger.info(`App data backup requires root access or adb backup confirmation`);
  }
}
