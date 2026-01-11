import type { VideoRecordingConfig, VideoRecordingConfigInput } from "../models";

export type VideoRecordingSocketMethod = "config/get" | "config/set";

export interface VideoRecordingSocketRequest {
  id: string;
  type: "video_recording_request";
  method: VideoRecordingSocketMethod;
  params?: {
    config?: VideoRecordingConfigInput | null;
  };
}

export interface VideoRecordingSocketResponse {
  id: string;
  type: "video_recording_response";
  success: boolean;
  result?: {
    config: VideoRecordingConfig;
    evictedRecordingIds?: string[];
  };
  error?: string;
}
