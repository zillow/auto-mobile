import { BaseDomainHandler } from "../DomainHandler";
import type { RequestResult } from "../UnifiedSocketTypes";
import { createError, ErrorCodes } from "../UnifiedSocketTypes";
import {
  getAppearanceConfig,
  resolveAppearanceMode,
  updateAppearanceConfig,
} from "../../../server/appearanceManager";
import { DeviceSessionManager } from "../../../utils/DeviceSessionManager";
import { applyAppearanceToDevice } from "../../../utils/deviceAppearance";
import { triggerAppearanceSync } from "../../../utils/appearance/AppearanceSyncScheduler";
import { DaemonState } from "../../daemonState";
import type { AppearanceMode, BootedDevice } from "../../../models";
import { logger } from "../../../utils/logger";

const VALID_MODES = new Set(["light", "dark", "auto"]);

/**
 * Domain handler for appearance configuration.
 *
 * Methods:
 * - get_config: Get current appearance configuration
 * - set_sync: Enable/disable sync with host
 * - set_theme: Set appearance mode (light/dark/auto)
 */
export class AppearanceDomainHandler extends BaseDomainHandler {
  readonly domain = "appearance" as const;

  async handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    switch (method) {
      case "get_config":
        return await this.handleGetConfig();
      case "set_sync":
        return await this.handleSetSync(params ?? {});
      case "set_theme":
        return await this.handleSetTheme(params ?? {});
      default:
        return {
          error: createError(ErrorCodes.UNKNOWN_METHOD, `Unknown method: ${method}`),
        };
    }
  }

  private async handleGetConfig(): Promise<RequestResult> {
    try {
      const config = await getAppearanceConfig();
      return {
        result: { config },
      };
    } catch (error) {
      return {
        error: createError(
          ErrorCodes.HANDLER_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
      };
    }
  }

  private async handleSetSync(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const enabled = params.enabled;
      if (typeof enabled !== "boolean") {
        return {
          error: createError(ErrorCodes.INVALID_MESSAGE, "set_sync requires enabled boolean"),
        };
      }

      const config = await updateAppearanceConfig({ syncWithHost: enabled });
      const appliedMode = await this.applyToTargets(config);
      await triggerAppearanceSync();

      return {
        result: {
          config,
          appliedMode: appliedMode ?? undefined,
        },
      };
    } catch (error) {
      return {
        error: createError(
          ErrorCodes.HANDLER_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
      };
    }
  }

  private async handleSetTheme(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const mode = params.mode;
      if (!mode || !VALID_MODES.has(String(mode).toLowerCase())) {
        return {
          error: createError(
            ErrorCodes.INVALID_MESSAGE,
            "set_theme requires mode: light | dark | auto"
          ),
        };
      }

      const normalizedMode = String(mode).toLowerCase();
      const config = await updateAppearanceConfig({
        defaultMode: normalizedMode,
        syncWithHost: normalizedMode === "auto",
      });
      const appliedMode = await this.applyToTargets(config, normalizedMode);
      await triggerAppearanceSync();

      return {
        result: {
          config,
          appliedMode: appliedMode ?? undefined,
        },
      };
    } catch (error) {
      return {
        error: createError(
          ErrorCodes.HANDLER_ERROR,
          error instanceof Error ? error.message : String(error)
        ),
      };
    }
  }

  private async applyToTargets(
    config: Awaited<ReturnType<typeof getAppearanceConfig>>,
    explicitMode?: string
  ): Promise<AppearanceMode | null> {
    const mode =
      explicitMode && explicitMode !== "auto"
        ? (explicitMode as AppearanceMode)
        : await resolveAppearanceMode(config);

    const targets = this.getTargets();
    if (targets.length === 0) {
      return null;
    }

    for (const device of targets) {
      try {
        await applyAppearanceToDevice(device, mode);
      } catch (error) {
        logger.warn(`[Appearance] Failed to apply appearance to ${device.deviceId}: ${error}`);
      }
    }

    return mode;
  }

  private getTargets(): BootedDevice[] {
    const daemonState = DaemonState.getInstance();
    const targets = new Map<string, BootedDevice>();

    if (daemonState.isInitialized()) {
      const pool = daemonState.getDevicePool();
      const pooledDevices = pool.getAllDevices();
      for (const device of pooledDevices) {
        targets.set(device.id, {
          deviceId: device.id,
          name: device.name,
          platform: device.platform,
        });
      }
    }

    const current = DeviceSessionManager.getInstance().getCurrentDevice();
    if (current) {
      targets.set(current.deviceId, current);
    }

    return Array.from(targets.values());
  }
}
