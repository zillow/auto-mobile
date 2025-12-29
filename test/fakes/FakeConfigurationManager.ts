/**
 * Fake configuration manager implementation for testing
 * Stores configurations in memory instead of persisting to disk
 */
import { ConfigurationManager } from "../../src/utils/interfaces/ConfigurationManager";
import { AppSourceConfig } from "../../src/utils/configurationManager";
import { BootedDevice, DeviceConfig } from "../../src/models";
import { DeviceSessionArgs } from "../../src/server/configurationTools";

export class FakeConfigurationManager implements ConfigurationManager {
  private deviceSessionConfigs: Map<string, DeviceConfig> = new Map();
  private appSourceConfigs: Map<string, AppSourceConfig> = new Map();

  /**
   * Set an app source configuration
   */
  async setAppSource(
    appId: string,
    sourceDir: string,
    platform: "android" | "ios",
    wipeData: boolean
  ): Promise<void> {
    const existing = this.appSourceConfigs.get(appId);
    const newMap = new Map<string, string>();
    const data = wipeData ? newMap : (existing?.data || newMap);
    this.appSourceConfigs.set(appId, { appId, sourceDir, platform, data });
  }

  /**
   * Set an Android app data key-value pair
   */
  async setAndroidAppDataKey(appId: string, key: string, value: string): Promise<void> {
    const existing = this.appSourceConfigs.get(appId);
    const newMap = new Map<string, string>();
    const data = existing?.data || newMap;
    const sourceDir = existing?.sourceDir || "";
    const platform = "android" as const;
    data.set(key, value);
    this.appSourceConfigs.set(appId, { appId, sourceDir, platform, data });
  }

  /**
   * Get all app configurations
   */
  getAppConfigs(): AppSourceConfig[] {
    return Array.from(this.appSourceConfigs.values());
  }

  /**
   * Get configuration for a specific app
   */
  getConfigForApp(appId: string): AppSourceConfig | undefined {
    return this.appSourceConfigs.get(appId);
  }

  /**
   * Load configuration from disk on server startup
   * No-op for fake implementation
   */
  async loadFromDisk(): Promise<void> {
    // no-op for fake implementation
  }

  /**
   * Save configuration to disk
   * No-op for fake implementation
   */
  async saveToDisk(): Promise<void> {
    // no-op for fake implementation
  }

  /**
   * Update device session configuration
   */
  async updateDeviceSession(
    args: DeviceSessionArgs,
    platform: "android" | "ios"
  ): Promise<void> {
    let newConfig: DeviceConfig | undefined;
    if (args.testAuthoring) {
      newConfig = {
        platform: platform,
        activeMode: "testAuthoring",
        deviceId: args.deviceId,
        testAuthoring: {
          appId: args.testAuthoring.appId,
          description: args.testAuthoring.description,
          persist: args.testAuthoring.persist
        }
      };
    } else if (args.exploration) {
      newConfig = {
        platform: platform,
        activeMode: "exploration",
        deviceId: args.deviceId,
        exploration: {
          deepLinkSkipping: args.exploration.deepLinkSkipping
        }
      };
    }

    if (newConfig) {
      this.deviceSessionConfigs.set(args.deviceId, newConfig);
    }
  }

  /**
   * Get all device configurations
   */
  getDeviceConfigs(): DeviceConfig[] {
    return Array.from(this.deviceSessionConfigs.values());
  }

  /**
   * Get configuration for a specific device
   */
  getConfigForDevice(device: BootedDevice): DeviceConfig | undefined {
    return this.deviceSessionConfigs.get(device.deviceId);
  }

  /**
   * Check if test authoring is enabled for a device
   */
  isTestAuthoringEnabled(device: BootedDevice): boolean {
    return this.getConfigForDevice(device)?.activeMode === "testAuthoring";
  }

  /**
   * Reset configuration to defaults
   */
  async resetServerConfig(): Promise<void> {
    this.deviceSessionConfigs.clear();
    this.appSourceConfigs.clear();
  }

  // Test helper methods

  /**
   * Clear all app source configurations
   */
  clearAppConfigs(): void {
    this.appSourceConfigs.clear();
  }

  /**
   * Clear all device session configurations
   */
  clearDeviceConfigs(): void {
    this.deviceSessionConfigs.clear();
  }

  /**
   * Clear all configurations
   */
  clearAll(): void {
    this.clearAppConfigs();
    this.clearDeviceConfigs();
  }

  /**
   * Get raw app source configs map for testing
   */
  getRawAppConfigs(): Map<string, AppSourceConfig> {
    return this.appSourceConfigs;
  }

  /**
   * Get raw device session configs map for testing
   */
  getRawDeviceConfigs(): Map<string, DeviceConfig> {
    return this.deviceSessionConfigs;
  }

  /**
   * Directly set a device config (for testing)
   */
  setDeviceConfig(deviceId: string, config: DeviceConfig): void {
    this.deviceSessionConfigs.set(deviceId, config);
  }

  /**
   * Directly set an app config (for testing)
   */
  setAppConfig(appId: string, config: AppSourceConfig): void {
    this.appSourceConfigs.set(appId, config);
  }
}
