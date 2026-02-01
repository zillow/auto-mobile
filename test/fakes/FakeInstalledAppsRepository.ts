import type { InstalledAppsStore } from "../../src/db/installedAppsRepository";
import type { InstalledApp as DbInstalledApp, NewInstalledApp } from "../../src/db/types";

export class FakeInstalledAppsRepository implements InstalledAppsStore {
  private rows: DbInstalledApp[] = [];

  async getLatestVerification(deviceId: string): Promise<number | null> {
    let latest: number | null = null;
    for (const row of this.rows) {
      if (row.device_id !== deviceId) {
        continue;
      }
      const value = Number(row.last_verified_at);
      if (latest === null || value > latest) {
        latest = value;
      }
    }
    return latest;
  }

  async getLatestVerificationForProfile(deviceId: string, userId: number): Promise<number | null> {
    let latest: number | null = null;
    for (const row of this.rows) {
      if (row.device_id !== deviceId || row.user_id !== userId) {
        continue;
      }
      const value = Number(row.last_verified_at);
      if (latest === null || value > latest) {
        latest = value;
      }
    }
    return latest;
  }

  async listInstalledApps(deviceId: string): Promise<DbInstalledApp[]> {
    return this.rows.filter(row => row.device_id === deviceId).map(row => ({ ...row }));
  }

  async replaceInstalledApps(deviceId: string, apps: NewInstalledApp[]): Promise<void> {
    this.rows = this.rows.filter(row => row.device_id !== deviceId);
    for (const app of apps) {
      this.rows.push({ ...app });
    }
  }

  async upsertInstalledApp(
    deviceId: string,
    userId: number,
    packageName: string,
    isSystem: boolean,
    timestampMs: number
  ): Promise<void> {
    const existing = this.rows.find(row =>
      row.device_id === deviceId &&
      row.user_id === userId &&
      row.package_name === packageName
    );

    if (existing) {
      existing.is_system = isSystem ? 1 : 0;
      existing.last_verified_at = timestampMs;
      return;
    }

    this.rows.push({
      device_id: deviceId,
      user_id: userId,
      package_name: packageName,
      is_system: isSystem ? 1 : 0,
      installed_at: timestampMs,
      last_verified_at: timestampMs,
      daemon_session_id: null,
      device_session_start: null
    });
  }

  async removeInstalledApp(deviceId: string, userId: number, packageName: string): Promise<void> {
    this.rows = this.rows.filter(row =>
      !(row.device_id === deviceId && row.user_id === userId && row.package_name === packageName)
    );
  }

  async removeInstalledAppForDevice(deviceId: string, packageName: string): Promise<void> {
    this.rows = this.rows.filter(row =>
      !(row.device_id === deviceId && row.package_name === packageName)
    );
  }

  async markDeviceStale(deviceId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.device_id === deviceId) {
        row.last_verified_at = 0;
      }
    }
  }

  async markProfileStale(deviceId: string, userId: number): Promise<void> {
    for (const row of this.rows) {
      if (row.device_id === deviceId && row.user_id === userId) {
        row.last_verified_at = 0;
      }
    }
  }

  async touchDevice(deviceId: string, timestampMs: number): Promise<void> {
    for (const row of this.rows) {
      if (row.device_id === deviceId) {
        row.last_verified_at = timestampMs;
      }
    }
  }

  async clearDeviceSession(deviceId: string): Promise<void> {
    this.rows = this.rows.filter(row => row.device_id !== deviceId);
  }

  async clearOldDaemonSessions(currentDaemonSessionId: string): Promise<void> {
    this.rows = this.rows.filter(row =>
      row.daemon_session_id === null ||
      row.daemon_session_id === currentDaemonSessionId
    );
  }

  async setSessionTracking(
    daemonSessionId: string,
    deviceId: string,
    deviceSessionStart: number
  ): Promise<void> {
    for (const row of this.rows) {
      if (row.device_id === deviceId && row.daemon_session_id === null) {
        row.daemon_session_id = daemonSessionId;
        row.device_session_start = deviceSessionStart;
      }
    }
  }
}
