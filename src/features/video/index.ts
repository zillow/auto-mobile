/**
 * Video recording module exports
 */

export { VideoRecorderService } from "./VideoRecorderService";
export type {
  VideoCaptureBackend,
  VideoCaptureConfig,
  RecordingHandle,
  RecordingResult,
  StartVideoRecordingOptions,
  ActiveVideoRecording,
  VideoArchiveEvictionResult,
  VideoRecorderServiceDependencies,
} from "./VideoRecorderService";
export {
  DEFAULT_VIDEO_RECORDING_CONFIG,
  parseVideoRecordingConfig,
} from "./VideoRecorderService";
export { NoopVideoCaptureBackend } from "./NoopVideoCaptureBackend";
export { PlatformVideoCaptureBackend } from "./PlatformVideoCaptureBackend";
export { FfmpegVideoCaptureBackend } from "./FfmpegVideoCaptureBackend";
