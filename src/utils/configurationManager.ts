import * as fs from "fs/promises";
import * as path from "path";
import { logger } from "./logger";
import { BootedDevice, DeviceConfig } from "../models";
import { DeviceSessionArgs } from "../server/configurationTools";

export class ConfigurationManager {
  private readonly configFilePath: string;
  private static instance: ConfigurationManager;
  private deviceSessionConfigs: Map<string, DeviceConfig> = new Map();

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

  private ensureDirectoriesExist(): void {
    const baseDir = path.dirname(this.configFilePath);
    if (!require("fs").existsSync(baseDir)) {
      require("fs").mkdirSync(baseDir, { recursive: true });
    }
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
      logger.info(`Configuration loaded from ${this.configFilePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.info("No existing configuration file found, will use defaults");
        this.deviceSessionConfigs = new Map();
      } else {
        logger.warn(`Failed to load configuration: ${error}`);
        this.deviceSessionConfigs = new Map();
      }
    }
  }

  /**
   * Save configuration to disk
   */
  public async saveToDisk(): Promise<void> {
    try {
      const configData = {
        devices: Array.from(this.deviceSessionConfigs.values())
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
   * Update device session configuration
   */
  public async updateDeviceSession(args: DeviceSessionArgs, platform: "android" | "ios"): Promise<void> {
    let newConfig: DeviceConfig | undefined;
    if (args.exploration) {
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

    await this.saveToDisk();
  }

  /**
   * Get all device configurations
   */
  public getDeviceConfigs(): DeviceConfig[] {
    return Array.from(this.deviceSessionConfigs.values());
  }

  public getConfigForDevice(device: BootedDevice): DeviceConfig | undefined {
    return this.deviceSessionConfigs.get(device.deviceId);
  }

  /**
   * Reset configuration to defaults
   */
  public async resetServerConfig(): Promise<void> {
    this.deviceSessionConfigs.clear();
    await this.saveToDisk();
  }
}
