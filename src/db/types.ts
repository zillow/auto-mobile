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

// Performance thresholds table
export interface PerformanceThresholdsTable {
  id: Generated<number>;
  device_id: string;
  session_id: string;
  refresh_rate: number;
  frame_time_threshold_ms: number;
  p50_threshold_ms: number;
  p90_threshold_ms: number;
  p95_threshold_ms: number;
  p99_threshold_ms: number;
  jank_count_threshold: number;
  cpu_usage_threshold_percent: number;
  touch_latency_threshold_ms: number;
  weight: number;
  created_at: Generated<string>;
  ttl_hours: number;
}

// Performance audit results table
export interface PerformanceAuditResultsTable {
  id: Generated<number>;
  device_id: string;
  session_id: string;
  package_name: string;
  timestamp: string;
  passed: number;
  p50_ms: number | null;
  p90_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  jank_count: number | null;
  missed_vsync_count: number | null;
  slow_ui_thread_count: number | null;
  frame_deadline_missed_count: number | null;
  cpu_usage_percent: number | null;
  touch_latency_ms: number | null;
  diagnostics_json: string | null;
  created_at: Generated<string>;
}

// Main database interface - add new tables here
export interface Database {
  device_configs: DeviceConfigTable;
  performance_thresholds: PerformanceThresholdsTable;
  performance_audit_results: PerformanceAuditResultsTable;
}

// Convenience types for each table
export type DeviceConfig = Selectable<DeviceConfigTable>;
export type NewDeviceConfig = Insertable<DeviceConfigTable>;
export type DeviceConfigUpdate = Updateable<DeviceConfigTable>;

export type PerformanceThresholds = Selectable<PerformanceThresholdsTable>;
export type NewPerformanceThresholds = Insertable<PerformanceThresholdsTable>;
export type PerformanceThresholdsUpdate = Updateable<PerformanceThresholdsTable>;

export type PerformanceAuditResult = Selectable<PerformanceAuditResultsTable>;
export type NewPerformanceAuditResult = Insertable<PerformanceAuditResultsTable>;
export type PerformanceAuditResultUpdate = Updateable<PerformanceAuditResultsTable>;
