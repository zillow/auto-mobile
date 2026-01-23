import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { ObserveResult } from "../../../src/models/ObserveResult";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import { logger } from "../../../src/utils/logger";

describe("ObserveScreen", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let observeScreen: ObserveScreen;
    let fakeAdb: FakeAdbExecutor;
    let mockDevice: BootedDevice;

    beforeAll(function() {
      ObserveScreen.clearCache();
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      fakeAdb = new FakeAdbExecutor();
      observeScreen = new ObserveScreen(mockDevice, fakeAdb);
    });

    test("should create base result with correct structure", function() {
      const result = observeScreen.createBaseResult();

      expect(result).toHaveProperty("updatedAt");
      expect(result).toHaveProperty("screenSize");
      expect(result).toHaveProperty("systemInsets");

      expect(typeof result.updatedAt).toBe("string");
      expect(result.screenSize).toEqual({ width: 0, height: 0 });
      expect(result.systemInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    test("should create base result with valid ISO timestamp", function() {
      const result = observeScreen.createBaseResult();

      const updatedAt = new Date(result.updatedAt);
      expect(updatedAt.getTime()).not.toBe(NaN);
      expect(Math.abs(Date.now() - updatedAt.getTime())).toBeLessThan(5000); // Within 5 seconds
    });

    test("should append error message to empty error field", function() {
      const result: ObserveResult = {
        updatedAt: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "Test error");

      expect(result.error).toBe("Test error");
    });

    test("should append error message to existing error field", function() {
      const result: ObserveResult = {
        updatedAt: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Existing error"
      };

      observeScreen.appendError(result, "New error");

      expect(result.error).toBe("Existing error; New error");
    });

    test("should append multiple errors correctly", function() {
      const result: ObserveResult = {
        updatedAt: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "First error");
      observeScreen.appendError(result, "Second error");
      observeScreen.appendError(result, "Third error");

      expect(result.error).toBe("First error; Second error; Third error");
    });

    test("should handle special characters in error messages", function() {
      const result: ObserveResult = {
        updatedAt: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "Error with: semicolon");
      observeScreen.appendError(result, "Error with \"quotes\"");

      expect(result.error).toBe("Error with: semicolon; Error with \"quotes\"");
    });

    test("should handle empty error message gracefully", function() {
      const result: ObserveResult = {
        updatedAt: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "");

      expect(result.error).toBe("");
    });
  });

  describe("Unit Tests for Focused Element Functionality", function() {
    let viewHierarchy: any;
    let mockDevice: BootedDevice;

    beforeAll(function() {
      mockDevice = {
        deviceId: "test-device",
        name: "Test Device",
        platform: "android"
      };
      const fakeAdb = new FakeAdbExecutor();
      const observeScreen = new ObserveScreen(mockDevice, fakeAdb);
      viewHierarchy = (observeScreen as any).viewHierarchy;
    });

    test("should detect focused element from view hierarchy", function() {
      const mockViewHierarchy = {
        hierarchy: {
          node: [
            {
              "text": "Button 1",
              "resource-id": "com.example:id/button1",
              "bounds": "[0,0][100,50]",
              "clickable": "true",
              "focused": "false"
            },
            {
              "text": "Input Field",
              "resource-id": "com.example:id/input",
              "bounds": "[0,60][200,100]",
              "clickable": "true",
              "focused": "true"
            },
            {
              "text": "Button 2",
              "resource-id": "com.example:id/button2",
              "bounds": "[0,110][100,160]",
              "clickable": "true",
              "focused": "false"
            }
          ]
        }
      };

      const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

      expect(focusedElement).not.toBeNull();
      expect(focusedElement!.text).toBe("Input Field");
      expect(focusedElement!["resource-id"]).toBe("com.example:id/input");
      expect(focusedElement!.focused).toBe(true);
    });

    test("should return null when no element is focused", function() {
      const mockViewHierarchy = {
        hierarchy: {
          node: [
            {
              "text": "Button 1",
              "resource-id": "com.example:id/button1",
              "bounds": "[0,0][100,50]",
              "clickable": "true",
              "focused": "false"
            },
            {
              "text": "Button 2",
              "resource-id": "com.example:id/button2",
              "bounds": "[0,110][100,160]",
              "clickable": "true",
              "focused": "false"
            }
          ]
        }
      };

      const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

      expect(focusedElement).toBeNull();
    });

    test("should return null when view hierarchy is empty", function() {
      const emptyViewHierarchy = {
        hierarchy: null
      };

      const focusedElement = viewHierarchy.findFocusedElement(emptyViewHierarchy);

      expect(focusedElement).toBeNull();
    });

    test("should find focused element in nested hierarchy", function() {
      const mockViewHierarchy = {
        hierarchy: {
          node: {
            "text": "Container",
            "resource-id": "com.example:id/container",
            "bounds": "[0,0][300,200]",
            "focused": "false",
            "node": [
              {
                "text": "Nested Button",
                "resource-id": "com.example:id/nested_button",
                "bounds": "[10,10][90,40]",
                "clickable": "true",
                "focused": "false"
              },
              {
                "text": "Nested Input",
                "resource-id": "com.example:id/nested_input",
                "bounds": "[10,50][200,80]",
                "clickable": "true",
                "focused": "true"
              }
            ]
          }
        }
      };

      const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

      expect(focusedElement).not.toBeNull();
      expect(focusedElement!.text).toBe("Nested Input");
      expect(focusedElement!["resource-id"]).toBe("com.example:id/nested_input");
      expect(focusedElement!.focused).toBe(true);
    });

    test("should handle boolean focused property", function() {
      const mockViewHierarchy = {
        hierarchy: {
          node: {
            "text": "Button",
            "resource-id": "com.example:id/button",
            "bounds": "[0,0][100,50]",
            "clickable": "true",
            "focused": true  // Boolean instead of string
          }
        }
      };

      const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

      expect(focusedElement).not.toBeNull();
      expect(focusedElement!.text).toBe("Button");
      expect(focusedElement!.focused).toBe(true);
    });

    test("should handle element with $ properties", function() {
      const mockViewHierarchy = {
        hierarchy: {
          node: {
            "$": {
              "text": "Button with $",
              "resource-id": "com.example:id/button_dollar",
              "bounds": "[0,0][100,50]",
              "clickable": "true",
              "focused": "true"
            }
          }
        }
      };

      const focusedElement = viewHierarchy.findFocusedElement(mockViewHierarchy);

      expect(focusedElement).not.toBeNull();
      expect(focusedElement!.text).toBe("Button with $");
      expect(focusedElement!["resource-id"]).toBe("com.example:id/button_dollar");
      expect(focusedElement!.focused).toBe(true);
    });
  });

  describe("Integration Tests", function() {

    let observeScreen: ObserveScreen;
    let mockDevice: BootedDevice;

    beforeEach(async function() {
      // Clear cache before each test to prevent interference between tests
      ObserveScreen.clearCache();

      // Skip integration tests by default - they require a real device
      // To run integration tests, set a real device ID
      mockDevice = null as any;
      return;
    });

    afterEach(async function() {
      // No cleanup needed since integration tests are skipped
    });

    test("should get complete observation data with all features enabled", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      // Execute observe with all features enabled
      const result = await observeScreen.execute();

      // Verify it contains all the required data
      expect(result).toHaveProperty("updatedAt");
      expect(result).toHaveProperty("screenSize");
      expect(result.screenSize).toHaveProperty("width");
      expect(result.screenSize).toHaveProperty("height");
      expect(result.screenSize.width).toBeGreaterThan(0);
      expect(result.screenSize.height).toBeGreaterThan(0);

      expect(result).toHaveProperty("systemInsets");
      expect(result.systemInsets).toHaveProperty("top");
      expect(result.systemInsets).toHaveProperty("right");
      expect(result.systemInsets).toHaveProperty("bottom");
      expect(result.systemInsets).toHaveProperty("left");

      expect(result).toHaveProperty("viewHierarchy");
      expect(result.viewHierarchy).toHaveProperty("hierarchy");
      expect(result.viewHierarchy.hierarchy).not.toBeNull();

      expect(result).toHaveProperty("activeWindow");
      expect(result.activeWindow).toHaveProperty("appId");
      expect(typeof result.activeWindow!.appId).toBe("string");
      expect(result.activeWindow!.appId.length).toBeGreaterThan(0);
    });

    test("should detect and report screen size correctly", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      const result = await observeScreen.execute();

      // Check screen size is reasonable
      const { width, height } = result.screenSize;
      expect(typeof width).toBe("number");
      expect(typeof height).toBe("number");
      expect(width).toBeGreaterThan(200);  // Any reasonable device should be wider than 200px
      expect(height).toBeGreaterThan(300); // Any reasonable device should be taller than 300px

      logger.info(`Detected screen size: ${width}x${height}`);
    });

    test("should detect system insets correctly", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      const result = await observeScreen.execute();

      // Check system insets are reasonable
      const { top, right, bottom, left } = result.systemInsets;
      expect(typeof top).toBe("number");
      expect(typeof right).toBe("number");
      expect(typeof bottom).toBe("number");
      expect(typeof left).toBe("number");

      // At least one inset should be non-zero on modern devices (status bar, navigation bar)
      expect(top > 0 || right > 0 || bottom > 0 || left > 0).toBe(true);

      logger.info(`Detected system insets: top=${top}, right=${right}, bottom=${bottom}, left=${left}`);
    });

    test("should include active window information with the package name", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      const result = await observeScreen.execute();

      expect(result).toHaveProperty("activeWindow");
      expect(result.activeWindow).toHaveProperty("appId");

      // Instead of expecting a specific package, just verify we get a valid package name
      expect(typeof result.activeWindow!.appId).toBe("string");
      expect(result.activeWindow!.appId.length).toBeGreaterThan(0);

      // Log the actual package for debugging but don't assert on it
      logger.info(`Active window package: ${result.activeWindow!.appId}`);
    });

    test("should execute observe command multiple times maintaining consistency", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      // First observation
      const firstResult = await observeScreen.execute();

      // Wait for tiny delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second observation
      const secondResult = await observeScreen.execute();

      // Screen size should be consistent
      expect(secondResult.screenSize.width).toBe(firstResult.screenSize.width);
      expect(secondResult.screenSize.height).toBe(firstResult.screenSize.height);

      // Both should have activeWindow with valid package names
      expect(firstResult.activeWindow).toBeDefined();
      expect(secondResult.activeWindow).toBeDefined();
      if (firstResult.activeWindow && secondResult.activeWindow) {
        expect(typeof firstResult.activeWindow.appId).toBe("string");
        expect(firstResult.activeWindow.appId.length).toBeGreaterThan(0);
        expect(typeof secondResult.activeWindow.appId).toBe("string");
        expect(secondResult.activeWindow.appId.length).toBeGreaterThan(0);
      }

      // Both observations should have view hierarchy
      expect(firstResult.viewHierarchy).toBeDefined();
      expect(secondResult.viewHierarchy).toBeDefined();
    });

    test("should handle errors gracefully if device is disconnected", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      // Check if there's only one device connected
      const devices = await adb.executeCommand("devices");
      const deviceLines = devices.stdout.split("\n").filter(line => line.trim() && !line.includes("List of devices"));
      if (deviceLines.length !== 1) {
        // Note: Bun does not support dynamic test skipping // Skip if multiple devices or no devices
        return;
      }

      // Create a new ObserveScreen with an invalid device ID
      const invalidDevice: BootedDevice = {
        deviceId: "invalid-device-id",
        name: "Invalid Device",
        platform: "android"
      };
      // Pass fakeAdb to avoid creating real AdbClient
      const invalidObserveScreen = new ObserveScreen(invalidDevice, fakeAdb as any);

      // Should still return a result object with error info
      const result = await invalidObserveScreen.execute();

      expect(result).toHaveProperty("updatedAt");
      expect(result).toHaveProperty("screenSize");
      expect(result).toHaveProperty("systemInsets");
      expect(result).toHaveProperty("error");
      expect(typeof result.error).toBe("string");
    });

    test("should produce complete data that can be serialized to JSON", async function() {
      if (!mockDevice) {return;} // Skip if no device available

      const result = await observeScreen.execute();

      // Verify the entire result can be serialized to JSON
      const serialized = JSON.stringify(result);
      expect(typeof serialized).toBe("string");

      // Verify it can be parsed back
      const parsed = JSON.parse(serialized) as ObserveResult;
      expect(parsed).toHaveProperty("screenSize");
      expect(parsed.screenSize.width).toBe(result.screenSize.width);
      expect(parsed.screenSize.height).toBe(result.screenSize.height);
    });
  });
});
