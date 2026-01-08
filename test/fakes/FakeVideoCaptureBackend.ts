import fs from "fs-extra";
import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "../../src/features/video/VideoRecorderService";

export class FakeVideoCaptureBackend implements VideoCaptureBackend {
  readonly startCalls: VideoCaptureConfig[] = [];
  readonly stopCalls: RecordingHandle[] = [];
  private stopResolvers: Array<(handle: RecordingHandle) => void> = [];
  private stopResultOverrides: Partial<RecordingResult> | null = null;
  private outputPayload: Buffer = Buffer.from("fake-video");

  setStopResultOverrides(overrides: Partial<RecordingResult>): void {
    this.stopResultOverrides = overrides;
  }

  setOutputPayload(payload: Buffer): void {
    this.outputPayload = payload;
  }

  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
    this.startCalls.push(config);
    await fs.ensureFile(config.outputPath);
    return {
      recordingId: config.recordingId,
      outputPath: config.outputPath,
      startedAt: config.startedAt,
    };
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    this.stopCalls.push(handle);
    if (this.stopResolvers.length > 0) {
      const resolver = this.stopResolvers.shift();
      resolver?.(handle);
    }

    await fs.writeFile(handle.outputPath, this.outputPayload);

    const baseResult: RecordingResult = {
      recordingId: handle.recordingId,
      outputPath: handle.outputPath,
      startedAt: handle.startedAt,
      endedAt: new Date().toISOString(),
      sizeBytes: this.outputPayload.length,
      codec: "h264",
    };

    if (this.stopResultOverrides) {
      const overrides = this.stopResultOverrides;
      this.stopResultOverrides = null;
      return { ...baseResult, ...overrides };
    }

    return baseResult;
  }

  waitForStopCall(): Promise<RecordingHandle> {
    return new Promise(resolve => {
      this.stopResolvers.push(resolve);
    });
  }
}
