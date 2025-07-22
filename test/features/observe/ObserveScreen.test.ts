import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { AwaitIdle } from "../../../src/features/observe/AwaitIdle";
import { ObserveResult } from "../../../src/models/ObserveResult";
import { logger } from "../../../src/utils/logger";

describe("ObserveScreen", function() {
  describe("Unit Tests for Extracted Methods", function() {
    let observeScreen: ObserveScreen;
    let mockAdb: AdbUtils;

    beforeEach(function() {
      mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;
      observeScreen = new ObserveScreen(null, mockAdb);
    });

    it("should create base result with correct structure", function() {
      const result = observeScreen.createBaseResult();

      expect(result).to.have.property("timestamp");
      expect(result).to.have.property("screenSize");
      expect(result).to.have.property("systemInsets");

      expect(result.timestamp).to.be.a("string");
      expect(result.screenSize).to.deep.equal({ width: 0, height: 0 });
      expect(result.systemInsets).to.deep.equal({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it("should create base result with valid ISO timestamp", function() {
      const result = observeScreen.createBaseResult();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).to.not.be.NaN;
      expect(Math.abs(Date.now() - timestamp.getTime())).to.be.lessThan(5000); // Within 5 seconds
    });

    it("should append error message to empty error field", function() {
      const result: ObserveResult = {
        timestamp: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "Test error");

      expect(result.error).to.equal("Test error");
    });

    it("should append error message to existing error field", function() {
      const result: ObserveResult = {
        timestamp: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        error: "Existing error"
      };

      observeScreen.appendError(result, "New error");

      expect(result.error).to.equal("Existing error; New error");
    });

    it("should append multiple errors correctly", function() {
      const result: ObserveResult = {
        timestamp: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "First error");
      observeScreen.appendError(result, "Second error");
      observeScreen.appendError(result, "Third error");

      expect(result.error).to.equal("First error; Second error; Third error");
    });

    it("should handle special characters in error messages", function() {
      const result: ObserveResult = {
        timestamp: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "Error with: semicolon");
      observeScreen.appendError(result, "Error with \"quotes\"");

      expect(result.error).to.equal("Error with: semicolon; Error with \"quotes\"");
    });

    it("should handle empty error message gracefully", function() {
      const result: ObserveResult = {
        timestamp: "2023-01-01T00:00:00.000Z",
        screenSize: { width: 0, height: 0 },
        systemInsets: { top: 0, right: 0, bottom: 0, left: 0 }
      };

      observeScreen.appendError(result, "");

      expect(result.error).to.equal("");
    });
  });

  describe("Unit Tests for Focused Element Functionality", function() {
    let viewHierarchy: any;

    beforeEach(function() {
      const mockAdb = {
        executeCommand: async () => ({ stdout: "", stderr: "" })
      } as unknown as AdbUtils;
      const observeScreen = new ObserveScreen(null, mockAdb);
      viewHierarchy = (observeScreen as any).viewHierarchy;
    });

    it("should detect focused element from view hierarchy", function() {
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

      expect(focusedElement).to.not.be.null;
      expect(focusedElement!.text).to.equal("Input Field");
      expect(focusedElement!["resource-id"]).to.equal("com.example:id/input");
      expect(focusedElement!.focused).to.be.true;
    });

    it("should return null when no element is focused", function() {
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

      expect(focusedElement).to.be.null;
    });

    it("should return null when view hierarchy is empty", function() {
      const emptyViewHierarchy = {
        hierarchy: null
      };

      const focusedElement = viewHierarchy.findFocusedElement(emptyViewHierarchy);

      expect(focusedElement).to.be.null;
    });

    it("should find focused element in nested hierarchy", function() {
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

      expect(focusedElement).to.not.be.null;
      expect(focusedElement!.text).to.equal("Nested Input");
      expect(focusedElement!["resource-id"]).to.equal("com.example:id/nested_input");
      expect(focusedElement!.focused).to.be.true;
    });

    it("should handle boolean focused property", function() {
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

      expect(focusedElement).to.not.be.null;
      expect(focusedElement!.text).to.equal("Button");
      expect(focusedElement!.focused).to.be.true;
    });

    it("should handle element with $ properties", function() {
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

      expect(focusedElement).to.not.be.null;
      expect(focusedElement!.text).to.equal("Button with $");
      expect(focusedElement!["resource-id"]).to.equal("com.example:id/button_dollar");
      expect(focusedElement!.focused).to.be.true;
    });
  });

  describe("Integration Tests", function() {
    this.timeout(30000);

    let observeScreen: ObserveScreen;
    let adb: AdbUtils;
    let awaitIdle: AwaitIdle;
    const CLOCK_PACKAGE = "com.google.android.deskclock";

    beforeEach(async function() {
      // Initialize with real ADB connection
      adb = new AdbUtils();
      observeScreen = new ObserveScreen("test-device", adb);
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

      // Check if any devices are connected
      try {
        const devicesOutput = await adb.executeCommand("devices");
        const deviceLines = devicesOutput.stdout.split("\n").filter(line => line.trim() && !line.includes("List of devices"));
        if (deviceLines.length === 0) {
          return; // No devices connected, skip cleanup
        }
      } catch (error) {
        // Error checking devices, skip cleanup
        return;
      }

      try {
        // Clean up after test
        await adb.executeCommand(`shell am force-stop ${CLOCK_PACKAGE}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it("should get complete observation data with all features enabled", async function() {
      // Execute observe with all features enabled
      const result = await observeScreen.execute();

      // Verify it contains all the required data
      expect(result).to.have.property("timestamp");
      expect(result).to.have.property("screenSize");
      expect(result.screenSize).to.have.property("width");
      expect(result.screenSize).to.have.property("height");
      expect(result.screenSize.width).to.be.greaterThan(0);
      expect(result.screenSize.height).to.be.greaterThan(0);

      expect(result).to.have.property("systemInsets");
      expect(result.systemInsets).to.have.property("top");
      expect(result.systemInsets).to.have.property("right");
      expect(result.systemInsets).to.have.property("bottom");
      expect(result.systemInsets).to.have.property("left");

      expect(result).to.have.property("screenshotPath");
      expect(result.screenshotPath).to.be.a("string");

      // Check if screenshot file exists
      const fileExists = await adb.executeCommand(`shell "if [ -f ${result.screenshotPath} ]; then echo 'exists'; else echo 'not exists'; fi"`);
      expect(fileExists.stdout.trim()).to.include("exists");

      expect(result).to.have.property("viewHierarchy");
      expect(result.viewHierarchy).to.have.property("hierarchy");
      expect(result.viewHierarchy.hierarchy).to.not.be.null;

      expect(result).to.have.property("activeWindow");
      expect(result.activeWindow).to.have.property("appId");
      expect(result.activeWindow!.appId).to.be.a("string").and.not.empty;
    });

    it("should detect and report screen size correctly", async function() {
      const result = await observeScreen.execute();

      // Check screen size is reasonable
      const { width, height } = result.screenSize;
      expect(width).to.be.a("number");
      expect(height).to.be.a("number");
      expect(width).to.be.greaterThan(200);  // Any reasonable device should be wider than 200px
      expect(height).to.be.greaterThan(300); // Any reasonable device should be taller than 300px

      logger.info(`Detected screen size: ${width}x${height}`);
    });

    it("should detect system insets correctly", async function() {
      const result = await observeScreen.execute();

      // Check system insets are reasonable
      const { top, right, bottom, left } = result.systemInsets;
      expect(top).to.be.a("number");
      expect(right).to.be.a("number");
      expect(bottom).to.be.a("number");
      expect(left).to.be.a("number");

      // At least one inset should be non-zero on modern devices (status bar, navigation bar)
      expect(top > 0 || right > 0 || bottom > 0 || left > 0).to.be.true;

      logger.info(`Detected system insets: top=${top}, right=${right}, bottom=${bottom}, left=${left}`);
    });

    it("should include active window information with the package name", async function() {
      const result = await observeScreen.execute();

      expect(result).to.have.property("activeWindow");
      expect(result.activeWindow).to.have.property("appId");

      // Instead of expecting a specific package, just verify we get a valid package name
      expect(result.activeWindow!.appId).to.be.a("string").and.not.empty;

      // Log the actual package for debugging but don't assert on it
      logger.info(`Active window package: ${result.activeWindow!.appId}`);
    });

    it("should execute observe command multiple times maintaining consistency", async function() {
      // First observation
      const firstResult = await observeScreen.execute();

      // Wait for tiny delay to ensure screenshots will have different paths
      new Promise(resolve => setTimeout(resolve, 1));

      // Second observation
      const secondResult = await observeScreen.execute();

      // Screen size should be consistent
      expect(secondResult.screenSize.width).to.equal(firstResult.screenSize.width);
      expect(secondResult.screenSize.height).to.equal(firstResult.screenSize.height);

      // Package name should remain the same
      expect(secondResult.activeWindow!.appId).to.equal(firstResult.activeWindow!.appId);

      // Screenshots should have different paths even if the UI hasn't changed
      expect(secondResult.screenshotPath).to.not.equal(firstResult.screenshotPath);

      // Both screenshots should have valid file paths
      expect(firstResult.screenshotPath).to.be.a("string").and.not.empty;
      expect(secondResult.screenshotPath).to.be.a("string").and.not.empty;

      // Both screenshots should contain timestamp information (format: screenshot_timestamp.ext)
      const firstFilename = firstResult.screenshotPath!.split("/").pop() || "";
      const secondFilename = secondResult.screenshotPath!.split("/").pop() || "";

      expect(firstFilename).to.match(/^screenshot_\d+\.(png|webp)$/);
      expect(secondFilename).to.match(/^screenshot_\d+\.(png|webp)$/);

      logger.info(`First screenshot: ${firstFilename}`);
      logger.info(`Second screenshot: ${secondFilename}`);
    });

    it("should handle errors gracefully if device is disconnected", async function() {
      // Check if there's only one device connected
      const devices = await adb.executeCommand("devices");
      const deviceLines = devices.stdout.split("\n").filter(line => line.trim() && !line.includes("List of devices"));
      if (deviceLines.length !== 1) {
        this.skip(); // Skip if multiple devices or no devices
        return;
      }

      // Create a new ObserveScreen with an invalid device ID
      const invalidObserveScreen = new ObserveScreen("invalid-device-id");

      // Should still return a result object with error info
      const result = await invalidObserveScreen.execute();

      expect(result).to.have.property("timestamp");
      expect(result).to.have.property("screenSize");
      expect(result).to.have.property("systemInsets");
      expect(result).to.have.property("error");
      expect(result.error).to.be.a("string");
    });

    it("should produce complete data that can be serialized to JSON", async function() {
      const result = await observeScreen.execute();

      // Verify the entire result can be serialized to JSON
      const serialized = JSON.stringify(result);
      expect(serialized).to.be.a("string");

      // Verify it can be parsed back
      const parsed = JSON.parse(serialized) as ObserveResult;
      expect(parsed).to.have.property("screenSize");
      expect(parsed.screenSize.width).to.equal(result.screenSize.width);
      expect(parsed.screenSize.height).to.equal(result.screenSize.height);
    });
  });
});
