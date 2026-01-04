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

// Accessibility baseline tables
export interface AccessibilityBaselinesTable {
  id: Generated<number>;
  screen_id: string;
  violations_json: string; // JSON blob of WcagViolation[]
  created_at: Generated<string>;
  updated_at: string;
}

// Memory audit tables
export interface MemoryThresholdsTable {
  id: Generated<number>;
  device_id: string;
  package_name: string;
  heap_growth_threshold_mb: number;
  native_heap_growth_threshold_mb: number;
  gc_count_threshold: number;
  gc_duration_threshold_ms: number;
  unreachable_objects_threshold: number;
  weight: number;
  created_at: Generated<string>;
  ttl_hours: number;
}

export interface MemoryBaselinesTable {
  id: Generated<number>;
  device_id: string;
  package_name: string;
  tool_name: string;
  java_heap_baseline_mb: number;
  native_heap_baseline_mb: number;
  gc_count_baseline: number;
  gc_duration_baseline_ms: number;
  unreachable_objects_baseline: number;
  sample_count: number;
  last_updated: string;
  created_at: Generated<string>;
}

export interface MemoryAuditResultsTable {
  id: Generated<number>;
  device_id: string;
  session_id: string;
  package_name: string;
  tool_name: string;
  tool_args: string | null;
  timestamp: string;
  passed: number;
  pre_java_heap_mb: number | null;
  pre_native_heap_mb: number | null;
  pre_total_pss_mb: number | null;
  post_java_heap_mb: number | null;
  post_native_heap_mb: number | null;
  post_total_pss_mb: number | null;
  java_heap_growth_mb: number | null;
  native_heap_growth_mb: number | null;
  total_pss_growth_mb: number | null;
  gc_count: number | null;
  gc_total_duration_ms: number | null;
  unreachable_objects_count: number | null;
  violations_json: string | null;
  diagnostics_json: string | null;
  created_at: Generated<string>;
}

// Recomposition metrics tables
export interface RecompositionMetricsTable {
  id: Generated<number>;
  device_id: string;
  session_id: string;
  package_name: string;
  composable_id: string;
  composable_name: string | null;
  resource_id: string | null;
  test_tag: string | null;
  total_count: number;
  skip_count: number;
  rolling_1s_avg: number | null;
  duration_ms: number | null;
  likely_cause: string | null;
  parent_chain_json: string | null;
  stable_annotated: number | null;
  remembered_count: number | null;
  timestamp: string;
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
  accessibility_baselines: AccessibilityBaselinesTable;
  memory_thresholds: MemoryThresholdsTable;
  memory_baselines: MemoryBaselinesTable;
  memory_audit_results: MemoryAuditResultsTable;
  recomposition_metrics: RecompositionMetricsTable;
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

export type AccessibilityBaseline = Selectable<AccessibilityBaselinesTable>;
export type NewAccessibilityBaseline = Insertable<AccessibilityBaselinesTable>;
export type AccessibilityBaselineUpdate = Updateable<AccessibilityBaselinesTable>;

export type MemoryThresholds = Selectable<MemoryThresholdsTable>;
export type NewMemoryThresholds = Insertable<MemoryThresholdsTable>;
export type MemoryThresholdsUpdate = Updateable<MemoryThresholdsTable>;

export type MemoryBaseline = Selectable<MemoryBaselinesTable>;
export type NewMemoryBaseline = Insertable<MemoryBaselinesTable>;
export type MemoryBaselineUpdate = Updateable<MemoryBaselinesTable>;

export type MemoryAuditResult = Selectable<MemoryAuditResultsTable>;
export type NewMemoryAuditResult = Insertable<MemoryAuditResultsTable>;
export type MemoryAuditResultUpdate = Updateable<MemoryAuditResultsTable>;

export type RecompositionMetrics = Selectable<RecompositionMetricsTable>;
export type NewRecompositionMetrics = Insertable<RecompositionMetricsTable>;
export type RecompositionMetricsUpdate = Updateable<RecompositionMetricsTable>;
