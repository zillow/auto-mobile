import { AdbClient } from "../../utils/android-cmdline-tools/AdbClient";
import { BackStackInfo, ActivityInfo, TaskInfo } from "../../models";
import { logger } from "../../utils/logger";
import { PerformanceTracker, NoOpPerformanceTracker } from "../../utils/PerformanceTracker";

/**
 * Extracts back stack information from Android device using dumpsys activity
 */
export class GetBackStack {
  private adb: AdbClient;

  constructor(adb: AdbClient) {
    this.adb = adb;
  }

  /**
   * Parse activities from dumpsys activity activities output
   * @param dumpsysOutput - Raw dumpsys output
   * @returns Array of ActivityInfo objects
   */
  private parseActivities(dumpsysOutput: string): ActivityInfo[] {
    const activities: ActivityInfo[] = [];
    const lines = dumpsysOutput.split("\n");

    let currentTaskId = -1;
    let currentTaskAffinity: string | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match task affinity: "Task id #123" or "TaskRecord{...} #123"
      const taskIdMatch = line.match(/Task\s+id\s+#(\d+)|TaskRecord.*#(\d+)/);
      if (taskIdMatch) {
        currentTaskId = parseInt(taskIdMatch[1] || taskIdMatch[2], 10);
        logger.debug(`[BACK_STACK] Found task ID: ${currentTaskId}`);
      }

      // Match task affinity
      const affinityMatch = line.match(/affinity=([^\s]+)/);
      if (affinityMatch) {
        currentTaskAffinity = affinityMatch[1];
        logger.debug(`[BACK_STACK] Found task affinity: ${currentTaskAffinity}`);
      }

      // Match activity: "Hist #0: ActivityRecord{...} u0 com.example/.MainActivity"
      // or "* Hist #0: ActivityRecord{...} u0 com.example/.MainActivity t123"
      const activityMatch = line.match(/\*?\s*Hist\s+#\d+:\s+ActivityRecord\{[^\}]+\}\s+u\d+\s+([^\s]+)(?:\s+t(\d+))?/);
      if (activityMatch) {
        const fullName = activityMatch[1];
        const taskIdFromActivity = activityMatch[2] ? parseInt(activityMatch[2], 10) : currentTaskId;

        // Parse package/activity name (format: "com.example/.MainActivity" or "com.example/com.example.MainActivity")
        const parts = fullName.split("/");
        const packageName = parts[0];
        let activityName = parts[1] || "";

        // If activity starts with ".", prepend package name
        if (activityName.startsWith(".")) {
          activityName = packageName + activityName;
        }

        const activity: ActivityInfo = {
          name: activityName,
          taskId: taskIdFromActivity,
          taskAffinity: currentTaskAffinity
        };

        activities.push(activity);
        logger.debug(`[BACK_STACK] Found activity: ${activityName} (task: ${taskIdFromActivity})`);
      }
    }

    return activities;
  }

  /**
   * Parse tasks from dumpsys activity activities output
   * @param dumpsysOutput - Raw dumpsys output
   * @returns Array of TaskInfo objects
   */
  private parseTasks(dumpsysOutput: string): TaskInfo[] {
    const tasks: Map<number, TaskInfo> = new Map();
    const lines = dumpsysOutput.split("\n");

    let currentTaskId = -1;
    let currentTask: Partial<TaskInfo> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match task start: "Task id #123" or "TaskRecord{...} #123"
      const taskIdMatch = line.match(/Task\s+id\s+#(\d+)|TaskRecord.*#(\d+)/);
      if (taskIdMatch) {
        // Save previous task if it exists
        if (currentTaskId !== -1 && currentTask.id !== undefined) {
          tasks.set(currentTaskId, currentTask as TaskInfo);
        }

        currentTaskId = parseInt(taskIdMatch[1] || taskIdMatch[2], 10);
        currentTask = { id: currentTaskId };
        logger.debug(`[BACK_STACK] Parsing task: ${currentTaskId}`);
      }

      if (currentTaskId === -1) {
        continue;
      }

      // Match affinity
      const affinityMatch = line.match(/affinity=([^\s]+)/);
      if (affinityMatch) {
        currentTask.affinity = affinityMatch[1];
      }

      // Match realActivity or origActivity to get package name
      const realActivityMatch = line.match(/realActivity=([^\s]+)/);
      if (realActivityMatch) {
        const fullName = realActivityMatch[1];
        const packageName = fullName.split("/")[0];
        currentTask.packageName = packageName;

        // If this is the first activity, it's likely the root
        if (!currentTask.rootActivity) {
          currentTask.rootActivity = fullName;
        }
      }

      // Match numActivities
      const numActivitiesMatch = line.match(/numActivities=(\d+)/);
      if (numActivitiesMatch) {
        currentTask.numActivities = parseInt(numActivitiesMatch[1], 10);
      }
    }

    // Save last task
    if (currentTaskId !== -1 && currentTask.id !== undefined) {
      tasks.set(currentTaskId, currentTask as TaskInfo);
    }

    return Array.from(tasks.values());
  }

  /**
   * Get current/foreground activity from dumpsys output
   * @param dumpsysOutput - Raw dumpsys output
   * @returns Current ActivityInfo or undefined
   */
  private getCurrentActivity(dumpsysOutput: string): ActivityInfo | undefined {
    const lines = dumpsysOutput.split("\n");

    for (const line of lines) {
      // Match mResumedActivity or mFocusedActivity
      // Format: "mResumedActivity: ActivityRecord{...} u0 com.example/.MainActivity t123"
      const resumedMatch = line.match(
        /(mResumedActivity|mFocusedActivity|topResumedActivity)\s*[:=].*?u\d+\s+([^\s]+)(?:\s+t(\d+))?/
      );
      if (resumedMatch) {
        const fullName = resumedMatch[2];
        const taskId = resumedMatch[3] ? parseInt(resumedMatch[3], 10) : -1;

        const parts = fullName.split("/");
        const packageName = parts[0];
        let activityName = parts[1] || "";

        if (activityName.startsWith(".")) {
          activityName = packageName + activityName;
        }

        logger.debug(`[BACK_STACK] Current activity: ${activityName} (task: ${taskId})`);
        return {
          name: activityName,
          taskId
        };
      }
    }

    return undefined;
  }

  /**
   * Execute dumpsys activity activities command and parse the back stack
   * @param perf - Optional performance tracker
   * @returns Promise with BackStackInfo
   */
  async execute(
    perf: PerformanceTracker = new NoOpPerformanceTracker(),
    signal?: AbortSignal
  ): Promise<BackStackInfo> {
    const startTime = Date.now();

    try {
      logger.info("[BACK_STACK] Fetching back stack information via dumpsys");

      // Execute dumpsys activity activities
      const dumpsysOutput = await perf.track("dumpsysActivities", () =>
        this.adb.executeCommand("shell dumpsys activity activities", undefined, undefined, undefined, signal)
      );

      // Parse activities, tasks, and current activity in parallel
      const [activities, tasks, currentActivity] = await perf.track("parseBackStack", () =>
        Promise.all([
          Promise.resolve(this.parseActivities(dumpsysOutput.stdout)),
          Promise.resolve(this.parseTasks(dumpsysOutput.stdout)),
          Promise.resolve(this.getCurrentActivity(dumpsysOutput.stdout))
        ])
      );

      // Calculate depth: number of activities in current task minus 1 (the current activity)
      const currentTaskId = currentActivity?.taskId || -1;
      const activitiesInCurrentTask = activities.filter(a => a.taskId === currentTaskId);
      const depth = Math.max(0, activitiesInCurrentTask.length - 1);

      // Mark the root activity
      if (activitiesInCurrentTask.length > 0) {
        activitiesInCurrentTask[0].isTaskRoot = true;
      }

      const backStackInfo: BackStackInfo = {
        depth,
        activities,
        tasks,
        currentActivity,
        currentTaskId,
        capturedAt: Date.now(),
        source: "adb"
      };

      const duration = Date.now() - startTime;
      logger.info(
        `[BACK_STACK] Back stack retrieved in ${duration}ms: ` +
        `depth=${depth}, activities=${activities.length}, tasks=${tasks.length}, ` +
        `currentActivity=${currentActivity?.name || "unknown"}`
      );

      return backStackInfo;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.warn(`[BACK_STACK] Failed to get back stack after ${duration}ms: ${error}`);

      // Return minimal back stack info on error
      return {
        depth: 0,
        activities: [],
        tasks: [],
        capturedAt: Date.now(),
        partial: true,
        source: "adb"
      };
    }
  }
}
