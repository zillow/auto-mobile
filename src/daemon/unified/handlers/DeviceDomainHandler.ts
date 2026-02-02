import { BaseDomainHandler } from "../DomainHandler";
import type { RequestResult } from "../UnifiedSocketTypes";
import { createError, ErrorCodes } from "../UnifiedSocketTypes";
import {
  getDeviceSnapshotConfig,
  updateDeviceSnapshotConfig,
} from "../../../server/deviceSnapshotManager";

/**
 * Domain handler for device management.
 *
 * Methods:
 * - snapshot/get: Get device snapshot configuration
 * - snapshot/set: Update device snapshot configuration
 */
export class DeviceDomainHandler extends BaseDomainHandler {
  readonly domain = "device" as const;

  async handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    switch (method) {
      case "snapshot/get":
        return await this.handleSnapshotGet();
      case "snapshot/set":
        return await this.handleSnapshotSet(params ?? {});
      default:
        return {
          error: createError(ErrorCodes.UNKNOWN_METHOD, `Unknown method: ${method}`),
        };
    }
  }

  private async handleSnapshotGet(): Promise<RequestResult> {
    try {
      const config = await getDeviceSnapshotConfig();
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

  private async handleSnapshotSet(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      if (!params.config) {
        return {
          error: createError(ErrorCodes.INVALID_MESSAGE, "snapshot/set requires config parameter"),
        };
      }

      const update = params.config as Record<string, unknown> | null;
      const { config, evictedSnapshotNames } = await updateDeviceSnapshotConfig(update);

      return {
        result: {
          config,
          evictedSnapshotNames:
            evictedSnapshotNames.length > 0 ? evictedSnapshotNames : undefined,
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
}
