import fs from "fs-extra";
import { logger } from "../../utils/logger";
import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "./VideoRecorderService";

let warnedNoopBackend = false;

export class NoopVideoCaptureBackend implements VideoCaptureBackend {
  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
    await fs.ensureFile(config.outputPath);

    if (!warnedNoopBackend) {
      warnedNoopBackend = true;
      logger.warn(
        "[VideoCapture] Noop backend active; recordings will be empty placeholder files."
      );
    }

    return {
      recordingId: config.recordingId,
      outputPath: config.outputPath,
      startedAt: config.startedAt,
    };
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    await fs.ensureFile(handle.outputPath);

    let sizeBytes = 0;
    try {
      const stats = await fs.stat(handle.outputPath);
      sizeBytes = stats.size;
    } catch {
      sizeBytes = 0;
    }

    return {
      recordingId: handle.recordingId,
      outputPath: handle.outputPath,
      startedAt: handle.startedAt,
      endedAt: new Date().toISOString(),
      sizeBytes,
      codec: "h264",
    };
  }
}
