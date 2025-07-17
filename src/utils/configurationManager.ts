import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger";
import { ActionableError, AppConfig, DeviceConfig } from "../models";
import { DeviceSessionArgs } from "../server/configurationTools";

export class ConfigurationManager {
  private readonly configFilePath: string;
  private static instance: ConfigurationManager;
  private deviceSessionConfigs: Map<string, DeviceConfig> = new Map();
  private appSourceConfigs: Map<string, AppConfig> = new Map();

  private constructor() {
    // home should either be process.env.HOME or bash resolution of home for current user
    const homeDir = process.env.HOME || require("os").homedir();
    if (!homeDir) {
      throw new Error("Home directory for current user not found");
    }
    this.configFilePath = path.join(homeDir, ".auto-mobile", "config.json");
    this.ensureDirectoriesExist();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  // ===========================================
  // App Configuration Management
  // ===========================================

  private ensureDirectoriesExist(): void {
    const baseDir = path.dirname(this.configFilePath);
    if (!require("fs").existsSync(baseDir)) {
      require("fs").mkdirSync(baseDir, { recursive: true });
    }
  }

  /**
   * Set an app source configuration
   */
  public async setAppSource(appId: string, sourceDir: string, platform: "android" | "ios", wipeData: boolean): Promise<void> {
    if (!require("fs").existsSync(sourceDir)) {
      throw new ActionableError(`Source directory does not exist: ${sourceDir}`);
    }

    const existing = this.appSourceConfigs.get(appId);
    const newMap = new Map<string, string>();
    const data = wipeData ? newMap : (existing?.data || newMap);
    this.appSourceConfigs.set(appId, { appId, sourceDir, platform, data });
    await this.saveAppConfigs();

    logger.debug(`[SOURCE] Set app source: ${appId} -> ${sourceDir}`);
  }

  /**
   * Set an app source configuration
   */
  public async setAndroidAppDataKey(appId: string, key: string, value: string): Promise<void> {
    const existing = this.appSourceConfigs.get(appId);
    const newMap = new Map<string, string>();
    const data = existing?.data || newMap;
    const sourceDir = existing?.sourceDir || "";
    const platform = "android";
    data.set(key, value);
    this.appSourceConfigs.set(appId, { appId, sourceDir, platform, data });
    await this.saveAppConfigs();

    logger.debug(`[SOURCE] Set Android app data key: ${appId} -> ${sourceDir}`);
  }

  /**
   * Get all app configurations
   */
  public getAppConfigs(): AppConfig[] {
    return Array.from(this.appSourceConfigs.values());
  }

  public getConfigForApp(appId: string): AppConfig | undefined {
    return this.appSourceConfigs.get(appId);
  }

  /**
     * Load configuration from disk on server startup
     */
  public async loadFromDisk(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configFilePath, "utf8");
      const parsedData = JSON.parse(configData);
      if (parsedData.devices) {
        for (const config of parsedData.devices) {
          if (typeof config === "object" && config !== null && !Array.isArray(config) && config.deviceId) {
            this.deviceSessionConfigs.set(config.deviceId, config);
          }
        }
      }
      if (parsedData.apps) {
        for (const config of parsedData.apps) {
          this.appSourceConfigs.set(config.appId, config);
        }
      }
      logger.info(`Configuration loaded from ${this.configFilePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.info("No existing configuration file found, will use defaults");
        this.deviceSessionConfigs = new Map();
        this.appSourceConfigs = new Map();
      } else {
        logger.warn(`Failed to load configuration: ${error}`);
        this.deviceSessionConfigs = new Map();
        this.appSourceConfigs = new Map();
      }
    }
  }

  /**
   * Save app configurations to disk
   */
  public async saveAppConfigs(): Promise<void> {
    try {
      const configs = Array.from(this.appSourceConfigs.values());
      await fs.writeFile(this.configFilePath, JSON.stringify(configs, null, 2));
      logger.debug(`[SOURCE] Saved ${configs.length} app configurations to disk`);
    } catch (error) {
      logger.warn(`Failed to save app configurations: ${error}`);
    }
  }

  /**
     * Save configuration to disk
     */
  public async saveToDisk(): Promise<void> {
    try {
      const configData = {
        devices: Array.from(this.deviceSessionConfigs.values()),
        apps: Array.from(this.appSourceConfigs.values())
      };
      const configJson = JSON.stringify(configData, null, 2);
      await fs.writeFile(this.configFilePath, configJson, "utf8");
      logger.info(`Configuration saved to ${this.configFilePath}`);
    } catch (error) {
      logger.error(`Failed to save configuration: ${error}`);
      throw error;
    }
  }

  /**
   * Set an app source configuration
   */
  public async updateDeviceSession(args: DeviceSessionArgs, platform: "android" | "ios"): Promise<void> {
    let newConfig: DeviceConfig | undefined;
    if (args.testAuthoring) {
      newConfig = {
        platform: platform,
        activeMode: "testAuthoring",
        deviceId: args.deviceId,
        testAuthoring: {
          appId: args.testAuthoring.appId,
          persist: args.testAuthoring.persist
        },
      };
    } else if (args.exploration) {
      newConfig = {
        platform: platform,
        activeMode: "exploration",
        deviceId: args.deviceId,
        exploration: {
          deepLinkSkipping: args.exploration.deepLinkSkipping,
        }
      };
    }

    if (newConfig) {
      this.deviceSessionConfigs.set(args.deviceId, newConfig);
    }

    await this.saveAppConfigs();
  }

  /**
   * Get all device configurations
   */
  public getDeviceConfigs(): DeviceConfig[] {
    return Array.from(this.deviceSessionConfigs.values());
  }

  public getConfigForDevice(deviceId: string): DeviceConfig | undefined {
    return this.deviceSessionConfigs.get(deviceId);
  }

  /**
     * Check if test authoring is enabled
     */
  public isTestAuthoringEnabled(deviceId: string): boolean {
    return this.getConfigForDevice(deviceId)?.activeMode === "testAuthoring";
  }

  /**
     * Reset configuration to defaults
     */
  public async resetServerConfig(): Promise<void> {
    this.deviceSessionConfigs.clear();
    this.appSourceConfigs.clear();
    await this.saveToDisk();
  }
}
