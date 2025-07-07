import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger";
import { AppConfig, McpServerConfig } from "../models";
import { ConfigArgs } from "../server/configurationTools";

export class ConfigurationManager {
  private serverConfig: McpServerConfig = {};
  private configFilePath: string;
  private static instance: ConfigurationManager;
  private appSourceConfigs: Map<string, AppConfig> = new Map();

  private constructor() {
    // home should either be process.env.HOME or bash resolution of home for current user
    const homeDir = process.env.HOME || require("os").homedir();
    if (!homeDir) {
      throw new Error("Home directory for current user not found");
    }
    this.configFilePath = path.join(homeDir, ".auto-mobile", "app-configs.json");
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
   * Add or update an app configuration
   */
  public async addAppConfig(appId: string, sourceDir: string, platform: "android" | "ios"): Promise<void> {
    if (!require("fs").existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    this.appSourceConfigs.set(appId, { appId, sourceDir, platform });
    await this.saveAppConfigs();

    logger.debug(`[SOURCE] Added app configuration: ${appId} -> ${sourceDir}`);
  }

  /**
   * Get all app configurations
   */
  public getAppConfigs(): AppConfig[] {
    return Array.from(this.appSourceConfigs.values());
  }

  /**
     * Load configuration from disk on server startup
     */
  public async loadFromDisk(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configFilePath, "utf8");
      const parsedData = JSON.parse(configData);
      this.serverConfig = parsedData.serverConfig || {};
      for (const config of parsedData.apps) {
        this.appSourceConfigs.set(config.appId, config);
      }
      logger.info(`Configuration loaded from ${this.configFilePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.info("No existing configuration file found, using default config");
        this.serverConfig = {};
        this.appSourceConfigs = new Map();
      } else {
        logger.warn(`Failed to load configuration: ${error}`);
        this.serverConfig = {};
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
        serverConfig: this.serverConfig,
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
     * Update configuration with partial data
     */
  public async updateConfig(args: ConfigArgs): Promise<void> {
    // Merge with existing configuration
    this.serverConfig.mode = args.mode;

    // Persist to disk immediately
    await this.saveToDisk();
  }

  /**
     * Get current configuration
     */
  public getServerConfig(): McpServerConfig {
    return { ...this.serverConfig };
  }

  /**
     * Get specific configuration value
     */
  public getServerConfigValue<K extends keyof McpServerConfig>(key: K): McpServerConfig[K] {
    return this.serverConfig[key];
  }

  /**
     * Check if test authoring is enabled
     */
  public isTestAuthoringEnabled(): boolean {
    return this.serverConfig.mode === "testAuthoring";
  }

  /**
     * Reset configuration to defaults
     */
  public async resetServerConfig(): Promise<void> {
    this.serverConfig = {};
    this.appSourceConfigs.clear();
    await this.saveToDisk();
  }

  /**
     * Set configuration file path (for testing)
     */
  public setConfigFilePath(filePath: string): void {
    this.configFilePath = filePath;
  }
}
