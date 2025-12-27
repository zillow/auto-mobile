import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { AdbUtils } from "../../../src/utils/android-cmdline-tools/adb";
import { AccessibilityServiceManager } from "../../../src/utils/accessibilityServiceManager";
import WebSocket from "ws";

describe("AccessibilityServiceClient", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let mockAdb: AdbUtils;
  let mockWebSocketServer: WebSocket.Server | null = null;
  const serverPort: number = 8765;

  beforeEach(async function() {
    // Create mock ADB instance
    mockAdb = {
      executeCommand: async (cmd: string) => {
        if (cmd.includes("forward")) {
          return { stdout: `${serverPort}`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      }
    } as unknown as AdbUtils;

    // Reset singleton instances for clean test state
    AccessibilityServiceManager.resetInstances();

    accessibilityServiceClient = new AccessibilityServiceClient("test-device", mockAdb);
    AccessibilityServiceManager.getInstance("test-device", mockAdb).clearAvailabilityCache();
  });

  afterEach(async function() {
    // Clean up WebSocket connections
    if (accessibilityServiceClient) {
      await accessibilityServiceClient.close();
    }

    // Close mock server
    if (mockWebSocketServer) {
      mockWebSocketServer.close();
      mockWebSocketServer = null;
    }
  });

  /**
   * Helper to create a mock WebSocket server
   */
  function createMockWebSocketServer(onConnection?: (ws: WebSocket) => void): Promise<void> {
    return new Promise(resolve => {
      mockWebSocketServer = new WebSocket.Server({ port: serverPort });

      mockWebSocketServer.on("connection", ws => {
        // Send connection confirmation
        ws.send(JSON.stringify({ type: "connected", id: 1 }));

        if (onConnection) {
          onConnection(ws);
        }
      });

      mockWebSocketServer.on("listening", () => {
        resolve();
      });
    });
  }

  describe("getLatestHierarchy", function() {
    it("should return hierarchy data when WebSocket receives fresh data", async function() {
      this.timeout(5000);

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

      await createMockWebSocketServer(ws => {
        // Send hierarchy update shortly after connection
        setTimeout(() => {
          ws.send(JSON.stringify({
            type: "hierarchy_update",
            timestamp: Date.now(),
            data: mockHierarchyData
          }));
        }, 100);
      });

      const result = await accessibilityServiceClient.getLatestHierarchy(true, 2000);

      expect(result).to.not.be.null;
      expect(result.hierarchy).to.not.be.null;
      expect(result.fresh).to.be.true;
      expect(result.updatedAt).to.equal(1750934583218);
      expect(result.hierarchy!.timestamp).to.equal(1750934583218);
      expect(result.hierarchy!.packageName).to.equal("com.google.android.deskclock");
      expect(result.hierarchy!.hierarchy.text).to.equal("6:43 AM");
    });

    it("should return cached data when not waiting for fresh data", async function() {
      this.timeout(5000);

      const mockHierarchyData = {
        timestamp: 1750934583218,
        packageName: "com.google.android.deskclock",
        hierarchy: {
          text: "Cached Data",
          clickable: "true"
        }
      };

      await createMockWebSocketServer(ws => {
        // Send hierarchy update immediately
        ws.send(JSON.stringify({
          type: "hierarchy_update",
          timestamp: Date.now(),
          data: mockHierarchyData
        }));
      });

      // First call to populate cache
      await accessibilityServiceClient.getLatestHierarchy(true, 2000);

      // Second call should return cached data immediately
      const startTime = Date.now();
      const result = await accessibilityServiceClient.getLatestHierarchy(false, 0);
      const duration = Date.now() - startTime;

      expect(result).to.not.be.null;
      expect(result.hierarchy).to.not.be.null;
      expect(result.hierarchy!.hierarchy.text).to.equal("Cached Data");
      expect(duration).to.be.lessThan(500); // Should be fast since it's cached
    });

    it("should timeout when no data received within timeout period", async function() {
      this.timeout(5000);

      await createMockWebSocketServer(() => {
        // Don't send any hierarchy data
      });

      const result = await accessibilityServiceClient.getLatestHierarchy(true, 500);

      expect(result).to.not.be.null;
      expect(result.hierarchy).to.be.null;
      expect(result.fresh).to.be.false;
    });

    it("should handle WebSocket connection failure gracefully", async function() {
      this.timeout(5000);

      // Don't create a server, so connection will fail

      const result = await accessibilityServiceClient.getLatestHierarchy(true, 1000);

      expect(result).to.not.be.null;
      expect(result.hierarchy).to.be.null;
      expect(result.fresh).to.be.false;
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
      this.timeout(5000);

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
      this.timeout(5000);

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

      // Mock service as available
      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("pm list packages")) {
          return {
            stdout: `package:${AccessibilityServiceManager.PACKAGE}\n`,
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`,
            stderr: ""
          };
        } else if (cmd.includes("forward")) {
          return { stdout: `${serverPort}`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      await createMockWebSocketServer(ws => {
        // Send hierarchy update immediately
        ws.send(JSON.stringify({
          type: "hierarchy_update",
          timestamp: Date.now(),
          data: mockHierarchyData
        }));
      });

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();

      expect(result).to.not.be.null;
      expect(result!.hierarchy).to.exist;
      expect(result!.hierarchy.text).to.equal("Test Text");
      expect(result!.hierarchy.clickable).to.equal("true");
      expect(result!.hierarchy.bounds).to.equal("[0,0][100,50]");
    });

    it("should return null when hierarchy retrieval fails", async function() {
      this.timeout(5000);

      // Mock service as available but WebSocket connection fails
      mockAdb.executeCommand = async (cmd: string) => {
        if (cmd.includes("pm list packages")) {
          return {
            stdout: `package:${AccessibilityServiceManager.PACKAGE}\n`,
            stderr: ""
          };
        } else if (cmd.includes("settings get secure")) {
          return {
            stdout: `${AccessibilityServiceManager.PACKAGE}/${AccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`,
            stderr: ""
          };
        } else if (cmd.includes("forward")) {
          return { stdout: `${serverPort}`, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      };

      // Don't create WebSocket server, so connection will fail

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();
      expect(result).to.be.null;
    });
  });
});
