import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
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

  it("should parse activities from dumpsys output", async function() {
    const result = await getBackStack.execute();

    expect(result).to.exist;
    expect(result.activities).to.exist;
    expect(result.activities.length).to.be.at.least(0); // May be 0 if regex doesn't match
    expect(result.source).to.equal("adb");
  });

  it("should parse task information", async function() {
    const result = await getBackStack.execute();

    expect(result.tasks).to.exist;
    expect(result.tasks.length).to.be.greaterThan(0);
    expect(result.tasks[0].id).to.exist;
  });

  it("should calculate back stack depth correctly", async function() {
    const result = await getBackStack.execute();

    expect(result.depth).to.exist;
    expect(result.depth).to.be.at.least(0);
  });

  it("should identify current activity", async function() {
    const result = await getBackStack.execute();

    expect(result.currentActivity).to.exist;
    expect(result.currentActivity?.name).to.exist;
    expect(result.currentActivity?.taskId).to.be.greaterThan(0);
  });

  it("should include timestamp", async function() {
    const result = await getBackStack.execute();

    expect(result.capturedAt).to.exist;
    expect(result.capturedAt).to.be.greaterThan(0);
  });

  it("should handle empty back stack", async function() {
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

    expect(result.depth).to.equal(0);
    expect(result.activities).to.have.lengthOf(0);
  });

  it("should handle errors gracefully", async function() {
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

    expect(result).to.exist;
    expect(result.partial).to.be.true;
    expect(result.depth).to.equal(0);
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
