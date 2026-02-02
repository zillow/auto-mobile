import { BaseDomainHandler } from "../DomainHandler";
import type { RequestResult } from "../UnifiedSocketTypes";
import { createError, ErrorCodes } from "../UnifiedSocketTypes";
import {
  getTestRecordingStatus,
  startTestRecording,
  stopTestRecording,
} from "../../../server/testRecordingManager";
import {
  getVideoRecordingConfig,
  updateVideoRecordingConfig,
} from "../../../server/videoRecordingManager";
import { DeviceSessionManager } from "../../../utils/DeviceSessionManager";
import type { BootedDevice, Platform, SomePlatform } from "../../../models";

/**
 * Resolve device from deviceId and platform parameters
 */
async function resolveDevice(deviceId?: string, platform?: Platform): Promise<BootedDevice> {
  const deviceSessionManager = DeviceSessionManager.getInstance();

  let resolvedPlatform: SomePlatform = platform ?? "either";
  if (deviceId && !platform) {
    const connectedDevices = await deviceSessionManager.detectConnectedPlatforms();
    const match = connectedDevices.find(device => device.deviceId === deviceId);
    if (!match) {
      throw new Error(`Device ${deviceId} not found among connected devices.`);
    }
    resolvedPlatform = match.platform;
  }

  return deviceSessionManager.ensureDeviceReady(resolvedPlatform, deviceId);
}

/**
 * Ensure platform is valid
 */
function ensurePlatform(value: unknown): Platform | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "android" || value === "ios") {
    return value;
  }

  throw new Error(`Unsupported platform value: ${String(value)}`);
}

/**
 * Domain handler for test and video recording.
 *
 * Methods:
 * - test/start: Start test recording
 * - test/stop: Stop test recording
 * - test/status: Get current recording status
 * - video/config/get: Get video recording configuration
 * - video/config/set: Update video recording configuration
 */
export class RecordingDomainHandler extends BaseDomainHandler {
  readonly domain = "recording" as const;

  async handleRequest(
    method: string,
    params: Record<string, unknown> | undefined
  ): Promise<RequestResult> {
    switch (method) {
      case "test/start":
        return await this.handleTestStart(params ?? {});
      case "test/stop":
        return await this.handleTestStop(params ?? {});
      case "test/status":
        return this.handleTestStatus();
      case "video/config/get":
        return await this.handleVideoConfigGet();
      case "video/config/set":
        return await this.handleVideoConfigSet(params ?? {});
      default:
        return {
          error: createError(ErrorCodes.UNKNOWN_METHOD, `Unknown method: ${method}`),
        };
    }
  }

  private async handleTestStart(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const platform = ensurePlatform(params.platform);
      const device = await resolveDevice(params.deviceId as string | undefined, platform);
      const result = await startTestRecording(device);

      return {
        result: {
          recordingId: result.recordingId,
          startedAt: result.startedAt,
          deviceId: result.deviceId,
          platform: result.platform,
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

  private async handleTestStop(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      const result = await stopTestRecording(
        params.recordingId as string | undefined,
        params.planName as string | undefined
      );

      return {
        result: {
          recordingId: result.recordingId,
          startedAt: result.startedAt,
          stoppedAt: result.stoppedAt,
          deviceId: result.deviceId,
          platform: result.platform,
          planName: result.planName,
          planContent: result.planContent,
          stepCount: result.stepCount,
          durationMs: result.durationMs,
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

  private handleTestStatus(): RequestResult {
    const recording = getTestRecordingStatus();
    return {
      result: recording ? { recording } : {},
    };
  }

  private async handleVideoConfigGet(): Promise<RequestResult> {
    try {
      const config = await getVideoRecordingConfig();
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

  private async handleVideoConfigSet(params: Record<string, unknown>): Promise<RequestResult> {
    try {
      if (!params.config) {
        return {
          error: createError(ErrorCodes.INVALID_MESSAGE, "video/config/set requires config parameter"),
        };
      }

      const update = params.config as Record<string, unknown>;
      const { config, evictedRecordingIds } = await updateVideoRecordingConfig(update);

      return {
        result: {
          config,
          evictedRecordingIds: evictedRecordingIds.length > 0 ? evictedRecordingIds : undefined,
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
