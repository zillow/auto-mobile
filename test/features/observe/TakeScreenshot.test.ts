import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { TakeScreenshot } from "../../../src/features/observe/TakeScreenshot";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { FakeFileSystem } from "../../fakes/FakeFileSystem";

describe("TakeScreenshot", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let takeScreenshot: TakeScreenshot;
    let fakeAdb: FakeAdbExecutor;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockDevice = {
        name: "test-device",
        platform: "android",
        deviceId: "test-device-id",
        source: "local"
      };

      // Create a simple fake ADB for unit testing
      fakeAdb = new FakeAdbExecutor();
      takeScreenshot = new TakeScreenshot(mockDevice, fakeAdb);
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

      const testFakeAdb = new FakeAdbExecutor();
      testFakeAdb.setDefaultResponse({ stdout: base64PngData, stderr: "" });

      // Use FakeFileSystem to avoid actual file I/O
      const fakeFileSystem = new FakeFileSystem();
      fakeFileSystem.setDirectory("/tmp/auto-mobile/screenshots");
      fakeFileSystem.setExists("/tmp/auto-mobile/screenshots", true);

      const takeScreenshot = new TakeScreenshot(mockDevice, testFakeAdb);

      // Mock the window dependency to avoid additional ADB calls
      const mockWindow = { getActiveHash: async () => "mock-hash" };
      (takeScreenshot as any).window = mockWindow;

      const result = await takeScreenshot.execute();

      // Verify only one ADB command was executed (optimized)
      const executedCommands = testFakeAdb.getExecutedCommands();
      expect(executedCommands.length).to.equal(1);

      // Verify the command uses the optimized base64 approach
      const calledCommand = executedCommands[0];
      expect(calledCommand).to.include("screencap");
      expect(calledCommand).to.include("base64");
      expect(calledCommand).to.include("rm"); // Should cleanup temp file in same command

      expect(result.success).to.be.true;
    });
  });

});
