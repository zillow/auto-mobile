import { ActionableError, type BootedDevice } from "../../models";
import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "./VideoRecorderService";
import { FfmpegVideoProcessingBackend } from "./FfmpegVideoProcessingBackend";
import { PlatformVideoCaptureBackend } from "./PlatformVideoCaptureBackend";

interface HybridBackendHandle {
  kind: "hybrid";
  backend: "ffmpeg" | "platform";
  handle: RecordingHandle;
}

export class HybridVideoCaptureBackend implements VideoCaptureBackend {
  private ffmpegBackend: VideoCaptureBackend;
  private platformBackend: VideoCaptureBackend;

  constructor(
    ffmpegBackend: VideoCaptureBackend = new FfmpegVideoProcessingBackend(),
    platformBackend: VideoCaptureBackend = new PlatformVideoCaptureBackend()
  ) {
    this.ffmpegBackend = ffmpegBackend;
    this.platformBackend = platformBackend;
  }

  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
    const device = config.device;
    if (!device) {
      throw new ActionableError("Device is required to start video recording.");
    }

    const backend = this.selectBackend(device);
    const handle = await backend.start(config);

    return {
      ...handle,
      backendHandle: {
        kind: "hybrid",
        backend: backend === this.ffmpegBackend ? "ffmpeg" : "platform",
        handle,
      },
    };
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    const hybridHandle = handle.backendHandle as HybridBackendHandle | undefined;
    if (!hybridHandle || hybridHandle.kind !== "hybrid") {
      throw new Error("Missing backend handle for hybrid video recording.");
    }

    if (hybridHandle.backend === "ffmpeg") {
      return this.ffmpegBackend.stop(hybridHandle.handle);
    }

    return this.platformBackend.stop(hybridHandle.handle);
  }

  private selectBackend(device: BootedDevice): VideoCaptureBackend {
    if (device.platform === "ios") {
      return this.ffmpegBackend;
    }

    return this.platformBackend;
  }
}
