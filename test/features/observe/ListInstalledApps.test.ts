import { expect } from "chai";
import { ListInstalledApps } from "../../../src/features/observe/ListInstalledApps";
import { AdbUtils } from "../../../src/utils/adb";
import { ExecResult } from "../../../src/models/ExecResult";

describe("ListInstalledApps", function() {
  let listInstalledApps: ListInstalledApps;
  let mockAdb: Partial<AdbUtils>;

  const createMockExecResult = (stdout: string, stderr = ""): ExecResult => ({
    stdout,
    stderr,
    toString: () => stdout,
    trim: () => stdout.trim(),
    includes: (searchString: string) => stdout.includes(searchString),
  });

  beforeEach(function() {
    mockAdb = {
      executeCommand: async (command: string) => {
        if (command === "shell pm list packages") {
          return createMockExecResult("package:com.android.chrome\npackage:com.google.android.gms\npackage:com.example.myapp\n");
        }
        return createMockExecResult("");
      }
    };

    listInstalledApps = new ListInstalledApps("test-device", mockAdb as AdbUtils);
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
      mockAdb.executeCommand = async () => createMockExecResult("package:com.example.app\n\nsome other line\npackage:com.test.app\n");

      const result = await listInstalledApps.execute();

      expect(result).to.have.lengthOf(2);
      expect(result).to.include("com.example.app");
      expect(result).to.include("com.test.app");
    });

    it("should handle adb command failure gracefully", async function() {
      mockAdb.executeCommand = async () => {
        throw new Error("ADB command failed");
      };

      const result = await listInstalledApps.execute();

      expect(result).to.be.an("array");
      expect(result).to.have.lengthOf(0);
    });

    it("should trim package names correctly", async function() {
      mockAdb.executeCommand = async () => createMockExecResult("package: com.example.app \npackage:com.test.app\t\n");

      const result = await listInstalledApps.execute();

      expect(result).to.include("com.example.app");
      expect(result).to.include("com.test.app");
      expect(result).to.not.include(" com.example.app ");
    });
  });
});
