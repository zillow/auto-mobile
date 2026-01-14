import type { Kysely } from "kysely";
import { getDatabase, ensureMigrations } from "./database";
import type { Database, InstalledApp as DbInstalledApp, NewInstalledApp } from "./types";

export interface InstalledAppsStore {
  getLatestVerification(deviceId: string): Promise<number | null>;
  listInstalledApps(deviceId: string): Promise<DbInstalledApp[]>;
  replaceInstalledApps(deviceId: string, apps: NewInstalledApp[]): Promise<void>;
  upsertInstalledApp(
    deviceId: string,
    userId: number,
    packageName: string,
    isSystem: boolean,
    timestampMs: number
  ): Promise<void>;
  removeInstalledApp(
    deviceId: string,
    userId: number,
    packageName: string
  ): Promise<void>;
  removeInstalledAppForDevice(deviceId: string, packageName: string): Promise<void>;
  markDeviceStale(deviceId: string): Promise<void>;
  touchDevice(deviceId: string, timestampMs: number): Promise<void>;
  clearDeviceSession(deviceId: string): Promise<void>;
  clearOldDaemonSessions(currentDaemonSessionId: string): Promise<void>;
  setSessionTracking(daemonSessionId: string, deviceId: string, deviceSessionStart: number): Promise<void>;
}

export class InstalledAppsRepository implements InstalledAppsStore {
  private db: Kysely<Database> | null;

  constructor(db?: Kysely<Database>) {
    this.db = db ?? null;
  }

  private async getDb(): Promise<Kysely<Database>> {
    if (this.db) {
      return this.db;
    }
    await ensureMigrations();
    return getDatabase();
  }

  async getLatestVerification(deviceId: string): Promise<number | null> {
    const db = await this.getDb();
    const row = await db
      .selectFrom("installed_apps")
      .select(db.fn.max<number>("last_verified_at").as("last_verified_at"))
      .where("device_id", "=", deviceId)
      .executeTakeFirst();

    if (!row || row.last_verified_at === null || row.last_verified_at === undefined) {
      return null;
    }

    return Number(row.last_verified_at);
  }

  async listInstalledApps(deviceId: string): Promise<DbInstalledApp[]> {
    const db = await this.getDb();
    return db
      .selectFrom("installed_apps")
      .selectAll()
      .where("device_id", "=", deviceId)
      .execute();
  }

  async replaceInstalledApps(deviceId: string, apps: NewInstalledApp[]): Promise<void> {
    const db = await this.getDb();
    await db.transaction().execute(async trx => {
      await trx
        .deleteFrom("installed_apps")
        .where("device_id", "=", deviceId)
        .execute();

      if (apps.length > 0) {
        await trx
          .insertInto("installed_apps")
          .values(apps)
          .execute();
      }
    });
  }

  async upsertInstalledApp(
    deviceId: string,
    userId: number,
    packageName: string,
    isSystem: boolean,
    timestampMs: number
  ): Promise<void> {
    const db = await this.getDb();
    const row: NewInstalledApp = {
      device_id: deviceId,
      user_id: userId,
      package_name: packageName,
      is_system: isSystem ? 1 : 0,
      installed_at: timestampMs,
      last_verified_at: timestampMs
    };

    await db
      .insertInto("installed_apps")
      .values(row)
      .onConflict(oc =>
        oc.columns(["device_id", "user_id", "package_name"]).doUpdateSet({
          is_system: row.is_system,
          last_verified_at: row.last_verified_at
        })
      )
      .execute();
  }

  async removeInstalledApp(
    deviceId: string,
    userId: number,
    packageName: string
  ): Promise<void> {
    const db = await this.getDb();
    await db
      .deleteFrom("installed_apps")
      .where("device_id", "=", deviceId)
      .where("user_id", "=", userId)
      .where("package_name", "=", packageName)
      .execute();
  }

  async removeInstalledAppForDevice(
    deviceId: string,
    packageName: string
  ): Promise<void> {
    const db = await this.getDb();
    await db
      .deleteFrom("installed_apps")
      .where("device_id", "=", deviceId)
      .where("package_name", "=", packageName)
      .execute();
  }

  async markDeviceStale(deviceId: string): Promise<void> {
    const db = await this.getDb();
    await db
      .updateTable("installed_apps")
      .set({ last_verified_at: 0 })
      .where("device_id", "=", deviceId)
      .execute();
  }

  async touchDevice(deviceId: string, timestampMs: number): Promise<void> {
    const db = await this.getDb();
    await db
      .updateTable("installed_apps")
      .set({ last_verified_at: timestampMs })
      .where("device_id", "=", deviceId)
      .execute();
  }

  async clearDeviceSession(deviceId: string): Promise<void> {
    const db = await this.getDb();
    await db
      .deleteFrom("installed_apps")
      .where("device_id", "=", deviceId)
      .execute();
  }

  async clearOldDaemonSessions(currentDaemonSessionId: string): Promise<void> {
    const db = await this.getDb();
    await db
      .deleteFrom("installed_apps")
      .where("daemon_session_id", "is not", null)
      .where("daemon_session_id", "!=", currentDaemonSessionId)
      .execute();
  }

  async setSessionTracking(
    daemonSessionId: string,
    deviceId: string,
    deviceSessionStart: number
  ): Promise<void> {
    const db = await this.getDb();
    await db
      .updateTable("installed_apps")
      .set({
        daemon_session_id: daemonSessionId,
        device_session_start: deviceSessionStart
      })
      .where("device_id", "=", deviceId)
      .where("daemon_session_id", "is", null)
      .execute();
  }
}
