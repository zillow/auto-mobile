import os from "node:os";
import path from "node:path";
import { Timer, defaultTimer } from "../utils/SystemTimer";
import { RequestResponseSocketServer, getSocketPath, SocketServerConfig } from "./socketServer/index";
import {
  VideoRecordingSocketRequest,
  VideoRecordingSocketResponse,
} from "./videoRecordingSocketTypes";
import { getVideoRecordingConfig, updateVideoRecordingConfig } from "../server/videoRecordingManager";

const SOCKET_CONFIG: SocketServerConfig = {
  defaultPath: path.join(os.homedir(), ".auto-mobile", "video-recording.sock"),
  externalPath: "/tmp/auto-mobile-video-recording.sock",
};

/**
 * Socket server for video recording configuration.
 * Handles config/get and config/set requests.
 */
export class VideoRecordingSocketServer extends RequestResponseSocketServer<
  VideoRecordingSocketRequest,
  VideoRecordingSocketResponse
> {
  constructor(socketPath: string = getSocketPath(SOCKET_CONFIG), timer: Timer = defaultTimer) {
    super(socketPath, timer, "VideoRecording");
  }

  protected async handleRequest(
    request: VideoRecordingSocketRequest
  ): Promise<VideoRecordingSocketResponse> {
    switch (request.method) {
      case "config/get": {
        const config = await getVideoRecordingConfig();
        return {
          id: request.id,
          type: "video_recording_response",
          success: true,
          result: { config },
        };
      }
      case "config/set": {
        if (!request.params || !("config" in request.params)) {
          throw new Error("config/set requires params.config");
        }
        const update = request.params.config ?? null;
        const { config, evictedRecordingIds } = await updateVideoRecordingConfig(update);
        return {
          id: request.id,
          type: "video_recording_response",
          success: true,
          result: {
            config,
            evictedRecordingIds: evictedRecordingIds.length > 0 ? evictedRecordingIds : undefined,
          },
        };
      }
      default:
        throw new Error(`Unsupported video recording method: ${request.method}`);
    }
  }

  protected createErrorResponse(id: string | undefined, error: string): VideoRecordingSocketResponse {
    return {
      id: id ?? "unknown",
      type: "video_recording_response",
      success: false,
      error,
    };
  }
}

let socketServer: VideoRecordingSocketServer | null = null;

export async function startVideoRecordingSocketServer(): Promise<void> {
  if (!socketServer) {
    socketServer = new VideoRecordingSocketServer();
  }
  if (!socketServer.isListening()) {
    await socketServer.start();
  }
}

export async function stopVideoRecordingSocketServer(): Promise<void> {
  if (!socketServer) {
    return;
  }
  await socketServer.close();
  socketServer = null;
}
