import { expect, describe, test, beforeEach } from "bun:test";
import { InstallApp } from "../../../src/features/action/InstallApp";
import { createPerformanceTracker, type TimingEntry } from "../../../src/utils/PerformanceTracker";
import type { BootedDevice, ExecResult } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeHostCommandExecutor } from "../../fakes/FakeHostCommandExecutor";
import { FakeAndroidBuildToolsLocator } from "../../fakes/FakeAndroidBuildToolsLocator";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeSimctl } from "../../fakes/FakeSimctl";

const createExecResult = (stdout: string, stderr: string = ""): ExecResult => ({
  stdout,
  stderr,
  toString: () => stdout,
  trim: () => stdout.trim(),
  includes: (searchString: string) => stdout.includes(searchString)
});

describe("InstallApp", () => {
  const device: BootedDevice = {
    deviceId: "emulator-5554",
    name: "Test Device",
    platform: "android"
  };
  const iosDevice: BootedDevice = {
    deviceId: "ios-sim-123",
    name: "iPhone 15",
    platform: "ios"
  };

  let fakeAdb: FakeAdbExecutor;
  let fakeHost: FakeHostCommandExecutor;
  let fakeLocator: FakeAndroidBuildToolsLocator;
  let fakeTimer: FakeTimer;
  let fakeSimctl: FakeSimctl;

  beforeEach(() => {
    fakeAdb = new FakeAdbExecutor();
    fakeHost = new FakeHostCommandExecutor();
    fakeLocator = new FakeAndroidBuildToolsLocator();
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    fakeSimctl = new FakeSimctl();
  });

  test("installs using aapt2 and targets work profile user", async () => {
    const apkPath = "/tmp/app-debug.apk";
    const perf = createPerformanceTracker(true, fakeTimer);

    fakeLocator.setTool({ tool: "aapt2", path: "/sdk/build-tools/35.0.0/aapt2" });
    fakeHost.setCommandResponse("aapt2", createExecResult("package: name='com.example.app' versionCode='1'"));

    fakeAdb.setUsers([
      { userId: 0, name: "Owner", flags: 13, running: true },
      { userId: 10, name: "Work", flags: 30, running: true }
    ]);
    fakeAdb.setCommandResponse("shell pm list packages --user 10 -f com.example.app", createExecResult("0"));
    fakeAdb.setCommandResponse(`install --user 10 -r "${apkPath}"`, createExecResult("Success"));

    const installApp = new InstallApp(
      device,
      fakeAdb,
      fakeHost,
      fakeLocator,
      () => perf
    );

    const result = await installApp.execute(apkPath);

    expect(result.success).toBe(true);
    expect(result.upgrade).toBe(false);
    expect(result.userId).toBe(10);
    expect(result.packageName).toBe("com.example.app");
    expect(result.warning).toBeUndefined();
    expect(fakeHost.wasCommandExecuted("aapt2")).toBe(true);
    expect(fakeAdb.wasCommandExecuted("install --user 10 -r")).toBe(true);

    const timings = perf.getTimings() as TimingEntry[];
    const installEntry = timings[0];
    expect(installEntry.name).toBe("installApp");
    const childNames = (installEntry.children as TimingEntry[]).map(entry => entry.name);
    expect(childNames).toEqual([
      "extractPackageName",
      "detectTargetUser",
      "checkInstalled",
      "adbInstall"
    ]);
  });

  test("falls back to package diffing when aapt is unavailable", async () => {
    class SequencedFakeAdbExecutor extends FakeAdbExecutor {
      private listPackagesResponses: ExecResult[] = [];

      setListPackagesResponses(responses: ExecResult[]): void {
        this.listPackagesResponses = [...responses];
      }

      override async executeCommand(
        command: string,
        timeoutMs?: number,
        maxBuffer?: number,
        noRetry?: boolean,
        signal?: AbortSignal
      ): Promise<ExecResult> {
        if (command.includes("shell pm list packages --user 0")) {
          const response = this.listPackagesResponses.shift();
          if (response) {
            await super.executeCommand(command, timeoutMs, maxBuffer, noRetry, signal);
            return response;
          }
        }
        return super.executeCommand(command, timeoutMs, maxBuffer, noRetry, signal);
      }
    }

    const apkPath = "/tmp/app-debug.apk";
    const perf = createPerformanceTracker(true, fakeTimer);
    const sequencedAdb = new SequencedFakeAdbExecutor();

    fakeLocator.setTool(null);
    sequencedAdb.setListPackagesResponses([
      createExecResult("package:com.example.before\n"),
      createExecResult("package:com.example.before\npackage:com.example.new\n")
    ]);
    sequencedAdb.setCommandResponse(`install --user 0 -r \"${apkPath}\"`, createExecResult("Success"));

    const installApp = new InstallApp(
      device,
      sequencedAdb,
      fakeHost,
      fakeLocator,
      () => perf
    );

    const result = await installApp.execute(apkPath);

    expect(result.success).toBe(true);
    expect(result.upgrade).toBe(false);
    expect(result.userId).toBe(0);
    expect(result.packageName).toBe("com.example.new");
    expect(result.warning).toContain("aapt2");
    expect(fakeHost.wasCommandExecuted("aapt2")).toBe(false);
    expect(sequencedAdb.wasCommandExecuted("shell pm list packages --user 0")).toBe(true);
    expect(sequencedAdb.wasCommandExecuted("install --user 0 -r")).toBe(true);
  });

  test("returns a warning when aapt is unavailable and install fails", async () => {
    const apkPath = "/tmp/app-debug.apk";
    const perf = createPerformanceTracker(true, fakeTimer);

    fakeLocator.setTool(null);

    const installApp = new InstallApp(
      device,
      fakeAdb,
      fakeHost,
      fakeLocator,
      () => perf
    );

    const result = await installApp.execute(apkPath);

    expect(result.success).toBe(false);
    expect(result.warning).toContain("aapt2");
  });

  test("installs iOS app via simctl and detects new bundle id", async () => {
    class SequencedFakeSimctl extends FakeSimctl {
      private listResponses: any[][] = [];

      setListResponses(responses: any[][]): void {
        this.listResponses = [...responses];
      }

      override async listApps(deviceId?: string): Promise<any[]> {
        const response = this.listResponses.shift();
        if (response) {
          return response;
        }
        return super.listApps(deviceId);
      }
    }

    const appPath = "/tmp/MyApp.app";
    const perf = createPerformanceTracker(true, fakeTimer);
    const sequencedSimctl = new SequencedFakeSimctl();
    sequencedSimctl.setListResponses([
      [{ bundleId: "com.example.old" }],
      [{ bundleId: "com.example.old" }, { bundleId: "com.example.new" }]
    ]);

    const installApp = new InstallApp(
      iosDevice,
      null,
      null,
      null,
      () => perf,
      sequencedSimctl
    );

    const result = await installApp.execute(appPath);

    expect(result.success).toBe(true);
    expect(result.packageName).toBe("com.example.new");
    expect(result.upgrade).toBe(false);
    expect(sequencedSimctl.wasMethodCalled("installApp")).toBe(true);
  });
});
