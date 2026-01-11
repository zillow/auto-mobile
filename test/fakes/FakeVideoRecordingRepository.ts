import type {
  VideoRecordingQuery,
  VideoRecordingRecord,
} from "../../src/db/videoRecordingRepository";

export class FakeVideoRecordingRepository {
  private readonly records = new Map<string, VideoRecordingRecord>();

  async insertRecording(record: VideoRecordingRecord): Promise<void> {
    this.records.set(record.recordingId, { ...record });
  }

  async updateRecording(
    recordingId: string,
    update: Partial<VideoRecordingRecord>
  ): Promise<void> {
    const existing = this.records.get(recordingId);
    if (!existing) {
      return;
    }
    const updated = { ...existing };
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined) {
        (updated as Record<string, unknown>)[key] = value;
      }
    }
    this.records.set(recordingId, updated);
  }

  async getRecording(recordingId: string): Promise<VideoRecordingRecord | null> {
    return this.records.get(recordingId) ?? null;
  }

  async listRecordings(query: VideoRecordingQuery = {}): Promise<VideoRecordingRecord[]> {
    const statuses = query.status
      ? (Array.isArray(query.status) ? query.status : [query.status])
      : null;

    let results = Array.from(this.records.values());

    if (statuses) {
      results = results.filter(record => statuses.includes(record.status));
    }
    if (query.deviceId) {
      results = results.filter(record => record.deviceId === query.deviceId);
    }
    if (query.platform) {
      results = results.filter(record => record.platform === query.platform);
    }
    if (query.orderByLastAccessed) {
      results.sort((left, right) => {
        const leftTime = Date.parse(left.lastAccessedAt);
        const rightTime = Date.parse(right.lastAccessedAt);
        const delta = leftTime - rightTime;
        return query.orderByLastAccessed === "asc" ? delta : -delta;
      });
    }
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  async getLatestRecording(): Promise<VideoRecordingRecord | null> {
    const results = await this.listRecordings({
      status: ["completed", "interrupted"],
      orderByLastAccessed: "desc",
      limit: 1,
    });
    return results[0] ?? null;
  }

  async touchRecording(recordingId: string, timestamp: string): Promise<void> {
    await this.updateRecording(recordingId, { lastAccessedAt: timestamp });
  }

  async deleteRecording(recordingId: string): Promise<boolean> {
    return this.records.delete(recordingId);
  }
}
