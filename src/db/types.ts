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

// Installed apps cache table
export interface InstalledAppsTable {
  device_id: string;
  user_id: number;
  package_name: string;
  is_system: number; // SQLite boolean (0/1)
  installed_at: number;
  last_verified_at: number;
  daemon_session_id: string | null;
  device_session_start: number | null;
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
  screenshot_path: string | null;
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

// Prediction accuracy tables
export interface PredictionOutcomesTable {
  id: Generated<number>;
  app_id: string;
  prediction_id: string;
  timestamp: number;
  from_screen: string;
  predicted_screen: string;
  actual_screen: string;
  tool_name: string;
  tool_args: string;
  predicted_elements: string | null;
  found_elements: string | null;
  confidence: number;
  match_score: number;
  correct: number;
  partial_match: number;
  error_type: string | null;
  created_at: Generated<string>;
}

export interface PredictionTransitionStatsTable {
  id: Generated<number>;
  app_id: string;
  from_screen: string;
  to_screen: string;
  tool_name: string;
  tool_args: string;
  attempts: number;
  successes: number;
  total_confidence: number;
  brier_score_sum: number;
  updated_at: string;
  created_at: Generated<string>;
}

// Tool call tracking table
export interface ToolCallsTable {
  id: Generated<number>;
  tool_name: string;
  timestamp: string;
  session_uuid: string | null;
  status: string | null; // success, failure
  error_message: string | null;
  error_type: string | null;
  device_id: string | null;
  package_name: string | null;
  duration_ms: number | null;
  tool_args: string | null; // JSON blob
  created_at: Generated<string>;
}

// Crash tracking table
export interface CrashesTable {
  id: Generated<number>;
  device_id: string;
  package_name: string;
  crash_type: "java" | "native" | "system";
  timestamp: number;
  process_name: string | null;
  pid: number | null;
  exception_class: string | null;
  exception_message: string | null;
  stacktrace: string | null;
  signal: string | null; // For native crashes
  fault_address: string | null; // For native crashes
  tombstone_path: string | null;
  detection_source: "logcat" | "tombstone" | "dropbox" | "accessibility" | "process_monitor";
  raw_log: string | null;
  navigation_node_id: number | null;
  test_execution_id: number | null;
  session_uuid: string | null;
  created_at: Generated<string>;
}

// ANR tracking table
export interface AnrsTable {
  id: Generated<number>;
  device_id: string;
  package_name: string;
  timestamp: number;
  process_name: string | null;
  pid: number | null;
  reason: string | null;
  activity: string | null;
  wait_duration_ms: number | null;
  cpu_usage: string | null;
  main_thread_state: string | null;
  stacktrace: string | null;
  detection_source: "logcat" | "dropbox" | "accessibility";
  raw_log: string | null;
  navigation_node_id: number | null;
  test_execution_id: number | null;
  session_uuid: string | null;
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

// Test execution timing table
export interface TestExecutionsTable {
  id: Generated<number>;
  test_class: string;
  test_method: string;
  duration_ms: number;
  status: "passed" | "failed" | "skipped";
  timestamp: number;
  device_id: string | null;
  device_name: string | null;
  device_platform: "android" | "ios" | null;
  device_type: "emulator" | "simulator" | "device" | null;
  app_version: string | null;
  git_commit: string | null;
  target_sdk: number | null;
  jdk_version: string | null;
  jvm_target: string | null;
  gradle_version: string | null;
  is_ci: number | null;
  session_uuid: string | null;
  error_message: string | null;
  video_path: string | null;
  snapshot_path: string | null;
  created_at: Generated<string>;
}

// Test execution step details
export interface TestExecutionStepsTable {
  id: Generated<number>;
  execution_id: number;
  step_index: number;
  action: string;
  target: string | null;
  status: "completed" | "failed" | "skipped";
  duration_ms: number;
  screen_name: string | null;
  screenshot_path: string | null;
  error_message: string | null;
  details_json: string | null;
  created_at: Generated<string>;
}

// Screens visited during test execution
export interface TestExecutionScreensTable {
  id: Generated<number>;
  execution_id: number;
  screen_name: string;
  visit_order: number;
  timestamp: number;
  created_at: Generated<string>;
}

// Test coverage tables
export interface TestCoverageSessionsTable {
  id: Generated<number>;
  session_uuid: string;
  app_id: string;
  start_time: number;
  end_time: number | null;
  total_nodes_visited: number;
  total_edges_traversed: number;
  created_at: Generated<string>;
}

export interface TestNodeCoverageTable {
  id: Generated<number>;
  session_id: number;
  node_id: number;
  visit_count: number;
  first_visit_time: number;
  last_visit_time: number;
  created_at: Generated<string>;
}

export interface TestEdgeCoverageTable {
  id: Generated<number>;
  session_id: number;
  edge_id: number;
  traversal_count: number;
  first_traversal_time: number;
  last_traversal_time: number;
  created_at: Generated<string>;
}

// Feature flags table
export interface FeatureFlagsTable {
  key: string;
  enabled: number; // SQLite boolean (0/1)
  config_json: string | null;
  created_at: Generated<string>;
  updated_at: string;
}

// Device snapshot tables
export interface DeviceSnapshotsTable {
  snapshot_name: string;
  device_id: string;
  device_name: string;
  platform: "android" | "ios";
  snapshot_type: string;
  include_app_data: number;
  include_settings: number;
  created_at: string;
  last_accessed_at: string;
  size_bytes: number;
  manifest_json: string;
}

export interface DeviceSnapshotConfigsTable {
  key: string;
  config_json: string;
  updated_at: string;
  created_at: Generated<string>;
}

// Video recording tables
export interface VideoRecordingsTable {
  recording_id: string;
  device_id: string;
  platform: "android" | "ios";
  status: string;
  output_name: string | null;
  file_name: string;
  file_path: string;
  format: string;
  size_bytes: number;
  duration_ms: number | null;
  codec: string | null;
  created_at: string;
  started_at: string;
  ended_at: string | null;
  last_accessed_at: string;
  config_json: string;
  highlights_json: string | null;
}

export interface VideoRecordingConfigsTable {
  key: string;
  config_json: string;
  updated_at: string;
  created_at: Generated<string>;
}

export interface AppearanceConfigsTable {
  key: string;
  config_json: string;
  updated_at: string;
  created_at: Generated<string>;
}

// Main database interface - add new tables here
export interface Database {
  device_configs: DeviceConfigTable;
  installed_apps: InstalledAppsTable;
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
  prediction_outcomes: PredictionOutcomesTable;
  prediction_transition_stats: PredictionTransitionStatsTable;
  tool_calls: ToolCallsTable;
  accessibility_baselines: AccessibilityBaselinesTable;
  memory_thresholds: MemoryThresholdsTable;
  memory_baselines: MemoryBaselinesTable;
  memory_audit_results: MemoryAuditResultsTable;
  recomposition_metrics: RecompositionMetricsTable;
  test_executions: TestExecutionsTable;
  test_execution_steps: TestExecutionStepsTable;
  test_execution_screens: TestExecutionScreensTable;
  feature_flags: FeatureFlagsTable;
  device_snapshots: DeviceSnapshotsTable;
  device_snapshot_configs: DeviceSnapshotConfigsTable;
  video_recordings: VideoRecordingsTable;
  video_recording_configs: VideoRecordingConfigsTable;
  appearance_configs: AppearanceConfigsTable;
  test_coverage_sessions: TestCoverageSessionsTable;
  test_node_coverage: TestNodeCoverageTable;
  test_edge_coverage: TestEdgeCoverageTable;
  failure_groups: FailureGroupsTable;
  failure_occurrences: FailureOccurrencesTable;
  failure_occurrence_screens: FailureOccurrenceScreensTable;
  failure_captures: FailureCapturesTable;
  failure_notifications: FailureNotificationsTable;
  crashes: CrashesTable;
  anrs: AnrsTable;
}

// Convenience types for each table
export type DeviceConfig = Selectable<DeviceConfigTable>;
export type NewDeviceConfig = Insertable<DeviceConfigTable>;
export type DeviceConfigUpdate = Updateable<DeviceConfigTable>;

export type InstalledApp = Selectable<InstalledAppsTable>;
export type NewInstalledApp = Insertable<InstalledAppsTable>;
export type InstalledAppUpdate = Updateable<InstalledAppsTable>;

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

export type PredictionOutcome = Selectable<PredictionOutcomesTable>;
export type NewPredictionOutcome = Insertable<PredictionOutcomesTable>;

export type PredictionTransitionStats = Selectable<PredictionTransitionStatsTable>;
export type NewPredictionTransitionStats = Insertable<PredictionTransitionStatsTable>;
export type PredictionTransitionStatsUpdate = Updateable<PredictionTransitionStatsTable>;

export type ToolCall = Selectable<ToolCallsTable>;
export type NewToolCall = Insertable<ToolCallsTable>;

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

export type FeatureFlag = Selectable<FeatureFlagsTable>;
export type NewFeatureFlag = Insertable<FeatureFlagsTable>;
export type FeatureFlagUpdate = Updateable<FeatureFlagsTable>;

export type DeviceSnapshot = Selectable<DeviceSnapshotsTable>;
export type NewDeviceSnapshot = Insertable<DeviceSnapshotsTable>;
export type DeviceSnapshotUpdate = Updateable<DeviceSnapshotsTable>;

export type DeviceSnapshotConfig = Selectable<DeviceSnapshotConfigsTable>;
export type NewDeviceSnapshotConfig = Insertable<DeviceSnapshotConfigsTable>;
export type DeviceSnapshotConfigUpdate = Updateable<DeviceSnapshotConfigsTable>;

export type VideoRecording = Selectable<VideoRecordingsTable>;
export type NewVideoRecording = Insertable<VideoRecordingsTable>;
export type VideoRecordingUpdate = Updateable<VideoRecordingsTable>;

export type VideoRecordingConfig = Selectable<VideoRecordingConfigsTable>;
export type NewVideoRecordingConfig = Insertable<VideoRecordingConfigsTable>;
export type VideoRecordingConfigUpdate = Updateable<VideoRecordingConfigsTable>;

export type AppearanceConfig = Selectable<AppearanceConfigsTable>;
export type NewAppearanceConfig = Insertable<AppearanceConfigsTable>;
export type AppearanceConfigUpdate = Updateable<AppearanceConfigsTable>;
export type TestExecution = Selectable<TestExecutionsTable>;
export type NewTestExecution = Insertable<TestExecutionsTable>;
export type TestExecutionUpdate = Updateable<TestExecutionsTable>;

export type TestExecutionStep = Selectable<TestExecutionStepsTable>;
export type NewTestExecutionStep = Insertable<TestExecutionStepsTable>;

export type TestExecutionScreen = Selectable<TestExecutionScreensTable>;
export type NewTestExecutionScreen = Insertable<TestExecutionScreensTable>;

export type TestCoverageSession = Selectable<TestCoverageSessionsTable>;
export type NewTestCoverageSession = Insertable<TestCoverageSessionsTable>;
export type TestCoverageSessionUpdate = Updateable<TestCoverageSessionsTable>;

export type TestNodeCoverage = Selectable<TestNodeCoverageTable>;
export type NewTestNodeCoverage = Insertable<TestNodeCoverageTable>;

export type TestEdgeCoverage = Selectable<TestEdgeCoverageTable>;
export type NewTestEdgeCoverage = Insertable<TestEdgeCoverageTable>;

// Failure tracking tables
export interface FailureGroupsTable {
  id: string;
  type: "crash" | "anr" | "tool_failure";
  signature: string;
  title: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  first_occurrence: number;
  last_occurrence: number;
  total_count: number;
  unique_sessions: number;
  stack_trace_json: string | null;
  tool_call_info_json: string | null;
  created_at: Generated<string>;
  updated_at: string;
}

export interface FailureOccurrencesTable {
  id: string;
  group_id: string;
  timestamp: number;
  device_id: string | null;
  device_model: string;
  os: string;
  app_version: string;
  session_id: string;
  screen_at_failure: string | null;
  test_name: string | null;
  test_execution_id: number | null;
  error_code: string | null;
  duration_ms: number | null;
  tool_args_json: string | null;
  created_at: Generated<string>;
}

export interface FailureOccurrenceScreensTable {
  id: Generated<number>;
  occurrence_id: string;
  screen_name: string;
  visit_order: number;
  created_at: Generated<string>;
}

export interface FailureCapturesTable {
  id: string;
  occurrence_id: string;
  type: "screenshot" | "video";
  path: string;
  timestamp: number;
  device_model: string;
  created_at: Generated<string>;
}

export interface FailureNotificationsTable {
  id: Generated<number>;
  occurrence_id: string;
  group_id: string;
  type: "crash" | "anr" | "tool_failure";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  timestamp: number;
  acknowledged: number; // SQLite boolean (0/1)
  created_at: Generated<string>;
}

export type FailureGroup = Selectable<FailureGroupsTable>;
export type NewFailureGroup = Insertable<FailureGroupsTable>;
export type FailureGroupUpdate = Updateable<FailureGroupsTable>;

export type FailureOccurrence = Selectable<FailureOccurrencesTable>;
export type NewFailureOccurrence = Insertable<FailureOccurrencesTable>;

export type FailureOccurrenceScreen = Selectable<FailureOccurrenceScreensTable>;
export type NewFailureOccurrenceScreen = Insertable<FailureOccurrenceScreensTable>;

export type FailureCapture = Selectable<FailureCapturesTable>;
export type NewFailureCapture = Insertable<FailureCapturesTable>;

export type FailureNotification = Selectable<FailureNotificationsTable>;
export type NewFailureNotification = Insertable<FailureNotificationsTable>;
export type FailureNotificationUpdate = Updateable<FailureNotificationsTable>;

export type Crash = Selectable<CrashesTable>;
export type NewCrash = Insertable<CrashesTable>;
export type CrashUpdate = Updateable<CrashesTable>;

export type Anr = Selectable<AnrsTable>;
export type NewAnr = Insertable<AnrsTable>;
export type AnrUpdate = Updateable<AnrsTable>;
