export type DisplayedLogcatTag = "ActivityManager" | "ActivityTaskManager";

/**
 * Android "Displayed" logcat metric for app startup timing.
 */
export interface DisplayedTimeMetric {
  /** App package name extracted from the displayed component. */
  packageName: string;
  /** Fully qualified activity name (best effort). */
  activityName: string;
  /** Raw component name from logcat (e.g., com.example/.MainActivity). */
  componentName: string;
  /** Time to display the activity, in milliseconds. */
  displayedTimeMs: number;
  /** Logcat timestamp (milliseconds since epoch). */
  timestampMs: number;
  /** Logcat tag that emitted the entry. */
  logcatTag: DisplayedLogcatTag;
}
