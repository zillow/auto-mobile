import { expect, describe, test, beforeEach } from "bun:test";
import { ListInstalledApps } from "../../../src/features/observe/ListInstalledApps";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { BootedDevice, AndroidUser } from "../../../src/models";
import type { NewInstalledApp } from "../../../src/db/types";
import { FakeInstalledAppsRepository } from "../../fakes/FakeInstalledAppsRepository";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("ListInstalledApps", function() {
  let listInstalledApps: ListInstalledApps;
  let fakeAdb: FakeAdbExecutor;
  let mockDevice: BootedDevice;

  beforeEach(function() {
    mockDevice = {
      deviceId: "test-device",
      platform: "android"
    } as BootedDevice;

    fakeAdb = new FakeAdbExecutor();
    // Note: Don't set default command responses here - tests will configure as needed

    listInstalledApps = new ListInstalledApps(mockDevice, fakeAdb);
  });

  describe("execute", function() {
    test("should list all installed packages", async function() {
      // Set up single user with packages
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.chrome\npackage:com.google.android.gms\npackage:com.example.myapp\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "package:com.android.chrome\npackage:com.google.android.gms\n",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result).toContain("com.android.chrome");
      expect(result).toContain("com.google.android.gms");
      expect(result).toContain("com.example.myapp");
    });

    test("should filter out empty lines and non-package lines", async function() {
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.example.app\n\nsome other line\npackage:com.test.app\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(result).toHaveLength(2);
      expect(result).toContain("com.example.app");
      expect(result).toContain("com.test.app");
    });

    test("should handle adb command failure gracefully", async function() {
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "",
        stderr: "error"
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    test("should trim package names correctly", async function() {
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package: com.example.app \npackage:com.test.app\t\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(result).toContain("com.example.app");
      expect(result).toContain("com.test.app");
      expect(result).not.toContain(" com.example.app ");
    });
  });

  describe("executeDetailed", function() {
    test("should list apps from all user profiles", async function() {
      // Configure two users: primary and work profile
      const users: AndroidUser[] = [
        { userId: 0, name: "Owner", flags: 13, running: true },
        { userId: 10, name: "Work profile", flags: 30, running: true }
      ];
      fakeAdb.setUsers(users);

      // Configure packages for each user
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.chrome\npackage:com.example.personalapp\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "package:com.android.chrome\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages --user 10", {
        stdout: "package:com.android.chrome\npackage:com.example.workapp\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 10", {
        stdout: "package:com.android.chrome\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      expect(typeof result).toBe("object");
      expect(result).toHaveProperty("profiles");
      expect(result).toHaveProperty("system");

      // Check personal apps
      const personalApps = result.profiles[0];
      expect(Array.isArray(personalApps)).toBe(true);
      const personalApp = personalApps.find(app => app.packageName === "com.example.personalapp");
      expect(personalApp).toBeDefined();
      expect(personalApp?.foreground).toBe(false);

      // Check work profile apps
      const workApps = result.profiles[10];
      expect(Array.isArray(workApps)).toBe(true);
      const workApp = workApps.find(app => app.packageName === "com.example.workapp");
      expect(workApp).toBeDefined();

      // Check system apps are deduped
      expect(result.system).toHaveLength(1);
      expect(result.system[0].packageName).toBe("com.android.chrome");
      expect(result.system[0].userIds.sort()).toEqual([0, 10]);
    });

    test("should dedupe system apps across profiles", async function() {
      const users: AndroidUser[] = [
        { userId: 0, name: "Owner", flags: 13, running: true },
        { userId: 10, name: "Work profile", flags: 30, running: true }
      ];
      fakeAdb.setUsers(users);
      fakeAdb.setForegroundApp({ packageName: "com.android.settings", userId: 10 });

      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.settings\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "package:com.android.settings\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages --user 10", {
        stdout: "package:com.android.settings\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 10", {
        stdout: "package:com.android.settings\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      expect(result.system).toHaveLength(1);
      expect(result.system[0].packageName).toBe("com.android.settings");
      expect(result.system[0].userIds.sort()).toEqual([0, 10]);
      expect(result.system[0].foreground).toBe(true);
    });

    test("should treat non-system packages as user apps even if not listed in -s", async function() {
      const users: AndroidUser[] = [
        { userId: 0, name: "Owner", flags: 13, running: true }
      ];
      fakeAdb.setUsers(users);

      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.chrome\npackage:com.google.android.apps.weather\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "package:com.android.chrome\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      const userPackages = result.profiles[0].map(app => app.packageName);
      expect(userPackages).toContain("com.google.android.apps.weather");
      expect(result.system.some(app => app.packageName === "com.google.android.apps.weather")).toBe(false);
    });

    test("should mark foreground app correctly", async function() {
      const users: AndroidUser[] = [
        { userId: 0, name: "Owner", flags: 13, running: true },
        { userId: 10, name: "Work profile", flags: 30, running: true }
      ];
      fakeAdb.setUsers(users);

      // Set foreground app in work profile
      fakeAdb.setForegroundApp({ packageName: "com.example.workapp", userId: 10 });

      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.example.personalapp\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages --user 10", {
        stdout: "package:com.example.workapp\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 10", {
        stdout: "",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      const personalApp = result.profiles[0].find(app => app.packageName === "com.example.personalapp");
      expect(personalApp?.foreground).toBe(false);

      const workApp = result.profiles[10].find(app => app.packageName === "com.example.workapp");
      expect(workApp?.foreground).toBe(true);
    });

    test("should handle single user (no work profile)", async function() {
      const users: AndroidUser[] = [
        { userId: 0, name: "Owner", flags: 13, running: true }
      ];
      fakeAdb.setUsers(users);

      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.chrome\npackage:com.example.app\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "package:com.android.chrome\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      expect(result.profiles[0]).toHaveLength(1);
      expect(result.profiles[0][0].userId).toBe(0);
      expect(result.system).toHaveLength(1);
    });

    test("should return empty result for non-Android platforms", async function() {
      const iosDevice: BootedDevice = {
        deviceId: "test-device",
        platform: "ios"
      } as BootedDevice;

      const iosListApps = new ListInstalledApps(iosDevice, fakeAdb);
      const result = await iosListApps.executeDetailed();

      expect(result).toEqual({ profiles: {}, system: [] });
    });
  });

  describe("cache", function() {
    test("should use cached apps when fresh", async function() {
      const repo = new FakeInstalledAppsRepository();
      const timer = new FakeTimer();
      timer.advanceTime(1000);
      const now = timer.now();
      const entries: NewInstalledApp[] = [
        {
          device_id: mockDevice.deviceId,
          user_id: 0,
          package_name: "com.cached.app",
          is_system: 0,
          installed_at: now,
          last_verified_at: now
        },
        {
          device_id: mockDevice.deviceId,
          user_id: 0,
          package_name: "com.android.settings",
          is_system: 1,
          installed_at: now,
          last_verified_at: now
        }
      ];

      await repo.replaceInstalledApps(mockDevice.deviceId, entries);
      fakeAdb.setForegroundApp({ packageName: "com.cached.app", userId: 0 });

      const cachedList = new ListInstalledApps(
        mockDevice,
        fakeAdb as unknown as any,
        null,
        { cacheEnabled: true, installedAppsRepository: repo, timer }
      );
      const result = await cachedList.executeDetailed();

      expect(result.profiles[0].some(app => app.packageName === "com.cached.app")).toBe(true);
      expect(result.system.some(app => app.packageName === "com.android.settings")).toBe(true);
      expect(fakeAdb.wasCommandExecuted("shell pm list packages")).toBe(false);
    });

    test("should rebuild cache when stale", async function() {
      const repo = new FakeInstalledAppsRepository();
      const timer = new FakeTimer();
      const staleTime = timer.now();
      await repo.replaceInstalledApps(mockDevice.deviceId, [
        {
          device_id: mockDevice.deviceId,
          user_id: 0,
          package_name: "com.stale.app",
          is_system: 0,
          installed_at: staleTime,
          last_verified_at: staleTime
        }
      ]);

      timer.advanceTime(5 * 60 * 1000 + 1);

      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.example.fresh\n",
        stderr: ""
      });
      fakeAdb.setCommandResponse("shell pm list packages -s --user 0", {
        stdout: "",
        stderr: ""
      });

      const cachedList = new ListInstalledApps(
        mockDevice,
        fakeAdb as unknown as any,
        null,
        { cacheEnabled: true, installedAppsRepository: repo, timer }
      );
      await cachedList.executeDetailed();

      expect(fakeAdb.wasCommandExecuted("shell pm list packages --user 0")).toBe(true);

      const stored = await repo.listInstalledApps(mockDevice.deviceId);
      expect(stored.some(row => row.package_name === "com.example.fresh")).toBe(true);
      expect(stored.some(row => row.package_name === "com.stale.app")).toBe(false);
    });
  });
});
