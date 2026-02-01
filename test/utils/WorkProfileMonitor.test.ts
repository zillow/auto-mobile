import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { DefaultWorkProfileMonitor } from "../../src/utils/WorkProfileMonitor";
import { FakeTimer } from "../fakes/FakeTimer";
import { FakeAdbExecutor } from "../fakes/FakeAdbExecutor";
import { FakeInstalledAppsRepository } from "../fakes/FakeInstalledAppsRepository";

describe("WorkProfileMonitor", () => {
  let timer: FakeTimer;
  let adb: FakeAdbExecutor;
  let repo: FakeInstalledAppsRepository;
  let monitor: DefaultWorkProfileMonitor;

  beforeEach(() => {
    timer = new FakeTimer();
    adb = new FakeAdbExecutor();
    repo = new FakeInstalledAppsRepository();

    monitor = new DefaultWorkProfileMonitor({
      deviceId: "emulator-5554",
      adb,
      installedAppsStore: repo,
      timer,
      pollIntervalMs: 5000
    });

    // Set up default package list response
    adb.setCommandResponse("pm list packages --user", {
      stdout: "package:com.example.app1\npackage:com.example.app2\n",
      stderr: "",
      toString: () => "package:com.example.app1\npackage:com.example.app2\n",
      trim: () => "package:com.example.app1\npackage:com.example.app2",
      includes: (s: string) => "package:com.example.app1\npackage:com.example.app2\n".includes(s)
    });
  });

  afterEach(() => {
    monitor.stop();
    timer.reset();
  });

  test("starts and stops correctly", () => {
    expect(monitor.isRunning()).toBe(false);

    monitor.start();
    expect(monitor.isRunning()).toBe(true);

    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  test("does not double-start", () => {
    monitor.start();
    monitor.start(); // Should be a no-op

    expect(monitor.isRunning()).toBe(true);
    expect(timer.getPendingIntervalCount()).toBe(1);
  });

  test("tracks profile states", () => {
    expect(monitor.getProfileStates()).toHaveLength(0);

    monitor.setProfileHasAccessibilityService(10, false);
    expect(monitor.getProfileStates()).toHaveLength(1);
    expect(monitor.getProfileStates()[0]).toEqual({
      userId: 10,
      hasAccessibilityService: false,
      lastRefreshMs: 0
    });

    monitor.setProfileHasAccessibilityService(10, true);
    expect(monitor.getProfileStates()[0].hasAccessibilityService).toBe(true);
  });

  test("refreshes profile packages via ADB", async () => {
    timer.setCurrentTime(1000);
    monitor.setProfileHasAccessibilityService(10, false);

    await monitor.refreshProfile(10);

    // Check that packages were added to repository
    const apps = await repo.listInstalledApps("emulator-5554");
    expect(apps).toHaveLength(2);
    expect(apps.map(a => a.package_name).sort()).toEqual(["com.example.app1", "com.example.app2"]);
    expect(apps[0].user_id).toBe(10);

    // Check lastRefreshMs was updated
    const state = monitor.getProfileStates()[0];
    expect(state.lastRefreshMs).toBe(1000);
  });

  test("polls only stale profiles (without accessibility service)", async () => {
    monitor.setProfileHasAccessibilityService(10, false); // Should poll
    monitor.setProfileHasAccessibilityService(11, true);  // Should NOT poll

    monitor.start();

    // Advance time to trigger poll
    timer.advanceTime(5000);
    await Promise.resolve(); // Let async operations complete

    // Only user 10 should have been refreshed
    expect(adb.wasCommandExecuted("pm list packages --user 10")).toBe(true);
    expect(adb.wasCommandExecuted("pm list packages --user 11")).toBe(false);
  });

  test("does not poll when all profiles have accessibility service", async () => {
    monitor.setProfileHasAccessibilityService(10, true);
    monitor.setProfileHasAccessibilityService(11, true);

    monitor.start();

    // Advance time to trigger poll
    timer.advanceTime(5000);
    await Promise.resolve();

    // No profile should have been refreshed
    expect(adb.wasCommandExecuted("pm list packages")).toBe(false);
  });

  test("updates profile state when accessibility service becomes available", async () => {
    monitor.setProfileHasAccessibilityService(10, false);
    expect(monitor.getProfileStates()[0].hasAccessibilityService).toBe(false);

    // Simulate accessibility service being enabled
    monitor.setProfileHasAccessibilityService(10, true);
    expect(monitor.getProfileStates()[0].hasAccessibilityService).toBe(true);

    monitor.start();

    // Advance time to trigger poll
    timer.advanceTime(5000);
    await Promise.resolve();

    // Profile should NOT have been polled since it now has accessibility service
    expect(adb.wasCommandExecuted("pm list packages")).toBe(false);
  });

  test("handles empty package list gracefully", async () => {
    // Create a fresh monitor without the default package list response
    const freshAdb = new FakeAdbExecutor();
    const freshMonitor = new DefaultWorkProfileMonitor({
      deviceId: "emulator-5554",
      adb: freshAdb,
      installedAppsStore: repo,
      timer,
      pollIntervalMs: 5000
    });

    // Set empty response
    freshAdb.setDefaultResponse({
      stdout: "",
      stderr: "",
      toString: () => "",
      trim: () => "",
      includes: () => false
    });

    freshMonitor.setProfileHasAccessibilityService(10, false);
    await freshMonitor.refreshProfile(10);

    const apps = await repo.listInstalledApps("emulator-5554");
    expect(apps).toHaveLength(0);
  });

  test("continues polling after refresh error", async () => {
    adb.setDefaultError(new Error("ADB connection lost"));

    monitor.setProfileHasAccessibilityService(10, false);
    monitor.start();

    // First poll should fail but not crash
    timer.advanceTime(5000);
    await Promise.resolve();

    // Monitor should still be running
    expect(monitor.isRunning()).toBe(true);
  });
});
