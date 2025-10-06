import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { AccessibilityServiceManager } from "../../../src/utils/accessibilityServiceManager";
import { ViewHierarchyTimestampContext } from "../../../src/models/ViewHierarchyQueryOptions";

describe("AccessibilityServiceClient", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let mockAdb: AdbUtils;

  beforeEach(function() {
    // Create mock ADB instance
    mockAdb = {
      executeCommand: async () => ({ stdout: "", stderr: "" })
    } as unknown as AdbUtils;

    // Reset singleton instances for clean test state
    AccessibilityServiceManager.resetInstances();

    accessibilityServiceClient = new AccessibilityServiceClient("test-device", mockAdb);
    AccessibilityServiceManager.getInstance("test-device", mockAdb).clearAvailabilityCache();
  });

  describe("getLatestHierarchy", function() {
    it("should return hierarchy data when accessibility service responds successfully", async function() {
      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.google.android.deskclock",
        hierarchy: {
          "text": "6:43 AM",
          "content-desc": "6:43 AM",
          "resource-id": "com.google.android.deskclock:id/digital_clock",
          "bounds": {
            left: 175,
            top: 687,
            right: 692,
            bottom: 973
          },
          "clickable": "false",
          "enabled": "true"
        }
      };

      mockAdb.executeCommand = async () => ({
        stdout: JSON.stringify(mockHierarchyData),
        stderr: ""
      });

      const result = await accessibilityServiceClient.getLatestHierarchy();

      expect(result).to.not.be.null;
      expect(result!.timestamp).to.equal(1750934583218);
      expect(result!.packageName).to.equal("com.google.android.deskclock");
      expect(result!.hierarchy.text).to.equal("6:43 AM");
    });

    it("should return null when accessibility service returns empty response", async function() {
      mockAdb.executeCommand = async () => ({
        stdout: "",
        stderr: ""
      });

      const result = await accessibilityServiceClient.getLatestHierarchy();
      expect(result).to.be.null;
    });

    it("should return null when accessibility service returns invalid JSON", async function() {
      mockAdb.executeCommand = async () => ({
        stdout: "invalid json data",
        stderr: ""
      });

      const result = await accessibilityServiceClient.getLatestHierarchy();
      expect(result).to.be.null;
    });

    it("should return null when ADB command fails", async function() {
      mockAdb.executeCommand = async () => {
        throw new Error(`run-as: Package '${AccessibilityServiceManager.PACKAGE}' is not debuggable`);
      };

      const result = await accessibilityServiceClient.getLatestHierarchy();
      expect(result).to.be.null;
    });
  });

  describe("convertToViewHierarchyResult", function() {
    it("should convert accessibility hierarchy to ViewHierarchyResult format", function() {
      const accessibilityHierarchy = {
        timestamp: 1750934583218,
        packageName: "com.google.android.deskclock",
        hierarchy: {
          "text": "6:43 AM",
          "content-desc": "6:43 AM",
          "resource-id": "com.google.android.deskclock:id/digital_clock",
          "bounds": {
            left: 175,
            top: 687,
            right: 692,
            bottom: 973
          },
          "clickable": "false",
          "enabled": "true",
          "node": [
            {
              text: "Child Node",
              bounds: {
                left: 0,
                top: 0,
                right: 100,
                bottom: 50
              },
              clickable: "true"
            }
          ]
        }
      };

      const result = accessibilityServiceClient.convertToViewHierarchyResult(accessibilityHierarchy);

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
      expect(result.hierarchy.text).to.equal("6:43 AM");
      expect(result.hierarchy["content-desc"]).to.equal("6:43 AM");
      expect(result.hierarchy.bounds).to.equal("[175,687][692,973]");
      expect(result.hierarchy.clickable).to.be.undefined;
      expect(result.hierarchy.enabled).to.equal("true");

      // Check child node conversion
      expect(result.hierarchy.node).to.be.an("object");
      expect(result.hierarchy.node.text).to.equal("Child Node");
      expect(result.hierarchy.node.bounds).to.equal("[0,0][100,50]");
      expect(result.hierarchy.node.clickable).to.equal("true");
    });

    it("should handle single child node correctly", function() {
      const accessibilityHierarchy = {
        timestamp: 1750934583218,
        packageName: "com.test.app",
        hierarchy: {
          text: "Parent",
          node: [
            {
              text: "Single Child",
              clickable: "true"
            }
          ]
        }
      };

      const result = accessibilityServiceClient.convertToViewHierarchyResult(accessibilityHierarchy);

      expect(result.hierarchy.node).to.be.an("object"); // Single child should not be in array
      expect(result.hierarchy.node.text).to.equal("Single Child");
      expect(result.hierarchy.node.clickable).to.equal("true");
    });

    it("should handle conversion errors gracefully", function() {
      // Create a hierarchy that will cause conversion issues
      const problematicHierarchy = {
        timestamp: 1750934583218,
        packageName: "com.test.app",
        hierarchy: null as any
      };

      const result = accessibilityServiceClient.convertToViewHierarchyResult(problematicHierarchy);

      expect(result).to.exist;
      expect(result.hierarchy).to.exist;
      expect(result.hierarchy.error).to.include("Failed to convert accessibility service hierarchy format");
    });
  });

  describe("getAccessibilityHierarchy", function() {
    it("should return null when service is not available", async function() {
      // Mock service as not available
      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("pm list packages")) {
          return { stdout: "", stderr: "" }; // No packages found
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();
      expect(result).to.be.null;
    });

    it("should return converted hierarchy when service is available and working", async function() {
      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.google.android.deskclock",
        hierarchy: {
          text: "Test Text",
          clickable: "true",
          bounds: {
            left: 0,
            top: 0,
            right: 100,
            bottom: 50
          }
        }
      };

      let commandCount = 0;
      mockAdb.executeCommand = async (cmd: string) => {
        commandCount++;
        if (cmd.includes("pm list packages")) {
          return {
            stdout: `package:${AccessibilityServiceManager.PACKAGE}
`,
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
            stderr: ""
          };
        } else if (cmd.includes("run-as")) {
          return {
            stdout: JSON.stringify(mockHierarchyData),
            stderr: ""
          };
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();

      expect(result).to.not.be.null;
      expect(result!.hierarchy).to.exist;
      expect(result!.hierarchy.text).to.equal("Test Text");
      expect(result!.hierarchy.clickable).to.equal("true");
      expect(result!.hierarchy.bounds).to.equal("[0,0][100,50]");
      expect(commandCount).to.equal(3); // Installation check, enabled check, hierarchy fetch
    });

    it("should return null when hierarchy retrieval fails", async function() {
      let commandCount = 0;
      mockAdb.executeCommand = async (cmd: string) => {
        commandCount++;
        if (cmd.includes("pm list packages")) {
          return {
            stdout: `package:${AccessibilityServiceManager.PACKAGE}
`,
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutomobileAccessibilityService`,
            stderr: ""
          };
        } else if (cmd.includes("run-as")) {
          throw new Error("File not found");
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();
      expect(result).to.be.null;
      expect(commandCount).to.equal(3);
    });
  });

  describe("parseFileTimestamp", function() {
    it("should parse standard ls -l --full-time output correctly", async function() {
      const lsOutput = "-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json";
      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      let lsCommandCalled = false;
      let catCommandCalled = false;

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          lsCommandCalled = true;
          return { stdout: lsOutput, stderr: "" };
        } else if (cmd.includes("cat")) {
          catCommandCalled = true;
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: 1727791860000, // Earlier than the file timestamp
        minRequiredTimestamp: 1727791860000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);

      expect(lsCommandCalled).to.be.true;
      expect(catCommandCalled).to.be.true;
      expect(result).to.not.be.null;
      expect(result!.timestamp).to.equal(1750934583218);
    });

    it("should handle ls output with different timezone formats", async function() {
      const lsOutput = "-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 14:11:00.875765737 +0000 files/latest_hierarchy.json";
      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        } else if (cmd.includes("cat")) {
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: 1727791860000,
        minRequiredTimestamp: 1727791860000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.not.be.null;
    });

    it("should handle ls output with milliseconds precision", async function() {
      const lsOutput = "-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.123456789 -0500 files/latest_hierarchy.json";
      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        } else if (cmd.includes("cat")) {
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: 1727791860000,
        minRequiredTimestamp: 1727791860000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.not.be.null;
    });

    it("should return null when ls output is malformed", async function() {
      const lsOutput = "malformed output without proper structure";

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: Date.now(),
        minRequiredTimestamp: Date.now()
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.be.null;
    });

    it("should return null when ls command fails", async function() {
      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          throw new Error("Permission denied");
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: Date.now(),
        minRequiredTimestamp: Date.now()
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.be.null;
    });
  });

  describe("validateHierarchyTimestamp", function() {
    it("should accept file timestamp newer than action start time", async function() {
      // Use a fixed timestamp: October 1, 2025, 09:11:00.875 EST = 1727791860875
      const fileTimestamp = 1727791860875;
      const lsOutput = `-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json`;
      const mockHierarchyData = {
        timestamp: fileTimestamp,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        } else if (cmd.includes("cat")) {
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: fileTimestamp - 1000, // Action started 1 second before file
        minRequiredTimestamp: fileTimestamp - 1000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.not.be.null;
    });

    it("should reject file timestamp older than action start time", async function() {
      const fileTimestamp = 1727791860875;
      const lsOutput = `-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json`;

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: fileTimestamp + 5000, // Action started 5 seconds after file
        minRequiredTimestamp: fileTimestamp + 5000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.be.null;
    });

    it("should accept file timestamp newer than stability start time", async function() {
      // Use a fixed timestamp: October 1, 2025, 09:11:00.875 EST = 1727791860875
      const fileTimestamp = 1727791860875;
      const lsOutput = `-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json`;
      const mockHierarchyData = {
        timestamp: fileTimestamp,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        } else if (cmd.includes("cat")) {
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: fileTimestamp - 2000,
        stabilityStartTime: fileTimestamp - 1000, // Stability started 1 second before file
        minRequiredTimestamp: fileTimestamp - 1000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.not.be.null;
    });

    it("should reject file timestamp older than stability start time", async function() {
      const fileTimestamp = 1727791860875;
      const lsOutput = `-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json`;

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: fileTimestamp - 2000,
        stabilityStartTime: fileTimestamp + 1000, // Stability started 1 second after file
        minRequiredTimestamp: fileTimestamp + 1000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.be.null;
    });

    it("should work without stability timing if not provided", async function() {
      // Use a fixed timestamp: October 1, 2025, 09:11:00.875 EST = 1727791860875
      const fileTimestamp = 1727791860875;
      const lsOutput = `-rw-rw---- 1 u0_a385 u0_a385 17562 2025-10-01 09:11:00.875765737 -0500 files/latest_hierarchy.json`;
      const mockHierarchyData = {
        timestamp: fileTimestamp,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: lsOutput, stderr: "" };
        } else if (cmd.includes("cat")) {
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: fileTimestamp - 1000,
        // No stabilityStartTime provided
        minRequiredTimestamp: fileTimestamp - 1000
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.not.be.null;
    });

    it("should reject when file timestamp cannot be determined", async function() {
      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          return { stdout: "", stderr: "" }; // Empty output
        }
        return { stdout: "", stderr: "" };
      };

      const timestampContext: ViewHierarchyTimestampContext = {
        actionStartTime: Date.now(),
        minRequiredTimestamp: Date.now()
      };

      const result = await accessibilityServiceClient.getLatestHierarchy(undefined, timestampContext);
      expect(result).to.be.null;
    });
  });

  describe("getLatestHierarchy with timestampContext", function() {
    it("should skip timestamp validation when no context is provided", async function() {
      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.test.app",
        hierarchy: { text: "Test" }
      };

      let lsCommandCalled = false;

      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("ls -l --full-time")) {
          lsCommandCalled = true;
          return { stdout: "", stderr: "" };
        } else if (cmd.includes("cat")) {
          return { stdout: JSON.stringify(mockHierarchyData), stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      const result = await accessibilityServiceClient.getLatestHierarchy();

      expect(lsCommandCalled).to.be.false; // ls should not be called without context
      expect(result).to.not.be.null;
      expect(result!.timestamp).to.equal(1750934583218);
    });
  });
});
