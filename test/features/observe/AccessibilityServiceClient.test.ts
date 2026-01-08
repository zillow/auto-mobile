import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AccessibilityServiceClient } from "../../../src/features/observe/AccessibilityServiceClient";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/AccessibilityServiceManager";
import { AdbClient } from "../../../src/utils/android-cmdline-tools/AdbClient";
import { BootedDevice } from "../../../src/models";
import {
  FakeWebSocket,
  createInstantFailureWebSocketFactory,
  createSuccessWebSocketFactory
} from "../../fakes/FakeWebSocket";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("AccessibilityServiceClient", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let fakeAdb: FakeAdbExecutor;
  let testDevice: BootedDevice;
  let adbClient: AdbClient;
  let fakeTimer: FakeTimer;
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

    accessibilityServiceClient = AccessibilityServiceClient.createForTesting(
      testDevice,
      adbClient,
      createSuccessWebSocketFactory(),
      fakeTimer
    );
    AndroidAccessibilityServiceManager.getInstance(testDevice, adbClient).clearAvailabilityCache();

    // Clear any cached hierarchy data to prevent cache contamination between tests (issue #72)
    accessibilityServiceClient.invalidateCache();
  });

  afterEach(async function() {
    // Clean up WebSocket connections
    if (accessibilityServiceClient) {
      await accessibilityServiceClient.close();
    }
  });

  const createCapturingWebSocketFactory = (): {
    factory: (url: string) => FakeWebSocket;
    getSocket: () => FakeWebSocket | null;
  } => {
    let socket: FakeWebSocket | null = null;

    return {
      factory: (url: string) => {
        socket = new FakeWebSocket(url, "none");
        return socket;
      },
      getSocket: () => socket
    };
  };

  describe("getLatestHierarchy", function() {
    test("should return hierarchy data when WebSocket receives fresh data", async function() {
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

      const { factory, getSocket } = createCapturingWebSocketFactory();
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        adbClient,
        factory
      );

      try {
        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        await new Promise(resolve => setTimeout(resolve, 10));
        const socket = getSocket();
        expect(socket).not.toBeNull();
        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          timestamp: Date.now(),
          data: mockHierarchyData
        }));

        const result = await resultPromise;

        expect(result).not.toBeNull();
        expect(result.hierarchy).not.toBeNull();
        expect(result.fresh).toBe(true);
        expect(result.updatedAt).toBe(1750934583218);
        expect(result.hierarchy!.updatedAt).toBe(1750934583218);
        expect(result.hierarchy!.packageName).toBe("com.google.android.deskclock");
        expect(result.hierarchy!.hierarchy.text).toBe("6:43 AM");
      } finally {
        await testClient.close();
      }
    });

    test("should return cached data when not waiting for fresh data", async function() {
      const mockHierarchyData = {
        updatedAt: 1750934583218,
        packageName: "com.google.android.deskclock",
        hierarchy: {
          text: "Cached Data",
          clickable: "true"
        }
      };

      const { factory, getSocket } = createCapturingWebSocketFactory();
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        adbClient,
        factory
      );

      try {
        // First call to populate cache
        const firstResultPromise = testClient.getLatestHierarchy(true, 2000);
        await new Promise(resolve => setTimeout(resolve, 10));
        const socket = getSocket();
        expect(socket).not.toBeNull();
        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          timestamp: Date.now(),
          data: mockHierarchyData
        }));
        await firstResultPromise;

        // Second call should return cached data immediately
        const startTime = Date.now();
        const result = await testClient.getLatestHierarchy(false, 0);
        const duration = Date.now() - startTime;

        expect(result).not.toBeNull();
        expect(result.hierarchy).not.toBeNull();
        expect(result.hierarchy!.hierarchy.text).toBe("Cached Data");
        expect(duration).toBeLessThan(500); // Should be fast since it's cached
      } finally {
        await testClient.close();
      }
    });

    test("should timeout when no data received within timeout period", async function() {
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

        expect(result).not.toBeNull();
        expect(result.hierarchy).toBeNull();
        expect(result.fresh).toBe(false);
      } finally {
        await testClient.close();
      }
    });

    test("should handle WebSocket connection failure gracefully", async function() {
      // Use FakeWebSocket with instant failure and FakeTimer for fast, reliable test execution
      // See issues #68 (timeout race condition) and #72 (cache contamination)
      fakeTimer.setSleepDuration(1);

      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        adbClient,
        createInstantFailureWebSocketFactory(),
        fakeTimer
      );

      try {
        const result = await testClient.getLatestHierarchy(true, 1000);

        expect(result).not.toBeNull();
        expect(result.hierarchy).toBeNull();
        expect(result.fresh).toBe(false);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("convertToViewHierarchyResult", function() {
    test("should convert accessibility hierarchy to ViewHierarchyResult format", function() {
      const accessibilityHierarchy = {
        updatedAt: 1750934583218,
        packageName: "com.google.android.deskclock",
        intentChooserDetected: true,
        notificationPermissionDetected: true,
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

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
      expect(result.hierarchy.text).toBe("6:43 AM");
      expect(result.hierarchy["content-desc"]).toBe("6:43 AM");
      expect(result.hierarchy.bounds).toBe("[175,687][692,973]");
      expect(result.hierarchy.clickable).toBeUndefined();
      expect(result.hierarchy.enabled).toBe("true");
      expect(result.intentChooserDetected).toBe(true);
      expect(result.notificationPermissionDetected).toBe(true);

      // Check child node conversion
      expect(typeof result.hierarchy.node).toBe("object");
      expect(result.hierarchy.node.text).toBe("Child Node");
      expect(result.hierarchy.node.bounds).toBe("[0,0][100,50]");
      expect(result.hierarchy.node.clickable).toBe("true");
    });

    test("should handle single child node correctly", function() {
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

      expect(typeof result.hierarchy.node).toBe("object"); // Single child should not be in array
      expect(result.hierarchy.node.text).toBe("Single Child");
      expect(result.hierarchy.node.clickable).toBe("true");
    });

    test("should handle conversion errors gracefully", function() {
      // Create a hierarchy that will cause conversion issues
      const problematicHierarchy = {
        updatedAt: 1750934583218,
        packageName: "com.test.app",
        hierarchy: null as any
      };

      const result = accessibilityServiceClient.convertToViewHierarchyResult(problematicHierarchy);

      expect(result).toBeDefined();
      expect(result.hierarchy).toBeDefined();
      expect(result.hierarchy.error).toContain("Accessibility hierarchy missing from accessibility service");
    });

    test("should fall back to window hierarchy when main hierarchy is missing", function() {
      const fallbackHierarchy = {
        updatedAt: 1750934583218,
        packageName: "",
        hierarchy: null as any,
        windows: [
          {
            windowId: 10,
            windowType: "application",
            windowLayer: 0,
            packageName: "com.android.permissioncontroller",
            isActive: false,
            isFocused: true,
            hierarchy: {
              text: "Allow Example to send notifications?",
              "resource-id": "com.android.permissioncontroller:id/permission_allow_button"
            }
          }
        ]
      };

      const result = accessibilityServiceClient.convertToViewHierarchyResult(fallbackHierarchy);

      expect(result.hierarchy).toBeDefined();
      expect(result.hierarchy.text).toBe("Allow Example to send notifications?");
      expect(result.packageName).toBe("com.android.permissioncontroller");
    });
  });

  describe("getAccessibilityHierarchy", function() {
    test("should return null when service is not available", async function() {

      // Configure service as not available
      fakeAdb.setCommandResponse("pm list packages", { stdout: "", stderr: "" });

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();
      expect(result).toBeNull();
    });

    test.skip("should return converted hierarchy when service is available and working", async function() {

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

      expect(result).not.toBeNull();
      expect(result!.hierarchy).toBeDefined();
      expect(result!.hierarchy.text).toBe("Test Text");
      expect(result!.hierarchy.clickable).toBe("true");
      expect(result!.hierarchy.bounds).toBe("[0,0][100,50]");
    });

    test("should return null when hierarchy retrieval fails", async function() {
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
        expect(result).toBeNull();
      } finally {
        // Clean up the test client
        await failingClient.close();
      }
    });
  });
});
