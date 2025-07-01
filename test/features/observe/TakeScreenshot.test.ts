import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import fs from "fs-extra";
import { TakeScreenshot } from "../../../src/features/observe/TakeScreenshot";
import { AdbUtils } from "../../../src/utils/adb";
import { Image } from "../../../src/utils/image-utils";
import { logger } from "../../../src/utils/logger";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import path from "path";
import sinon from "sinon";

describe("TakeScreenshot", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let takeScreenshot: TakeScreenshot;
    let mockAdb: AdbUtils;

    beforeEach(function() {
      // Create a simple mock ADB for unit testing
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;
      takeScreenshot = new TakeScreenshot(null, mockAdb);
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
        const takeScreenshot = new TakeScreenshot("test-device", mockAdb);

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

  describe("Integration Tests", function() {
    this.timeout(30000);

    let takeScreenshot: TakeScreenshot;
    let adb: AdbUtils;
    let awaitIdle: AwaitIdle;
    const CLOCK_PACKAGE = "com.google.android.deskclock";

    beforeEach(async function() {
      // Initialize with real ADB connection
      adb = new AdbUtils();
      takeScreenshot = new TakeScreenshot("test-device", adb);
      awaitIdle = new AwaitIdle("test-device", adb);

      // Check if any devices are connected
      try {
        const devices = await adb.executeCommand("devices");
        const deviceLines = devices.stdout.split("\n").filter(line => line.trim() && !line.includes("List of devices"));
        if (deviceLines.length === 0) {
          this.skip(); // Skip tests if no devices are connected
          return;
        }
      } catch (error) {
        this.skip(); // Skip tests if ADB command fails
        return;
      }

      // Make sure the app is not running
      await adb.executeCommand(`shell am force-stop ${CLOCK_PACKAGE}`);

      // Clear app data to ensure consistent state
      await adb.executeCommand(`shell pm clear ${CLOCK_PACKAGE}`);

      // Launch the clock app
      await adb.executeCommand(`shell am start -n ${CLOCK_PACKAGE}/com.android.deskclock.DeskClock`);

      // Wait for app to fully launch and UI to be stable
      await awaitIdle.waitForUiStability(CLOCK_PACKAGE, 250);
    });

    afterEach(async function() {
      // Only run cleanup if this test wasn't skipped
      if (this.currentTest?.state === "pending") {
        return;
      }

      try {
        await adb.executeCommand(`shell am force-stop ${CLOCK_PACKAGE}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it("should take a screenshot of the Clock app with optimized performance", async function() {
      const startTime = Date.now();
      const result = await takeScreenshot.execute(null, { format: "png" });
      const duration = Date.now() - startTime;

      expect(result.success).to.be.true;
      expect(result.path).to.not.be.undefined;

      // Verify performance improvement with single ADB command
      expect(duration).to.be.lessThan(3000); // Should be faster with optimization

      const fileExists = fs.existsSync(result.path!);
      expect(fileExists).to.be.true;

      const fileStats = fs.statSync(result.path!);
      expect(fileStats.size).to.be.greaterThan(1000);

      // Sanitize path before reading file
      const normalizedPath = path.normalize(result.path!);
      if (normalizedPath.includes("..")) {
        throw new Error("Path traversal attempt detected");
      }
      const imageBuffer = fs.readFileSync(normalizedPath);
      const image = Image.fromBuffer(imageBuffer);
      const metadata = await image.getMetadata();

      expect(metadata.format).to.equal("png");
      expect(metadata.width).to.be.greaterThan(100);
      expect(metadata.height).to.be.greaterThan(100);

      logger.info(`Screenshot saved at: ${result.path} (took ${duration}ms)`);
    });

    it("should always create new screenshots with unique paths (no screenshot caching)", async function() {
      const result1 = await takeScreenshot.execute(null, { format: "png" });
      expect(result1.success).to.be.true;

      await new Promise(resolve => setTimeout(resolve, 100));

      const result2 = await takeScreenshot.execute(null, { format: "png" });
      expect(result2.success).to.be.true;

      // Screenshots are NOT cached - each call creates a new file
      expect(result2.path).to.not.equal(result1.path);

      const filename1 = path.basename(result1.path!);
      const filename2 = path.basename(result2.path!);

      // Both should use "screenshot" prefix with unique timestamps
      expect(filename1.startsWith("screenshot_")).to.be.true;
      expect(filename2.startsWith("screenshot_")).to.be.true;

      // Verify both files exist and are different
      expect(fs.existsSync(result1.path!)).to.be.true;
      expect(fs.existsSync(result2.path!)).to.be.true;
    });

    it("should convert format correctly when using webp", async function() {
      const pngResult = await takeScreenshot.execute(null, { format: "png" });
      expect(pngResult.success).to.be.true;
      expect(pngResult.path!.endsWith(".png")).to.be.true;

      const webpResult = await takeScreenshot.execute(null, { format: "webp", quality: 80 });
      expect(webpResult.success).to.be.true;
      expect(webpResult.path!.endsWith(".webp")).to.be.true;

      expect(fs.existsSync(pngResult.path!)).to.be.true;
      expect(fs.existsSync(webpResult.path!)).to.be.true;
      expect(pngResult.path).to.not.equal(webpResult.path);

      // Sanitize path before reading file
      const normalizedPath = path.normalize(webpResult.path!);
      if (normalizedPath.includes("..")) {
        throw new Error("Path traversal attempt detected");
      }
      const webpBuffer = fs.readFileSync(normalizedPath);
      const webpImage = Image.fromBuffer(webpBuffer);
      const metadata = await webpImage.getMetadata();
      expect(metadata.format).to.equal("webp");
    });

    it("should handle webp lossless conversion correctly", async function() {
      const webpResult = await takeScreenshot.execute(null, {
        format: "webp",
        quality: 90,
        lossless: true
      });

      expect(webpResult.success).to.be.true;
      expect(webpResult.path!.endsWith(".webp")).to.be.true;
      expect(fs.existsSync(webpResult.path!)).to.be.true;

      // Sanitize path before reading file
      const normalizedPath = path.normalize(webpResult.path!);
      if (normalizedPath.includes("..")) {
        throw new Error("Path traversal attempt detected");
      }
      const webpBuffer = fs.readFileSync(normalizedPath);
      const webpImage = Image.fromBuffer(webpBuffer);
      const metadata = await webpImage.getMetadata();
      expect(metadata.format).to.equal("webp");
    });

    it("should always create new screenshots with unique timestamps", async function() {
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await takeScreenshot.execute(null, { format: "png" });
        expect(result.success).to.be.true;
        results.push(result);

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const paths = results.map(r => r.path);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).to.equal(results.length);

      // All should use "screenshot" prefix with unique timestamps
      for (const path of paths) {
        const filename = path ? path.split("/").pop() : "";
        expect(filename!.startsWith("screenshot_")).to.be.true;
        expect(filename!.endsWith(".png")).to.be.true;
      }
    });

    it("should handle errors gracefully when ADB command fails", async function() {
      // Create a takeScreenshot instance with a mock that fails
      const failingAdb = {
        executeCommand: async () => {
          throw new Error("ADB command failed");
        }
      } as unknown as AdbUtils;

      const failingTakeScreenshot = new TakeScreenshot(null, failingAdb);
      const result = await failingTakeScreenshot.execute(null, { format: "png" });

      expect(result.success).to.be.false;
      expect(result.error).to.include("ADB command failed");
      expect(result.path).to.be.undefined;
    });
  });
});
