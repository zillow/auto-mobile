/**
 * Represents information about a fragment in the back stack
 */
export interface FragmentInfo {
  /** Fragment class name */
  name: string;
  /** Fragment tag if available */
  tag?: string;
  /** Fragment ID */
  id?: number;
}

/**
 * Represents information about an activity in the back stack
 */
export interface ActivityInfo {
  /** Activity class name (e.g., "com.example.MainActivity") */
  name: string;
  /** Task ID this activity belongs to */
  taskId: number;
  /** Task affinity */
  taskAffinity?: string;
  /** Whether this activity is the task root */
  isTaskRoot?: boolean;
  /** Fragments in this activity's back stack (if detectable) */
  fragments?: FragmentInfo[];
}

/**
 * Represents information about a task in the back stack
 */
export interface TaskInfo {
  /** Task ID */
  id: number;
  /** Task affinity */
  affinity?: string;
  /** Package name for this task */
  packageName?: string;
  /** Root activity of the task */
  rootActivity?: string;
  /** Top activity of the task */
  topActivity?: string;
  /** Number of activities in this task */
  numActivities?: number;
}

/**
 * Represents the complete back stack state
 */
export interface BackStackInfo {
  /** Total depth of the back stack (number of entries that can be popped) */
  depth: number;
  /** Activities in the back stack, ordered from bottom to top */
  activities: ActivityInfo[];
  /** Tasks in the back stack */
  tasks: TaskInfo[];
  /** The current foreground activity */
  currentActivity?: ActivityInfo;
  /** The current task ID */
  currentTaskId?: number;
  /** Timestamp when this back stack info was captured (device time in milliseconds) */
  capturedAt?: number;
  /** Whether the back stack information is partial/incomplete */
  partial?: boolean;
  /** Source of the back stack data: 'adb' | 'accessibility-service' | 'hybrid' */
  source?: string;
}
