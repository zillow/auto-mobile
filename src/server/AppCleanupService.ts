import { BootedDevice, ClearAppDataResult, TerminateAppResult } from "../models";
import { ClearAppData } from "../features/action/ClearAppData";
import { TerminateApp } from "../features/action/TerminateApp";
import { Logger, logger } from "../utils/logger";

interface AppCleanupConfig {
  appId: string;
  clearAppData?: boolean;
}

interface ClearAppDataAction {
  execute(appId: string): Promise<ClearAppDataResult>;
}

interface TerminateAppAction {
  execute(
    appId: string,
    options?: {
      skipObservation?: boolean;
      skipUiStability?: boolean;
    }
  ): Promise<TerminateAppResult>;
}

export interface AppCleanupService {
  cleanup(device: BootedDevice, config: AppCleanupConfig): Promise<void>;
}

interface AppCleanupDependencies {
  createClearAppData?: (device: BootedDevice) => ClearAppDataAction;
  createTerminateApp?: (device: BootedDevice) => TerminateAppAction;
  logger?: Pick<Logger, "info" | "warn">;
}

export class DefaultAppCleanupService implements AppCleanupService {
  private createClearAppData: (device: BootedDevice) => ClearAppDataAction;
  private createTerminateApp: (device: BootedDevice) => TerminateAppAction;
  private log: Pick<Logger, "info" | "warn">;

  constructor(dependencies: AppCleanupDependencies = {}) {
    this.createClearAppData =
      dependencies.createClearAppData ?? ((device: BootedDevice) => new ClearAppData(device));
    this.createTerminateApp =
      dependencies.createTerminateApp ?? ((device: BootedDevice) => new TerminateApp(device));
    this.log = dependencies.logger ?? logger;
  }

  async cleanup(device: BootedDevice, config: AppCleanupConfig): Promise<void> {
    if (!config.appId) {
      return;
    }

    if (config.clearAppData) {
      if (device.platform !== "android") {
        this.log.warn(
          `[AppCleanupService] cleanupClearAppData requested for non-Android device ${device.deviceId}; skipping clear app data`
        );
        return;
      }

      try {
        const clearAppData = this.createClearAppData(device);
        const result = await clearAppData.execute(config.appId);
        if (!result.success) {
          this.log.warn(
            `[AppCleanupService] Failed to clear app data for ${config.appId} on ${device.deviceId}: ${result.error || "unknown error"}`
          );
        } else {
          this.log.info(`[AppCleanupService] Cleared app data for ${config.appId} on ${device.deviceId}`);
        }
      } catch (error) {
        this.log.warn(`[AppCleanupService] Cleanup failed for ${config.appId}: ${error}`);
      }
      return;
    }

    try {
      const terminateApp = this.createTerminateApp(device);
      const result = await terminateApp.execute(config.appId, {
        skipObservation: true,
        skipUiStability: true,
      });
      if (!result.success) {
        this.log.warn(
          `[AppCleanupService] Failed to terminate app ${config.appId} on ${device.deviceId}: ${result.error || "unknown error"}`
        );
      } else {
        this.log.info(`[AppCleanupService] Terminated app ${config.appId} on ${device.deviceId}`);
      }
    } catch (error) {
      this.log.warn(`[AppCleanupService] Cleanup failed for ${config.appId}: ${error}`);
    }
  }
}
