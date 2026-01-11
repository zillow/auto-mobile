import type {
  DeviceSnapshotQuery,
  DeviceSnapshotRecord,
} from "../../src/db/deviceSnapshotRepository";

export class FakeDeviceSnapshotRepository {
  private readonly records = new Map<string, DeviceSnapshotRecord>();

  async insertSnapshot(record: DeviceSnapshotRecord): Promise<void> {
    this.records.set(record.snapshotName, { ...record });
  }

  async updateSnapshot(
    snapshotName: string,
    update: Partial<DeviceSnapshotRecord>
  ): Promise<void> {
    const existing = this.records.get(snapshotName);
    if (!existing) {
      return;
    }
    const updated = { ...existing };
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        (updated as Record<string, unknown>)[key] = value;
      }
    }
    this.records.set(snapshotName, updated);
  }

  async getSnapshot(snapshotName: string): Promise<DeviceSnapshotRecord | null> {
    return this.records.get(snapshotName) ?? null;
  }

  async listSnapshots(query: DeviceSnapshotQuery = {}): Promise<DeviceSnapshotRecord[]> {
    let results = Array.from(this.records.values());

    if (query.deviceId) {
      results = results.filter(record => record.deviceId === query.deviceId);
    }
    if (query.platform) {
      results = results.filter(record => record.platform === query.platform);
    }
    if (query.snapshotType) {
      results = results.filter(record => record.snapshotType === query.snapshotType);
    }
    if (query.orderByLastAccessed) {
      results.sort((left, right) => {
        const leftTime = Date.parse(left.lastAccessedAt);
        const rightTime = Date.parse(right.lastAccessedAt);
        const delta = leftTime - rightTime;
        return query.orderByLastAccessed === "asc" ? delta : -delta;
      });
    }
    if (query.orderByCreatedAt) {
      results.sort((left, right) => {
        const leftTime = Date.parse(left.createdAt);
        const rightTime = Date.parse(right.createdAt);
        const delta = leftTime - rightTime;
        return query.orderByCreatedAt === "asc" ? delta : -delta;
      });
    }
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async touchSnapshot(snapshotName: string, timestamp: string): Promise<void> {
    await this.updateSnapshot(snapshotName, { lastAccessedAt: timestamp });
  }

  async deleteSnapshot(snapshotName: string): Promise<boolean> {
    return this.records.delete(snapshotName);
  }
}
