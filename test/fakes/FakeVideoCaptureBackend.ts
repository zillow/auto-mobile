import type {
  RecordingHandle,
  RecordingResult,
  VideoCaptureBackend,
  VideoCaptureConfig,
} from "../../src/features/video/VideoRecorderService";

/**
 * Fake implementation of VideoCaptureBackend for testing.
 * Does NOT perform any real file I/O - all operations are in-memory.
 */
export class FakeVideoCaptureBackend implements VideoCaptureBackend {
  readonly startCalls: VideoCaptureConfig[] = [];
  readonly stopCalls: RecordingHandle[] = [];
  private stopResolvers: Array<(handle: RecordingHandle) => void> = [];
  private stopResultOverrides: Partial<RecordingResult> | null = null;
  private outputPayload: Buffer = Buffer.from("fake-video");
  private nowProvider: () => Date = () => new Date();

  setStopResultOverrides(overrides: Partial<RecordingResult>): void {
    this.stopResultOverrides = overrides;
  }

  setOutputPayload(payload: Buffer): void {
    this.outputPayload = payload;
  }

  setNowProvider(provider: () => Date): void {
    this.nowProvider = provider;
  }

  async start(config: VideoCaptureConfig): Promise<RecordingHandle> {
    this.startCalls.push(config);
    // No real file I/O - just return the handle
    return {
      recordingId: config.recordingId,
      outputPath: config.outputPath,
      startedAt: config.startedAt,
    };
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    this.stopCalls.push(handle);
    // No real file I/O - just return the result

    const baseResult: RecordingResult = {
      recordingId: handle.recordingId,
      outputPath: handle.outputPath,
      startedAt: handle.startedAt,
      endedAt: this.nowProvider().toISOString(),
      sizeBytes: this.outputPayload.length,
      codec: "h264",
    };

    if (this.stopResolvers.length > 0) {
      const resolver = this.stopResolvers.shift();
      resolver?.(handle);
    }

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
