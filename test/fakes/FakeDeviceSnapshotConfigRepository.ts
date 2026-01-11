import type { DeviceSnapshotConfig } from "../../src/models";

export class FakeDeviceSnapshotConfigRepository {
  private config: DeviceSnapshotConfig | null = null;

  async getConfig(): Promise<DeviceSnapshotConfig | null> {
    return this.config ? { ...this.config } : null;
  }

  async setConfig(config: DeviceSnapshotConfig): Promise<void> {
    this.config = { ...config };
  }

  async clearConfig(): Promise<void> {
    this.config = null;
  }
}
