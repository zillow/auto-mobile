import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { logger } from "../../utils/logger";

async function ensureFile(filePath: string): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fsPromises.open(filePath, "a");
  await handle.close();
}
import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "./VideoRecorderService";

let warnedNoopBackend = false;

export class NoopVideoCaptureBackend implements VideoCaptureBackend {
  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
    await ensureFile(config.outputPath);

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
    await ensureFile(handle.outputPath);

    let sizeBytes = 0;
    try {
      const stats = await fsPromises.stat(handle.outputPath);
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
