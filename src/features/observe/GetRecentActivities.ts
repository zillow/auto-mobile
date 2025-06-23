import { AdbUtils } from "../../utils/adb";
import { logger } from "../../utils/logger";

export class GetRecentActivities {
  private adb: AdbUtils;

  /**
   * Create a GetRecentActivities instance
   * @param deviceId - Optional device ID
   * @param adbUtils - Optional AdbUtils instance for testing
   */
  constructor(deviceId: string | null = null, adb: AdbUtils | null = null) {
    this.adb = adb || new AdbUtils(deviceId);
  }

  /**
   * Get recent activity information
   * @returns Promise with recent activity data
   */
  async execute(): Promise<any> {
    try {
      const { stdout } = await this.adb.executeCommand("shell dumpsys activity recents");

      // Extract recent tasks information
      const recentTasks: any[] = [];

      // Parse recent tasks
      const taskRegex = /Recent #(\d+):\s+TaskRecord\{([^\s]+)\s+#(\d+)\s+([^}]+)\}/g;
      let match;

      while ((match = taskRegex.exec(stdout)) !== null) {
        const taskId = match[3];
        const packageName = match[4].split("/")[0];

        // Extract activity name if available
        const activityMatch = match[4].match(/\/([^}\s]+)/);
        const activityName = activityMatch ? activityMatch[1] : "";

        recentTasks.push({
          id: taskId,
          packageName,
          activityName
        });
      }

      return {
        timestamp: Date.now(),
        recentTasks
      };
    } catch (err) {
      logger.warn("Failed to get activity recents:", err);
      return {
        timestamp: Date.now(),
        recentTasks: [],
        error: "Failed to retrieve recent activities"
      };
    }
  }
}
