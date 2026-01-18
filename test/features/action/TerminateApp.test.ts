import { expect, describe, test, beforeEach } from "bun:test";
import { TerminateApp } from "../../../src/features/action/TerminateApp";
import type { BootedDevice } from "../../../src/models";
import { FakeSimctl } from "../../fakes/FakeSimctl";
import { FakeTimer } from "../../fakes/FakeTimer";
import { FakeAdbClient } from "../../fakes/FakeAdbClient";

describe("TerminateApp (iOS)", () => {
  const iosDevice: BootedDevice = {
    deviceId: "ios-sim-123",
    name: "iPhone 15",
    platform: "ios"
  };

  let fakeSimctl: FakeSimctl;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeSimctl = new FakeSimctl();
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
  });

  test("terminates installed app via simctl", async () => {
    fakeSimctl.setInstalledApps([{ bundleId: "com.example.app" }]);

    const terminateApp = new TerminateApp(iosDevice, null, fakeSimctl, fakeTimer);
    const result = await terminateApp.execute("com.example.app", { skipObservation: true });

    expect(result.success).toBe(true);
    expect(result.wasInstalled).toBe(true);
    expect(result.wasRunning).toBe(true);
    expect(result.wasForeground).toBe(false);
    expect(fakeSimctl.wasMethodCalled("terminateApp")).toBe(true);
  });

  test("marks app as not running when simctl reports no process", async () => {
    class NoProcessSimctl extends FakeSimctl {
      override async terminateApp(bundleId: string, deviceId?: string): Promise<void> {
        await super.terminateApp(bundleId, deviceId);
        throw new Error("found nothing to terminate");
      }
    }

    const noProcessSimctl = new NoProcessSimctl();
    noProcessSimctl.setInstalledApps([{ bundleId: "com.example.app" }]);

    const terminateApp = new TerminateApp(iosDevice, null, noProcessSimctl, fakeTimer);
    const result = await terminateApp.execute("com.example.app", { skipObservation: true });

    expect(result.success).toBe(true);
    expect(result.wasInstalled).toBe(true);
    expect(result.wasRunning).toBe(false);
  });

  test("returns not installed when bundle id is missing", async () => {
    fakeSimctl.setInstalledApps([{ bundleId: "com.example.other" }]);

    const terminateApp = new TerminateApp(iosDevice, null, fakeSimctl, fakeTimer);
    const result = await terminateApp.execute("com.example.app", { skipObservation: true });

    expect(result.success).toBe(true);
    expect(result.wasInstalled).toBe(false);
    expect(result.wasRunning).toBe(false);
    expect(fakeSimctl.wasMethodCalled("terminateApp")).toBe(false);
  });
});

describe("TerminateApp (Android)", () => {
  const androidDevice: BootedDevice = {
    deviceId: "emulator-5554",
    name: "Pixel 7",
    platform: "android"
  };

  let fakeAdb: FakeAdbClient;
  let fakeTimer: FakeTimer;

  beforeEach(() => {
    fakeAdb = new FakeAdbClient();
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
  });

  test("terminates installed foreground app", async () => {
    fakeAdb.setForegroundApp({ packageName: "com.example.app", userId: 0 });
    fakeAdb.setUsers([{ userId: 0, name: "Owner", running: true }]);
    fakeAdb.setCommandResult(
      "shell pm list packages --user 0 -f com.example.app | grep -c com.example.app",
      "1"
    );
    fakeAdb.setCommandResult(
      "shell am force-stop --user 0 com.example.app",
      ""
    );

    const terminateApp = new TerminateApp(androidDevice, fakeAdb as any, null, fakeTimer);
    const result = await terminateApp.execute("com.example.app", { skipObservation: true });

    expect(result.success).toBe(true);
    expect(result.wasInstalled).toBe(true);
    expect(result.wasRunning).toBe(true);
    expect(result.wasForeground).toBe(true);
    expect(result.userId).toBe(0);
    expect(fakeAdb.wasCommandExecuted("force-stop")).toBe(true);
  });

  test("returns not installed when package is missing", async () => {
    fakeAdb.setForegroundApp(null);
    fakeAdb.setUsers([{ userId: 0, name: "Owner", running: true }]);
    fakeAdb.setCommandResult(
      "shell pm list packages --user 0 -f com.example.app | grep -c com.example.app",
      "0"
    );

    const terminateApp = new TerminateApp(androidDevice, fakeAdb as any, null, fakeTimer);
    const result = await terminateApp.execute("com.example.app", { skipObservation: true });

    expect(result.success).toBe(true);
    expect(result.wasInstalled).toBe(false);
    expect(result.wasRunning).toBe(false);
    expect(result.wasForeground).toBe(false);
    expect(result.userId).toBe(0);
    expect(fakeAdb.wasCommandExecuted("force-stop")).toBe(false);
  });
});
