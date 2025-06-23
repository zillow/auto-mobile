import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "./logger";
import { AbTestManager } from "./abTestManager";

const execAsync = promisify(exec);

export class FeatureFlagManager {
  private flags: Map<string, any> = new Map();
  private abTestManager: AbTestManager;

  constructor(abTestManager: AbTestManager) {
    this.abTestManager = abTestManager;
  }

  /**
     * Set feature flags manually
     */
  public setFeatureFlags(flags: Record<string, any>): void {
    this.flags.clear();
    Object.entries(flags).forEach(([key, value]) => {
      this.flags.set(key, value);
      logger.debug(`Set feature flag: ${key} = ${value}`);
    });
  }

  /**
     * Check if a feature flag is enabled
     */
  public isEnabled(flagName: string): boolean {
    // First check local flags
    if (this.flags.has(flagName)) {
      const value = this.flags.get(flagName);
      return Boolean(value);
    }

    // Then check A/B test manager
    return this.abTestManager.isFeatureEnabled(flagName);
  }

  /**
     * Get feature flag value
     */
  public getValue(flagName: string): any {
    // First check local flags
    if (this.flags.has(flagName)) {
      return this.flags.get(flagName);
    }

    // Then check A/B test manager
    return this.abTestManager.getFeatureValue(flagName);
  }

  /**
     * Apply feature flags to a device through ADB commands
     */
  public async applyFeatureFlags(deviceId: string): Promise<void> {
    try {
      logger.info(`Applying feature flags to device ${deviceId}`);

      // Get all feature flags from A/B test manager
      const experimentContext = this.abTestManager.generateExperimentContext();
      const allFlags = { ...experimentContext.featureFlags };

      // Add local flags
      this.flags.forEach((value, key) => {
        allFlags[key] = value;
      });

      // Apply flags through different mechanisms
      await this.applyFlagsViaSystemProperties(deviceId, allFlags);
      await this.applyFlagsViaSharedPreferences(deviceId, allFlags);

      logger.info(`Successfully applied ${Object.keys(allFlags).length} feature flags to device ${deviceId}`);
    } catch (error) {
      logger.error(`Failed to apply feature flags to device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
     * Apply feature flags via Android system properties
     */
  private async applyFlagsViaSystemProperties(deviceId: string, flags: Record<string, any>): Promise<void> {
    for (const [flagName, value] of Object.entries(flags)) {
      try {
        const propertyName = `debug.feature.${flagName}`;
        const propertyValue = String(value);

        const command = `adb -s ${deviceId} shell setprop ${propertyName} "${propertyValue}"`;
        await execAsync(command);

        logger.debug(`Set system property: ${propertyName} = ${propertyValue}`);
      } catch (error) {
        logger.warn(`Failed to set system property for flag ${flagName}:`, error);
      }
    }
  }

  /**
     * Apply feature flags via SharedPreferences (requires root or debug app)
     */
  private async applyFlagsViaSharedPreferences(deviceId: string, flags: Record<string, any>): Promise<void> {
    try {
      // Create a JSON string with all flags
      const flagsJson = JSON.stringify(flags);

      // Write to a temporary file
      const tempFile = "/data/local/tmp/feature_flags.json";
      const writeCommand = `adb -s ${deviceId} shell "echo '${flagsJson}' > ${tempFile}"`;
      await execAsync(writeCommand);

      logger.debug(`Written feature flags to ${tempFile} on device ${deviceId}`);
    } catch (error) {
      logger.warn(`Failed to write feature flags via SharedPreferences:`, error);
    }
  }

  /**
     * Get feature flags that have been applied to device
     */
  public async getAppliedFeatureFlags(deviceId: string): Promise<Record<string, string>> {
    try {
      const command = `adb -s ${deviceId} shell getprop | grep "debug.feature"`;
      const { stdout } = await execAsync(command);

      const appliedFlags: Record<string, string> = {};

      stdout.split("\n").forEach(line => {
        const match = line.match(/\[debug\.feature\.([^\]]+)\]: \[([^\]]*)\]/);
        if (match) {
          const flagName = match[1];
          const flagValue = match[2];
          appliedFlags[flagName] = flagValue;
        }
      });

      return appliedFlags;
    } catch (error) {
      logger.warn(`Failed to get applied feature flags from device ${deviceId}:`, error);
      return {};
    }
  }

  /**
     * Clear all feature flags from device
     */
  public async clearFeatureFlags(deviceId: string): Promise<void> {
    try {
      logger.info(`Clearing feature flags from device ${deviceId}`);

      // Get all current feature flags
      const appliedFlags = await this.getAppliedFeatureFlags(deviceId);

      // Clear each flag
      for (const flagName of Object.keys(appliedFlags)) {
        const propertyName = `debug.feature.${flagName}`;
        const command = `adb -s ${deviceId} shell setprop ${propertyName} ""`;
        await execAsync(command);
      }

      // Clear temporary file
      const clearCommand = `adb -s ${deviceId} shell rm -f /data/local/tmp/feature_flags.json`;
      await execAsync(clearCommand);

      logger.info(`Cleared ${Object.keys(appliedFlags).length} feature flags from device ${deviceId}`);
    } catch (error) {
      logger.error(`Failed to clear feature flags from device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
     * Validate that feature flags are correctly applied
     */
  public async validateFeatureFlags(deviceId: string, expectedFlags: Record<string, any>): Promise<boolean> {
    try {
      const appliedFlags = await this.getAppliedFeatureFlags(deviceId);

      for (const [flagName, expectedValue] of Object.entries(expectedFlags)) {
        const appliedValue = appliedFlags[flagName];
        const expectedValueStr = String(expectedValue);

        if (appliedValue !== expectedValueStr) {
          logger.warn(`Feature flag mismatch: ${flagName} expected ${expectedValueStr}, got ${appliedValue}`);
          return false;
        }
      }

      logger.info(`All feature flags validated successfully on device ${deviceId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to validate feature flags on device ${deviceId}:`, error);
      return false;
    }
  }

  /**
     * Get all current feature flags
     */
  public getAllFlags(): Record<string, any> {
    const allFlags = { ...this.abTestManager.generateExperimentContext().featureFlags };

    // Add local flags
    this.flags.forEach((value, key) => {
      allFlags[key] = value;
    });

    return allFlags;
  }
}
