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

// Navigation graph tables
export interface NavigationAppsTable {
  app_id: string;
  created_at: Generated<string>;
  updated_at: string;
}

export interface NavigationNodesTable {
  id: Generated<number>;
  app_id: string;
  screen_name: string;
  first_seen_at: number;
  last_seen_at: number;
  visit_count: number;
  back_stack_depth: number | null;
  task_id: number | null;
  created_at: Generated<string>;
}

export interface NavigationEdgesTable {
  id: Generated<number>;
  app_id: string;
  from_screen: string;
  to_screen: string;
  tool_name: string | null;
  tool_args: string | null; // JSON blob
  timestamp: number;
  created_at: Generated<string>;
}

export interface UIElementsTable {
  id: Generated<number>;
  app_id: string;
  text: string | null;
  resource_id: string | null;
  content_description: string | null;
  class_name: string | null;
  bounds_left: number | null;
  bounds_top: number | null;
  bounds_right: number | null;
  bounds_bottom: number | null;
  clickable: number | null; // SQLite boolean (0/1)
  scrollable: number | null; // SQLite boolean (0/1)
  first_seen_at: number;
  last_seen_at: number;
  created_at: Generated<string>;
}

export interface EdgeUIElementsTable {
  edge_id: number;
  ui_element_id: number;
  selection_order: number;
}

export interface NodeModalsTable {
  node_id: number;
  modal_identifier: string;
  stack_level: number;
  created_at: Generated<string>;
}

export interface EdgeModalsTable {
  edge_id: number;
  position: string; // 'from' | 'to'
  modal_identifier: string;
  stack_level: number;
  created_at: Generated<string>;
}

export interface ScrollPositionsTable {
  edge_id: number;
  target_element_id: number;
  container_element_id: number | null;
  direction: string;
  speed: string | null;
  swipe_count: number | null;
  created_at: Generated<string>;
}

// Main database interface - add new tables here
export interface Database {
  device_configs: DeviceConfigTable;
  performance_thresholds: PerformanceThresholdsTable;
  performance_audit_results: PerformanceAuditResultsTable;
  navigation_apps: NavigationAppsTable;
  navigation_nodes: NavigationNodesTable;
  navigation_edges: NavigationEdgesTable;
  ui_elements: UIElementsTable;
  edge_ui_elements: EdgeUIElementsTable;
  node_modals: NodeModalsTable;
  edge_modals: EdgeModalsTable;
  scroll_positions: ScrollPositionsTable;
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

export type NavigationApp = Selectable<NavigationAppsTable>;
export type NewNavigationApp = Insertable<NavigationAppsTable>;
export type NavigationAppUpdate = Updateable<NavigationAppsTable>;

export type NavigationNode = Selectable<NavigationNodesTable>;
export type NewNavigationNode = Insertable<NavigationNodesTable>;
export type NavigationNodeUpdate = Updateable<NavigationNodesTable>;

export type NavigationEdge = Selectable<NavigationEdgesTable>;
export type NewNavigationEdge = Insertable<NavigationEdgesTable>;
export type NavigationEdgeUpdate = Updateable<NavigationEdgesTable>;

export type UIElement = Selectable<UIElementsTable>;
export type NewUIElement = Insertable<UIElementsTable>;
export type UIElementUpdate = Updateable<UIElementsTable>;

export type EdgeUIElement = Selectable<EdgeUIElementsTable>;
export type NewEdgeUIElement = Insertable<EdgeUIElementsTable>;

export type NodeModal = Selectable<NodeModalsTable>;
export type NewNodeModal = Insertable<NodeModalsTable>;

export type EdgeModal = Selectable<EdgeModalsTable>;
export type NewEdgeModal = Insertable<EdgeModalsTable>;

export type ScrollPosition = Selectable<ScrollPositionsTable>;
export type NewScrollPosition = Insertable<ScrollPositionsTable>;
