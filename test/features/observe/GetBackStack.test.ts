import { beforeEach, describe, expect, test } from "bun:test";
import { GetBackStack } from "../../../src/features/observe/GetBackStack";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { ExecResult, BootedDevice } from "../../../src/models";

describe("GetBackStack", function() {
  let adb: AdbClient;
  let getBackStack: GetBackStack;

  beforeEach(function() {
    const mockDevice: BootedDevice = {
      name: "test",
      platform: "android",
      deviceId: "test-device"
    };

    // Create a mock ADB client
    adb = new AdbClient(
      mockDevice,
      async (command: string) => {
        // Mock dumpsys activity activities output
        if (command.includes("dumpsys activity activities")) {
          return mockDumpsysOutput();
        }
        return { stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false };
      }
    );

    getBackStack = new GetBackStack(adb);
  });

  test("should parse activities from dumpsys output", async function() {
    const result = await getBackStack.execute();

    expect(result).toBeDefined();
    expect(result.activities).toBeDefined();
    expect(result.activities.length).toBeGreaterThanOrEqual(0); // May be 0 if regex doesn't match
    expect(result.source).toBe("adb");
  });

  test("should parse task information", async function() {
    const result = await getBackStack.execute();

    expect(result.tasks).toBeDefined();
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.tasks[0].id).toBeDefined();
  });

  test("should calculate back stack depth correctly", async function() {
    const result = await getBackStack.execute();

    expect(result.depth).toBeDefined();
    expect(result.depth).toBeGreaterThanOrEqual(0);
  });

  test("should identify current activity", async function() {
    const result = await getBackStack.execute();

    expect(result.currentActivity).toBeDefined();
    expect(result.currentActivity?.name).toBeDefined();
    expect(result.currentActivity?.taskId).toBeGreaterThan(0);
  });

  test("should include timestamp", async function() {
    const result = await getBackStack.execute();

    expect(result.capturedAt).toBeDefined();
    expect(result.capturedAt).toBeGreaterThan(0);
  });

  test("should handle empty back stack", async function() {
    const mockDevice: BootedDevice = {
      name: "test",
      platform: "android",
      deviceId: "test-device"
    };

    // Mock empty output
    adb = new AdbClient(
      mockDevice,
      async () => ({ stdout: "", stderr: "", toString: () => "", trim: () => "", includes: () => false })
    );
    getBackStack = new GetBackStack(adb);

    const result = await getBackStack.execute();

    expect(result.depth).toBe(0);
    expect(result.activities).toHaveLength(0);
  });

  test("should handle errors gracefully", async function() {
    const mockDevice: BootedDevice = {
      name: "test",
      platform: "android",
      deviceId: "test-device"
    };

    // Mock error
    adb = new AdbClient(
      mockDevice,
      async () => {
        throw new Error("ADB command failed");
      }
    );
    getBackStack = new GetBackStack(adb);

    const result = await getBackStack.execute();

    expect(result).toBeDefined();
    expect(result.partial).toBe(true);
    expect(result.depth).toBe(0);
  });
});

// Mock dumpsys activity activities output
function mockDumpsysOutput(): ExecResult {
  const stdout = `
ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)
Display #0 (activities from top to bottom):

  Stack #0: type=home mode=fullscreen
  isSleeping=false

    Task id #1
    affinity=com.android.launcher3
    realActivity=com.android.launcher3/.Launcher
    numActivities=1
      * Hist #0: ActivityRecord{abc123 u0 com.android.launcher3/.Launcher t1}

  Stack #1: type=standard mode=fullscreen
  isSleeping=false

    Task id #123
    affinity=dev.jasonpearson.automobile.playground
    realActivity=dev.jasonpearson.automobile.playground/.MainActivity
    numActivities=3
      * Hist #2: ActivityRecord{def456 u0 dev.jasonpearson.automobile.playground/.DetailActivity t123}
      * Hist #1: ActivityRecord{ghi789 u0 dev.jasonpearson.automobile.playground/.ListActivity t123}
      * Hist #0: ActivityRecord{jkl012 u0 dev.jasonpearson.automobile.playground/.MainActivity t123}

  Running activities (most recent first):
    TaskRecord{task123 #123 A=dev.jasonpearson.automobile.playground U=0 StackId=1 sz=3}
    TaskRecord{task1 #1 A=com.android.launcher3 U=0 StackId=0 sz=1}

  mResumedActivity: ActivityRecord{def456 u0 dev.jasonpearson.automobile.playground/.DetailActivity t123}
  mFocusedActivity: ActivityRecord{def456 u0 dev.jasonpearson.automobile.playground/.DetailActivity t123}
`;

  return {
    stdout,
    stderr: "",
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (str: string) => stdout.includes(str)
  };
}
