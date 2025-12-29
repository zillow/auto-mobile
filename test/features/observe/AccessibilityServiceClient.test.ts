import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/accessibilityServiceManager";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../../src/models";
import WebSocket from "ws";
import { createInstantFailureWebSocketFactory, createSuccessWebSocketFactory } from "../../fakes/FakeWebSocket";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("AccessibilityServiceClient", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let fakeAdb: FakeAdbExecutor;
  let testDevice: BootedDevice;
  let adbClient: AdbClient;
  let fakeTimer: FakeTimer;
  let mockWebSocketServer: WebSocket.Server | null = null;
  const serverPort: number = 8765;

  beforeEach(async function() {
    // Create fake timer
    fakeTimer = new FakeTimer();

    // Create fake ADB instance
    fakeAdb = new FakeAdbExecutor();
    fakeAdb.setCommandResponse("forward", { stdout: `${serverPort}`, stderr: "" });
    fakeAdb.setScreenState(true);

    // Create test device
    testDevice = {
      deviceId: "test-device",
      platform: "android",
      isEmulator: true,
      name: "Test Device"
    };

    // Create a wrapper function that adapts FakeAdbExecutor to the execAsync signature
    const fakeExecAsync = async (command: string, maxBuffer?: number) => {
      // Strip the "adb -s test-device " prefix that AdbClient adds
      const prefix = "adb -s test-device ";
      const strippedCommand = command.startsWith(prefix) ? command.slice(prefix.length) : command;
      return fakeAdb.executeCommand(strippedCommand, undefined, maxBuffer);
    };

    // Create AdbClient with fake executor function
    adbClient = new AdbClient(testDevice, fakeExecAsync);

    // Reset singleton instances for clean test state
    AndroidAccessibilityServiceManager.resetInstances();
    AccessibilityServiceClient.resetInstances();

    accessibilityServiceClient = AccessibilityServiceClient.getInstance(testDevice, adbClient);
    AndroidAccessibilityServiceManager.getInstance(testDevice, adbClient).clearAvailabilityCache();
  });

  afterEach(async function() {
    // Clean up WebSocket connections
    if (accessibilityServiceClient) {
      await accessibilityServiceClient.close();
    }

    // Close mock server and wait for it to fully close
    if (mockWebSocketServer) {
      await new Promise<void>((resolve) => {
        mockWebSocketServer!.close(() => {
          resolve();
        });
      });
      mockWebSocketServer = null;
    }

    // Give a small delay for port to be fully released
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  /**
   * Helper to create a mock WebSocket server
   */
  function createWebSocketServer(onConnection?: (ws: WebSocket) => void): Promise<void> {
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
        updatedAt: 1750934583218,
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

      await createWebSocketServer(ws => {
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
      expect(result.hierarchy!.updatedAt).to.equal(1750934583218);
      expect(result.hierarchy!.packageName).to.equal("com.google.android.deskclock");
      expect(result.hierarchy!.hierarchy.text).to.equal("6:43 AM");
    });

    it("should return cached data when not waiting for fresh data", async function() {
      this.timeout(5000);

      const mockHierarchyData = {
        updatedAt: 1750934583218,
        packageName: "com.google.android.deskclock",
        hierarchy: {
          text: "Cached Data",
          clickable: "true"
        }
      };

      await createWebSocketServer(ws => {
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
      // Use FakeWebSocket that connects successfully but sends no data
      // Use delayed mode with 1ms for fast execution
      fakeTimer.setSleepDuration(1);

      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        adbClient,
        createSuccessWebSocketFactory(),
        fakeTimer
      );

      try {
        // Use a short timeout (50ms) to make test run fast
        const result = await testClient.getLatestHierarchy(true, 50);

        expect(result).to.not.be.null;
        expect(result.hierarchy).to.be.null;
        expect(result.fresh).to.be.false;
      } finally {
        await testClient.close();
      }
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
        updatedAt: 1750934583218,
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
        updatedAt: 1750934583218,
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
        updatedAt: 1750934583218,
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

      // Configure service as not available
      fakeAdb.setCommandResponse("pm list packages", { stdout: "", stderr: "" });

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();
      expect(result).to.be.null;
    });

    it.skip("should return converted hierarchy when service is available and working", async function() {
      this.timeout(10000);

      // Configure service as available
      fakeAdb.setCommandResponse("pm list packages", {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("forward", { stdout: `${serverPort}`, stderr: "" });

      let serverWs: WebSocket | null = null;
      await createWebSocketServer(ws => {
        serverWs = ws;
        // Send hierarchy update after connection established
        setTimeout(() => {
          if (serverWs) {
            const mockHierarchyData = {
              updatedAt: Date.now(),
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

            serverWs.send(JSON.stringify({
              type: "hierarchy_update",
              timestamp: Date.now(),
              data: mockHierarchyData
            }));
          }
        }, 100);

        // Also listen for sync requests and respond
        ws.on("message", (data: any) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === "request_hierarchy" || message.type === "request_hierarchy_if_stale") {
              const mockHierarchyData = {
                updatedAt: Date.now(),
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

              ws.send(JSON.stringify({
                type: "hierarchy_update",
                timestamp: Date.now(),
                data: mockHierarchyData
              }));
            }
          } catch (e) {
            // Ignore parse errors
          }
        });
      });

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();

      expect(result).to.not.be.null;
      expect(result!.hierarchy).to.exist;
      expect(result!.hierarchy.text).to.equal("Test Text");
      expect(result!.hierarchy.clickable).to.equal("true");
      expect(result!.hierarchy.bounds).to.equal("[0,0][100,50]");
    });

    it("should return null when hierarchy retrieval fails", async function() {
      // Configure service as available but WebSocket connection will fail
      fakeAdb.setCommandResponse("pm list packages", {
        stdout: `package:${AndroidAccessibilityServiceManager.PACKAGE}\n`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("settings get secure", {
        stdout: `${AndroidAccessibilityServiceManager.PACKAGE}/${AndroidAccessibilityServiceManager.PACKAGE}.AutoMobileAccessibilityService`,
        stderr: ""
      });
      fakeAdb.setCommandResponse("forward", { stdout: `${serverPort}`, stderr: "" });

      // Set screen to off - this triggers fast-fail in waitForFreshData after ~1 second
      fakeAdb.setScreenState(false);

      // Use delayed mode with 1ms for faster test execution
      fakeTimer.setSleepDuration(1);

      // Create a new client with FakeWebSocket that fails instantly and FakeTimer
      const failingClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        adbClient,
        createInstantFailureWebSocketFactory(),
        fakeTimer
      );

      try {
        const result = await failingClient.getAccessibilityHierarchy();
        expect(result).to.be.null;
      } finally {
        // Clean up the test client
        await failingClient.close();
      }
    });
  });
});
