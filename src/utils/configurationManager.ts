import * as fs from "fs/promises";
import * as path from "path";
import { McpServerConfig, AbTestTreatment, Experiment } from "../models/McpServerConfiguration";
import { logger } from "./logger";

export class ConfigurationManager {
  private config: McpServerConfig = {};
  private configFilePath: string;
  private static instance: ConfigurationManager;

  private constructor() {
    // Default config file path in project root
    this.configFilePath = path.join(process.cwd(), ".auto-mobile-config.json");
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
     * Load configuration from disk on server startup
     */
  public async loadFromDisk(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configFilePath, "utf8");
      this.config = JSON.parse(configData);
      logger.info(`Configuration loaded from ${this.configFilePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.info("No existing configuration file found, using default config");
        this.config = {};
      } else {
        logger.warn(`Failed to load configuration: ${error}`);
        this.config = {};
      }
    }
  }

  /**
     * Save configuration to disk
     */
  public async saveToDisk(): Promise<void> {
    try {
      const configData = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configFilePath, configData, "utf8");
      logger.info(`Configuration saved to ${this.configFilePath}`);
    } catch (error) {
      logger.error(`Failed to save configuration: ${error}`);
      throw error;
    }
  }

  /**
     * Update configuration with partial data
     */
  public async updateConfig(partial: Partial<McpServerConfig>): Promise<void> {
    // Validate experiments if provided
    if (partial.experiments) {
      this.validateExperiments(partial.experiments);
    }

    // Merge with existing configuration
    this.config = {
      ...this.config,
      ...partial
    };

    // Persist to disk immediately
    await this.saveToDisk();
  }

  /**
   * Validate experiments have non-blank names
   */
  private validateExperiments(experiments: Experiment[]): void {
    for (const experiment of experiments) {
      if (!experiment.name || experiment.name.trim() === "") {
        throw new Error(`Experiment ${experiment.id} must have a non-blank name`);
      }
    }
  }

  /**
     * Get current configuration
     */
  public getConfig(): McpServerConfig {
    return { ...this.config };
  }

  /**
     * Get specific configuration value
     */
  public getConfigValue<K extends keyof McpServerConfig>(key: K): McpServerConfig[K] {
    return this.config[key];
  }

  /**
     * Check if test authoring is enabled
     */
  public isTestAuthoringEnabled(): boolean {
    return this.config.mode === "testAuthoring";
  }

  /**
     * Get active A/B test experiments
     */
  public getAbTestExperiments(): Experiment[] {
    return this.config.experiments || [];
  }

  /**
     * Get A/B test treatment for an experiment
     */
  public getAbTestTreatment(experimentId: string): AbTestTreatment | undefined {
    if (!this.config.treatments) {
      return undefined;
    }
    return this.config.treatments[experimentId];
  }

  /**
   * Get all A/B test treatments
   */
  public getAllAbTestTreatments(): Record<string, AbTestTreatment> {
    return this.config.treatments || {};
  }

  /**
     * Reset configuration to defaults
     */
  public async resetConfig(): Promise<void> {
    this.config = {};
    await this.saveToDisk();
  }

  /**
     * Set configuration file path (for testing)
     */
  public setConfigFilePath(filePath: string): void {
    this.configFilePath = filePath;
  }
}
