import { expect } from "chai";
import { ListInstalledApps } from "../../../src/features/observe/ListInstalledApps";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { BootedDevice, AndroidUser } from "../../../src/models";

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
    it("should list all installed packages", async function() {
      // Set up single user with packages
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.chrome\npackage:com.google.android.gms\npackage:com.example.myapp\n",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(3);
      expect(result).to.include("com.android.chrome");
      expect(result).to.include("com.google.android.gms");
      expect(result).to.include("com.example.myapp");
    });

    it("should filter out empty lines and non-package lines", async function() {
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.example.app\n\nsome other line\npackage:com.test.app\n",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(result).to.have.lengthOf(2);
      expect(result).to.include("com.example.app");
      expect(result).to.include("com.test.app");
    });

    it("should handle adb command failure gracefully", async function() {
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "",
        stderr: "error"
      });

      const result = await listInstalledApps.execute();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(0);
    });

    it("should trim package names correctly", async function() {
      fakeAdb.setUsers([{ userId: 0, name: "Owner", flags: 13, running: true }]);
      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package: com.example.app \npackage:com.test.app\t\n",
        stderr: ""
      });

      const result = await listInstalledApps.execute();

      expect(result).to.include("com.example.app");
      expect(result).to.include("com.test.app");
      expect(result).to.not.include(" com.example.app ");
    });
  });

  describe("executeDetailed", function() {
    it("should list apps from all user profiles", async function() {
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
      fakeAdb.setCommandResponse("shell pm list packages --user 10", {
        stdout: "package:com.example.workapp\npackage:com.android.chrome\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(4);

      // Check personal apps
      const personalChrome = result.find(app => app.packageName === "com.android.chrome" && app.userId === 0);
      expect(personalChrome).to.exist;
      expect(personalChrome?.foreground).to.be.false;

      const personalApp = result.find(app => app.packageName === "com.example.personalapp" && app.userId === 0);
      expect(personalApp).to.exist;

      // Check work profile apps
      const workChrome = result.find(app => app.packageName === "com.android.chrome" && app.userId === 10);
      expect(workChrome).to.exist;

      const workApp = result.find(app => app.packageName === "com.example.workapp" && app.userId === 10);
      expect(workApp).to.exist;
    });

    it("should mark foreground app correctly", async function() {
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
      fakeAdb.setCommandResponse("shell pm list packages --user 10", {
        stdout: "package:com.example.workapp\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      const personalApp = result.find(app => app.packageName === "com.example.personalapp");
      expect(personalApp?.foreground).to.be.false;

      const workApp = result.find(app => app.packageName === "com.example.workapp");
      expect(workApp?.foreground).to.be.true;
    });

    it("should handle single user (no work profile)", async function() {
      const users: AndroidUser[] = [
        { userId: 0, name: "Owner", flags: 13, running: true }
      ];
      fakeAdb.setUsers(users);

      fakeAdb.setCommandResponse("shell pm list packages --user 0", {
        stdout: "package:com.android.chrome\npackage:com.example.app\n",
        stderr: ""
      });

      const result = await listInstalledApps.executeDetailed();

      expect(result).to.have.lengthOf(2);
      expect(result.every(app => app.userId === 0)).to.be.true;
    });

    it("should return empty array for non-Android platforms", async function() {
      const iosDevice: BootedDevice = {
        deviceId: "test-device",
        platform: "ios"
      } as BootedDevice;

      const iosListApps = new ListInstalledApps(iosDevice, fakeAdb);
      const result = await iosListApps.executeDetailed();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(0);
    });
  });
});
