import type { Generated, Insertable, Selectable, Updateable } from "kysely";

/**
 * Database schema type definitions for Kysely.
 * These types provide compile-time SQL validation.
 */

// Device configuration table
export interface DeviceConfigTable {
  id: Generated<number>;
  device_id: string;
  platform: "android" | "ios";
  active_mode: string | null;
  config_json: string; // JSON blob for flexible config storage
  created_at: Generated<string>;
  updated_at: string;
}

// Main database interface - add new tables here
export interface Database {
  device_configs: DeviceConfigTable;
}

// Convenience types for each table
export type DeviceConfig = Selectable<DeviceConfigTable>;
export type NewDeviceConfig = Insertable<DeviceConfigTable>;
export type DeviceConfigUpdate = Updateable<DeviceConfigTable>;
