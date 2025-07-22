import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { GetSystemInsets } from "../../../src/features/observe/GetSystemInsets";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { ExecResult } from "../../../src/models";

describe("GetSystemInsets", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let getSystemInsets: GetSystemInsets;
    let mockAdb: AdbUtils;

    beforeEach(function() {
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;
      getSystemInsets = new GetSystemInsets("test-device", mockAdb);
    });

    it("should parse status bar height correctly", function() {
      const stdout = "statusBars frame=[0,0][1080,72] other content";

      const result = getSystemInsets.parseStatusBarHeight(stdout);

      expect(result).to.equal(72);
    });

    it("should return 0 for status bar height when no match", function() {
      const stdout = "no status bar information here";

      const result = getSystemInsets.parseStatusBarHeight(stdout);

      expect(result).to.equal(0);
    });

    it("should parse navigation bar height correctly", function() {
      const stdout = "navigationBars frame=[0,2208][1080,2352] other content";

      const result = getSystemInsets.parseNavigationBarHeight(stdout);

      expect(result).to.equal(144); // 2352 - 2208
    });

    it("should return 0 for navigation bar height when no match", function() {
      const stdout = "no navigation bar information";

      const result = getSystemInsets.parseNavigationBarHeight(stdout);

      expect(result).to.equal(0);
    });

    it("should parse gesture insets correctly", function() {
      const stdout = `
        systemGestures sideHint=LEFT frame=[0,72][48,2208]
        systemGestures sideHint=RIGHT frame=[1032,72][1080,2208]
      `;

      const result = getSystemInsets.parseGestureInsets(stdout);

      expect(result.left).to.equal(48); // 48 - 0
      expect(result.right).to.equal(48); // 1080 - 1032
    });

    it("should return zero insets when no gesture information", function() {
      const stdout = "no gesture information here";

      const result = getSystemInsets.parseGestureInsets(stdout);

      expect(result.left).to.equal(0);
      expect(result.right).to.equal(0);
    });

    it("should parse frame dimensions correctly", function() {
      const frameString = "[10,20][110,120]";

      const result = getSystemInsets.parseFrameDimensions(frameString);

      expect(result.width).to.equal(100); // 110 - 10
      expect(result.height).to.equal(100); // 120 - 20
    });

    it("should return zero dimensions for invalid frame string", function() {
      const frameString = "invalid frame format";

      const result = getSystemInsets.parseFrameDimensions(frameString);

      expect(result.width).to.equal(0);
      expect(result.height).to.equal(0);
    });

    it("should handle various frame coordinate formats", function() {
      const testCases = [
        { input: "[0,0][1080,72]", expected: { width: 1080, height: 72 } },
        { input: "[100,200][300,400]", expected: { width: 200, height: 200 } },
        { input: "[5,10][15,20]", expected: { width: 10, height: 10 } }
      ];

      testCases.forEach(testCase => {
        const result = getSystemInsets.parseFrameDimensions(testCase.input);
        expect(result).to.deep.equal(testCase.expected);
      });
    });

    it("should parse complex dumpsys output with multiple elements", function() {
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

      expect(statusHeight).to.equal(96);
      expect(navHeight).to.equal(144); // 2400 - 2256
      expect(gestures.left).to.equal(32);
      expect(gestures.right).to.equal(32); // 1080 - 1048
    });
  });

  describe("Integration Tests", function() {
    this.timeout(15000);

    let getSystemInsets: GetSystemInsets;
    let adb: AdbUtils;

    beforeEach(async function() {
      adb = new AdbUtils();
      getSystemInsets = new GetSystemInsets("test-device", adb);

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
    });

    it("should get system insets from real device", async function() {
      const result = await getSystemInsets.execute({
        stdout: ""
      } as ExecResult);

      expect(result).to.have.property("top");
      expect(result).to.have.property("right");
      expect(result).to.have.property("bottom");
      expect(result).to.have.property("left");

      expect(result.top).to.be.a("number");
      expect(result.right).to.be.a("number");
      expect(result.bottom).to.be.a("number");
      expect(result.left).to.be.a("number");

      // Reasonable bounds check - insets should be non-negative and not absurdly large
      expect(result.top).to.be.at.least(0);
      expect(result.right).to.be.at.least(0);
      expect(result.bottom).to.be.at.least(0);
      expect(result.left).to.be.at.least(0);

      expect(result.top).to.be.at.most(500);
      expect(result.right).to.be.at.most(500);
      expect(result.bottom).to.be.at.most(500);
      expect(result.left).to.be.at.most(500);
    });
  });
});
