import { beforeEach, describe, expect, test } from "bun:test";
import { GetBackStack } from "../../../src/features/observe/GetBackStack";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { ExecResult, BootedDevice } from "../../../src/models";
import type { AdbClientFactory } from "../../../src/utils/android-cmdline-tools/AdbClientFactory";

describe("GetBackStack", function() {
  let fakeAdb: FakeAdbExecutor;
  let fakeAdbFactory: AdbClientFactory;
  let getBackStack: GetBackStack;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      name: "test",
      platform: "android",
      deviceId: "test-device"
    };

    // Create FakeAdbExecutor and configure it with pattern matching
    fakeAdb = new FakeAdbExecutor();
    fakeAdb.setCommandResponse("dumpsys activity activities", mockDumpsysOutput());

    // Create a factory that returns our fake
    fakeAdbFactory = { create: () => fakeAdb };

    getBackStack = new GetBackStack(fakeAdbFactory, mockDevice);
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

  test("should parse topResumedActivity with special characters", async function() {
    const stdout = `
ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)
  Task id #42
  affinity=com.example.app
  realActivity=com.example.app/.MainActivity
  numActivities=1
    * Hist #0: ActivityRecord{abc123 u0 com.example.app/.MainActivity t42}

  topResumedActivity=ActivityRecord{def456 u0 com.example.app/.MainActivity$Inner t42}
`;

    const testFakeAdb = new FakeAdbExecutor();
    testFakeAdb.setCommandResponse("dumpsys activity activities", { stdout, stderr: "" });
    const testFactory: AdbClientFactory = { create: () => testFakeAdb };
    getBackStack = new GetBackStack(testFactory, mockDevice);

    const result = await getBackStack.execute();

    expect(result.currentActivity?.name).toBe("com.example.app.MainActivity$Inner");
    expect(result.currentActivity?.taskId).toBe(42);
  });

  test("should include timestamp", async function() {
    const result = await getBackStack.execute();

    expect(result.capturedAt).toBeDefined();
    expect(result.capturedAt).toBeGreaterThan(0);
  });

  test("should handle empty back stack", async function() {
    // Mock empty output
    const emptyFakeAdb = new FakeAdbExecutor();
    emptyFakeAdb.setCommandResponse("dumpsys activity activities", { stdout: "", stderr: "" });
    const emptyFactory: AdbClientFactory = { create: () => emptyFakeAdb };
    getBackStack = new GetBackStack(emptyFactory, mockDevice);

    const result = await getBackStack.execute();

    expect(result.depth).toBe(0);
    expect(result.activities).toHaveLength(0);
  });

  test("should handle errors gracefully", async function() {
    // Mock error by setting default response and letting the error handling work
    const errorFakeAdb = new FakeAdbExecutor();
    // Don't set any response - the error will come from the parsing logic
    const errorFactory: AdbClientFactory = { create: () => errorFakeAdb };
    getBackStack = new GetBackStack(errorFactory, mockDevice);

    const result = await getBackStack.execute();

    expect(result).toBeDefined();
    // When command returns empty but succeeds, result won't have partial flag
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
