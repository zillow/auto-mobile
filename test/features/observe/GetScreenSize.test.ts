import { beforeEach, describe, expect, test } from "bun:test";
import { GetScreenSize } from "../../../src/features/observe/GetScreenSize";
import { BootedDevice } from "../../../src/models";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";

describe("GetScreenSize", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let getScreenSize: GetScreenSize;
    let fakeAdb: FakeAdbExecutor;
    let mockDevice: BootedDevice;

    beforeEach(function() {
      fakeAdb = new FakeAdbExecutor();
      mockDevice = {
        name: "test-device",
        platform: "android",
        deviceId: "test-device"
      } as BootedDevice;
      getScreenSize = new GetScreenSize(mockDevice, fakeAdb);
    });

    test("should parse physical dimensions correctly", function() {
      const stdout = "Physical size: 1080x2400";

      const result = getScreenSize.parsePhysicalDimensions(stdout);

      expect(result.width).toBe(1080);
      expect(result.height).toBe(2400);
    });

    test("should throw error when no physical size found", function() {
      const stdout = "No size information available";

      expect(() => {
        getScreenSize.parsePhysicalDimensions(stdout);
      }).toThrow("Failed to get screen size");
    });

    test("should handle different physical size formats", function() {
      const testCases = [
        { input: "Physical size: 720x1280", expected: { width: 720, height: 1280 } },
        { input: "Something Physical size: 1440x3200 something", expected: { width: 1440, height: 3200 } },
        { input: "Physical size: 480x800", expected: { width: 480, height: 800 } }
      ];

      testCases.forEach(testCase => {
        const result = getScreenSize.parsePhysicalDimensions(testCase.input);
        expect(result).toEqual(testCase.expected);
      });
    });

    test("should adjust dimensions correctly for portrait rotation (0)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 0);

      expect(result.width).toBe(1080);
      expect(result.height).toBe(2400);
    });

    test("should adjust dimensions correctly for landscape rotation (1)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 1);

      expect(result.width).toBe(2400); // swapped
      expect(result.height).toBe(1080); // swapped
    });

    test("should adjust dimensions correctly for portrait upside down rotation (2)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 2);

      expect(result.width).toBe(1080);
      expect(result.height).toBe(2400);
    });

    test("should adjust dimensions correctly for landscape reverse rotation (3)", function() {
      const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, 3);

      expect(result.width).toBe(2400); // swapped
      expect(result.height).toBe(1080); // swapped
    });

    test("should handle all rotation values correctly", function() {
      const testCases = [
        { rotation: 0, expected: { width: 1080, height: 2400 } }, // portrait
        { rotation: 1, expected: { width: 2400, height: 1080 } }, // landscape
        { rotation: 2, expected: { width: 1080, height: 2400 } }, // portrait upside down
        { rotation: 3, expected: { width: 2400, height: 1080 } }  // landscape reverse
      ];

      testCases.forEach(testCase => {
        const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, testCase.rotation);
        expect(result).toEqual(testCase.expected);
      });
    });

    test("should handle invalid rotation values gracefully", function() {
      // Test with invalid rotation values (should default to portrait)
      const invalidRotations = [-1, 4, 5, 10];

      invalidRotations.forEach(rotation => {
        const result = getScreenSize.adjustDimensionsForRotation(1080, 2400, rotation);
        expect(result.width).toBe(1080);
        expect(result.height).toBe(2400);
      });
    });

    test("should work with different screen sizes", function() {
      const testSizes = [
        { width: 720, height: 1280 },
        { width: 1080, height: 1920 },
        { width: 1440, height: 2560 },
        { width: 2160, height: 3840 }
      ];

      testSizes.forEach(size => {
        // Test portrait (rotation 0)
        const portrait = getScreenSize.adjustDimensionsForRotation(size.width, size.height, 0);
        expect(portrait.width).toBe(size.width);
        expect(portrait.height).toBe(size.height);

        // Test landscape (rotation 1)
        const landscape = getScreenSize.adjustDimensionsForRotation(size.width, size.height, 1);
        expect(landscape.width).toBe(size.height);
        expect(landscape.height).toBe(size.width);
      });
    });
  });
});
