import { expect } from "chai";
import { ListInstalledApps } from "../../../src/features/observe/ListInstalledApps";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { BootedDevice } from "../../../src/models";

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
    fakeAdb.setCommandResponse("shell pm list packages", { stdout: "package:com.android.chrome\npackage:com.google.android.gms\npackage:com.example.myapp\n", stderr: "" });

    listInstalledApps = new ListInstalledApps(mockDevice, fakeAdb);
  });

  describe("execute", function() {
    it("should list all installed packages", async function() {
      const result = await listInstalledApps.execute();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(3);
      expect(result).to.include("com.android.chrome");
      expect(result).to.include("com.google.android.gms");
      expect(result).to.include("com.example.myapp");
    });

    it("should filter out empty lines and non-package lines", async function() {
      fakeAdb.setCommandResponse("shell pm list packages", { stdout: "package:com.example.app\n\nsome other line\npackage:com.test.app\n", stderr: "" });

      const result = await listInstalledApps.execute();

      expect(result).to.have.lengthOf(2);
      expect(result).to.include("com.example.app");
      expect(result).to.include("com.test.app");
    });

    it("should handle adb command failure gracefully", async function() {
      fakeAdb.setCommandResponse("shell pm list packages", { stdout: "", stderr: "error" });

      const result = await listInstalledApps.execute();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(0);
    });

    it("should trim package names correctly", async function() {
      fakeAdb.setCommandResponse("shell pm list packages", { stdout: "package: com.example.app \npackage:com.test.app\t\n", stderr: "" });

      const result = await listInstalledApps.execute();

      expect(result).to.include("com.example.app");
      expect(result).to.include("com.test.app");
      expect(result).to.not.include(" com.example.app ");
    });
  });
});
