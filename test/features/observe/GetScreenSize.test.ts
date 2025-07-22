import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { GetScreenSize } from "../../../src/features/observe/GetScreenSize";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { BootedDevice } from "../../../src/models";
import { DeviceUtils } from "../../../src/utils/deviceUtils";

describe("GetScreenSize", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let getScreenSize: GetScreenSize;
    let mockAdb: AdbUtils;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;
      mockDevice = {
        deviceId: "test-device"
      } as BootedDevice;
      getScreenSize = new GetScreenSize(mockDevice, mockAdb);
    });

    it("should parse physical dimensions correctly", function() {
      const stdout = "Physical size: 1080x2400";

      const result = getScreenSize.parsePhysicalDimensions(stdout);

      expect(result.width).to.equal(1080);
      expect(result.height).to.equal(2400);
    });

    it("should throw error when no physical size found", function() {
      const stdout = "No size information available";

      expect(() => {
        getScreenSize.parsePhysicalDimensions(stdout);
      }).to.throw("Failed to get screen size");
    });

    it("should handle different physical size formats", function() {
      const testCases = [
        { input: "Physical size: 720x1280", expected: { width: 720, height: 1280 } },
        { input: "Something Physical size: 1440x3200 something", expected: { width: 1440, height: 3200 } },
        { input: "Physical size: 480x800", expected: { width: 480, height: 800 } }
      ];

      testCases.forEach(testCase => {
        const result = getScreenSize.parsePhysicalDimensions(testCase.input);
        expect(result).to.deep.equal(testCase.expected);
      });
    });

    it("should adjust dimensions correctly for portrait rotation (0)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 0);

      expect(result.width).to.equal(1080);
      expect(result.height).to.equal(2400);
    });

    it("should adjust dimensions correctly for landscape rotation (1)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 1);

      expect(result.width).to.equal(2400); // swapped
      expect(result.height).to.equal(1080); // swapped
    });

    it("should adjust dimensions correctly for portrait upside down rotation (2)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 2);

      expect(result.width).to.equal(1080);
      expect(result.height).to.equal(2400);
    });

    it("should adjust dimensions correctly for landscape reverse rotation (3)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 3);

      expect(result.width).to.equal(2400); // swapped
      expect(result.height).to.equal(1080); // swapped
    });

    it("should handle all rotation values correctly", function() {
      const testCases = [
        { rotation: 0, expected: { width: 1080, height: 2400 } }, // portrait
        { rotation: 1, expected: { width: 2400, height: 1080 } }, // landscape
        { rotation: 2, expected: { width: 1080, height: 2400 } }, // portrait upside down
        { rotation: 3, expected: { width: 2400, height: 1080 } }  // landscape reverse
      ];

      testCases.forEach(testCase => {
        const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, testCase.rotation);
        expect(result).to.deep.equal(testCase.expected);
      });
    });

    it("should handle invalid rotation values gracefully", function() {
      // Test with invalid rotation values (should default to portrait)
      const invalidRotations = [-1, 4, 5, 10];

      invalidRotations.forEach(rotation => {
        const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, rotation);
        expect(result.width).to.equal(1080);
        expect(result.height).to.equal(2400);
      });
    });

    it("should work with different screen sizes", function() {
      const testSizes = [
        { width: 720, height: 1280 },
        { width: 1080, height: 1920 },
        { width: 1440, height: 2560 },
        { width: 2160, height: 3840 }
      ];

      testSizes.forEach(size => {
        // Test portrait (rotation 0)
        const portrait = getScreenSize.adjustDimensionsForRotation(size.width, size.height, 0);
        expect(portrait.width).to.equal(size.width);
        expect(portrait.height).to.equal(size.height);

        // Test landscape (rotation 1)
        const landscape = getScreenSize.adjustDimensionsForRotation(size.width, size.height, 1);
        expect(landscape.width).to.equal(size.height);
        expect(landscape.height).to.equal(size.width);
      });
    });
  });

  describe("Integration Tests", function() {
    this.timeout(15000);

    let getScreenSize: GetScreenSize;
    let adb: AdbUtils;
    let device: BootedDevice;

    beforeEach(async function() {
      adb = new AdbUtils();
      const deviceUtils = new DeviceUtils();

      // Check if any devices are connected
      try {
        const devices = await deviceUtils.getBootedDevices("android");
        if (devices.length === 0) {
          this.skip(); // Skip tests if no devices are connected
          return;
        }
        // Use the first available device
        device = devices[0];
        getScreenSize = new GetScreenSize(device, adb);
      } catch (error) {
        this.skip(); // Skip tests if getting devices fails
        return;
      }
    });

    it("should get screen size from real device", async function() {
      const result = await getScreenSize.execute();

      expect(result).to.have.property("width");
      expect(result).to.have.property("height");

      expect(result.width).to.be.a("number");
      expect(result.height).to.be.a("number");

      // Reasonable bounds check - screen sizes should be positive and reasonable
      expect(result.width).to.be.greaterThan(0);
      expect(result.height).to.be.greaterThan(0);

      // Modern devices typically have at least 480px in the smallest dimension
      expect(Math.min(result.width, result.height)).to.be.at.least(480);

      // And not more than 5000px in either dimension (reasonable upper bound)
      expect(result.width).to.be.at.most(5000);
      expect(result.height).to.be.at.most(5000);
    });
  });
});
