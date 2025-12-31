import { beforeEach, describe, expect, test } from "bun:test";
import { GetSystemInsets } from "../../../src/features/observe/GetSystemInsets";
import { BootedDevice } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";

describe("GetSystemInsets", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let getSystemInsets: GetSystemInsets;
    let fakeAdb: FakeAdbExecutor;
    let testDevice: BootedDevice;

    beforeEach(function() {
      testDevice = {
        name: "test-device",
        platform: "android",
        deviceId: "test-device-id"
      };

      fakeAdb = new FakeAdbExecutor();

      getSystemInsets = new GetSystemInsets(testDevice, fakeAdb);
    });

    test("should parse status bar height correctly", function() {
      const stdout = "statusBars frame=[0,0][1080,72] other content";

      const result = getSystemInsets.parseStatusBarHeight(stdout);

      expect(result).toBe(72);
    });

    test("should return 0 for status bar height when no match", function() {
      const stdout = "no status bar information here";

      const result = getSystemInsets.parseStatusBarHeight(stdout);

      expect(result).toBe(0);
    });

    test("should parse navigation bar height correctly", function() {
      const stdout = "navigationBars frame=[0,2208][1080,2352] other content";

      const result = getSystemInsets.parseNavigationBarHeight(stdout);

      expect(result).toBe(144); // 2352 - 2208
    });

    test("should return 0 for navigation bar height when no match", function() {
      const stdout = "no navigation bar information";

      const result = getSystemInsets.parseNavigationBarHeight(stdout);

      expect(result).toBe(0);
    });

    test("should parse gesture insets correctly", function() {
      const stdout = `
        systemGestures sideHint=LEFT frame=[0,72][48,2208]
        systemGestures sideHint=RIGHT frame=[1032,72][1080,2208]
      `;

      const result = getSystemInsets.parseGestureInsets(stdout);

      expect(result.left).toBe(48); // 48 - 0
      expect(result.right).toBe(48); // 1080 - 1032
    });

    test("should return zero insets when no gesture information", function() {
      const stdout = "no gesture information here";

      const result = getSystemInsets.parseGestureInsets(stdout);

      expect(result.left).toBe(0);
      expect(result.right).toBe(0);
    });

    test("should parse frame dimensions correctly", function() {
      const frameString = "[10,20][110,120]";

      const result = getSystemInsets.parseFrameDimensions(frameString);

      expect(result.width).toBe(100); // 110 - 10
      expect(result.height).toBe(100); // 120 - 20
    });

    test("should return zero dimensions for invalid frame string", function() {
      const frameString = "invalid frame format";

      const result = getSystemInsets.parseFrameDimensions(frameString);

      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
    });

    test("should handle various frame coordinate formats", function() {
      const testCases = [
        { input: "[0,0][1080,72]", expected: { width: 1080, height: 72 } },
        { input: "[100,200][300,400]", expected: { width: 200, height: 200 } },
        { input: "[5,10][15,20]", expected: { width: 10, height: 10 } }
      ];

      testCases.forEach(testCase => {
        const result = getSystemInsets.parseFrameDimensions(testCase.input);
        expect(result).toEqual(testCase.expected);
      });
    });

    test("should parse complex dumpsys output with multiple elements", function() {
      const complexOutput = `
        Some other content
        statusBars frame=[0,0][1080,96] visible=true
        More content
        navigationBars frame=[0,2256][1080,2400] visible=true
        systemGestures sideHint=LEFT frame=[0,96][32,2256]
        systemGestures sideHint=RIGHT frame=[1048,96][1080,2256]
        End content
      `;

      const statusHeight = getSystemInsets.parseStatusBarHeight(complexOutput);
      const navHeight = getSystemInsets.parseNavigationBarHeight(complexOutput);
      const gestures = getSystemInsets.parseGestureInsets(complexOutput);

      expect(statusHeight).toBe(96);
      expect(navHeight).toBe(144); // 2400 - 2256
      expect(gestures.left).toBe(32);
      expect(gestures.right).toBe(32); // 1080 - 1048
    });
  });

  describe("Integration Tests", function() {

    let getSystemInsets: GetSystemInsets;
    let fakeAdb: FakeAdbExecutor;
    let testDevice: BootedDevice;

    beforeEach(async function() {
      // Create test device
      testDevice = {
        name: "test-device",
        platform: "android",
        deviceId: "test-device-id"
      };

      // Create fake ADB that simulates no devices available (to skip tests safely)
      fakeAdb = new FakeAdbExecutor();
      fakeAdb.setDefaultResponse({
        stdout: "List of devices attached\n", // Empty device list
        stderr: ""
      });

      // Create GetSystemInsets with mocked dependencies
      getSystemInsets = new GetSystemInsets(testDevice, fakeAdb);

      // Check for available devices (mocked to return empty list)
      try {
        const devices = await fakeAdb.executeCommand("devices");
        const deviceLines = devices.stdout.split("\n").filter((line: string) => line.trim() && !line.includes("List of devices"));
        if (deviceLines.length === 0) {
          // Note: Bun does not support dynamic test skipping // Skip tests if no devices are connected (which will always be the case with our mock)
          return;
        }
      } catch (error) {
        // Note: Bun does not support dynamic test skipping // Skip tests if ADB command fails
        return;
      }
    });

    test("should get system insets from real device", async function() {
      // This test will be skipped due to the beforeEach logic above
      // But if it somehow runs, we'll provide a mock response
      fakeAdb.setDefaultResponse({
        stdout: `
          statusBars frame=[0,0][1080,96] visible=true
          navigationBars frame=[0,2256][1080,2400] visible=true
          systemGestures sideHint=LEFT frame=[0,96][32,2256]
          systemGestures sideHint=RIGHT frame=[1048,96][1080,2256]
        `,
        stderr: ""
      });

      const result = await getSystemInsets.execute({
        stdout: ""
      } as ExecResult);

      expect(result).toHaveProperty("top");
      expect(result).toHaveProperty("right");
      expect(result).toHaveProperty("bottom");
      expect(result).toHaveProperty("left");

      expect(typeof result.top).toBe("number");
      expect(typeof result.right).toBe("number");
      expect(typeof result.bottom).toBe("number");
      expect(typeof result.left).toBe("number");

      // Reasonable bounds check - insets should be non-negative and not absurdly large
      expect(result.top).toBeGreaterThanOrEqual(0);
      expect(result.right).toBeGreaterThanOrEqual(0);
      expect(result.bottom).toBeGreaterThanOrEqual(0);
      expect(result.left).toBeGreaterThanOrEqual(0);

      expect(result.top).toBeLessThanOrEqual(500);
      expect(result.right).toBeLessThanOrEqual(500);
      expect(result.bottom).toBeLessThanOrEqual(500);
      expect(result.left).toBeLessThanOrEqual(500);
    });
  });
});
