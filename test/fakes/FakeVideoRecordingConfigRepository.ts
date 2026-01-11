import type { VideoRecordingConfig } from "../../src/models";

export class FakeVideoRecordingConfigRepository {
  private config: VideoRecordingConfig | null = null;

  async getConfig(): Promise<VideoRecordingConfig | null> {
    return this.config ? { ...this.config } : null;
  }

  async setConfig(config: VideoRecordingConfig): Promise<void> {
    this.config = { ...config };
  }

  async clearConfig(): Promise<void> {
    this.config = null;
  }
}
