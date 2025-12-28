import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import fs from "fs-extra";
import { TakeScreenshot } from "../../../src/features/observe/TakeScreenshot";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import sinon from "sinon";

describe("TakeScreenshot", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let takeScreenshot: TakeScreenshot;
    let mockAdb: AdbUtils;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        name: "test-device",
        platform: "android",
        deviceId: "test-device-id",
        source: "local"
      };

      // Create a simple mock ADB for unit testing
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;
      takeScreenshot = new TakeScreenshot(mockDevice, mockAdb);
    });

    it("should generate correct screenshot path with png format", function() {
      const timestamp = 1234567890123;
      const options = { format: "png" as const };

      const result = takeScreenshot.generateScreenshotPath(timestamp, options);

      expect(result).to.include("screenshot_1234567890123");
      expect(result).to.match(/screenshot_1234567890123\.png$/);
    });

    it("should generate correct screenshot path with webp format", function() {
      const timestamp = 1234567890456;
      const options = { format: "webp" as const };

      const result = takeScreenshot.generateScreenshotPath(timestamp, options);

      expect(result).to.include("screenshot_1234567890456");
      expect(result).to.match(/screenshot_1234567890456\.webp$/);
    });

    it("should generate different timestamps for consecutive calls", async function() {
      const timestamp1 = Date.now();
      const options = { format: "png" as const };

      const result1 = takeScreenshot.generateScreenshotPath(timestamp1, options);
      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const timestamp2 = Date.now();
      const result2 = takeScreenshot.generateScreenshotPath(timestamp2, options);

      expect(result1).to.not.equal(result2);
    });

    it("should use single optimized ADB command for screenshot capture", async function() {
      // Create minimal valid PNG base64 data
      const base64PngData = Buffer.from("fake-png-data").toString("base64");

      const mockExecuteCommand = sinon.spy(async (command: string) => {
        if (command.includes("screencap") && command.includes("base64")) {
          return { stdout: base64PngData, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      });

      const mockAdb = {
        executeCommand: mockExecuteCommand
      } as unknown as AdbUtils;

      // Mock all fs operations to avoid actual file I/O
      const mockFsWriteFile = sinon.stub(fs, "writeFile").resolves();
      const mockFsExistsSync = sinon.stub(fs, "existsSync").returns(true);
      const mockFsMkdirSync = sinon.stub(fs, "mkdirSync").returns(undefined);
      const mockFsReaddir = sinon.stub(fs, "readdir").resolves([]);
      const mockFsStat = sinon.stub(fs, "stat").resolves({ size: 0, mtime: new Date() } as any);

      try {
        const takeScreenshot = new TakeScreenshot(mockDevice, mockAdb);

        // Mock the window dependency to avoid additional ADB calls
        const mockWindow = { getActiveHash: sinon.stub().resolves("mock-hash") };
        (takeScreenshot as any).window = mockWindow;

        const result = await takeScreenshot.execute();

        // Verify only one ADB command was executed (optimized)
        expect(mockExecuteCommand.calledOnce).to.be.true;

        // Verify the command uses the optimized base64 approach
        const calledCommand = mockExecuteCommand.getCall(0).args[0];
        expect(calledCommand).to.include("screencap");
        expect(calledCommand).to.include("base64");
        expect(calledCommand).to.include("rm"); // Should cleanup temp file in same command

        expect(result.success).to.be.true;
      } finally {
        // Restore stubs
        mockFsWriteFile.restore();
        mockFsExistsSync.restore();
        mockFsMkdirSync.restore();
        mockFsReaddir.restore();
        mockFsStat.restore();
      }
    });
  });

});
