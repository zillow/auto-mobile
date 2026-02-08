import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AccessibilityServiceClient } from "../../../src/features/observe/android";
import { NavigationGraphManager } from "../../../src/features/navigation/NavigationGraphManager";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { AndroidAccessibilityServiceManager } from "../../../src/utils/AccessibilityServiceManager";
import { FakeAdbClientFactory } from "../../fakes/FakeAdbClientFactory";
import { BootedDevice, HighlightShape } from "../../../src/models";
import {
  FakeWebSocket,
  createInstantFailureWebSocketFactory,
  createSuccessWebSocketFactory,
  WebSocketState
} from "../../fakes/FakeWebSocket";
import { FakeInstalledAppsRepository } from "../../fakes/FakeInstalledAppsRepository";
import { FakeTimer } from "../../fakes/FakeTimer";

describe("AccessibilityServiceClient", function() {
  let accessibilityServiceClient: AccessibilityServiceClient;
  let fakeAdb: FakeAdbExecutor;
  let testDevice: BootedDevice;
  let fakeTimer: FakeTimer;
  let fakeAdbFactory: FakeAdbClientFactory;
  const serverPort: number = 8765;

  beforeEach(async function() {
    // Create fake timer with auto-advance for async event flushing
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

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

    // Create FakeAdbClientFactory for AndroidAccessibilityServiceManager
    fakeAdbFactory = new FakeAdbClientFactory();

    // Reset singleton instances for clean test state
    AndroidAccessibilityServiceManager.resetInstances();
    AccessibilityServiceClient.resetInstances();

    // Pass FakeAdbExecutor directly to createForTesting since it implements AdbExecutor
    accessibilityServiceClient = AccessibilityServiceClient.createForTesting(
      testDevice,
      fakeAdb,
      createSuccessWebSocketFactory(),
      fakeTimer
    );
    AndroidAccessibilityServiceManager.getInstance(testDevice, fakeAdbFactory).clearAvailabilityCache();

    // Clear any cached hierarchy data to prevent cache contamination between tests (issue #72)
    accessibilityServiceClient.invalidateCache();
  });

  afterEach(async function() {
    // Clean up WebSocket connections
    if (accessibilityServiceClient) {
      await accessibilityServiceClient.close();
    }
  });

  class CapturingWebSocket extends FakeWebSocket {
    sentMessages: string[] = [];

    send(data: any): void {
      this.sentMessages.push(data.toString());
      super.send(data);
    }
  }

  const createCapturingWebSocketFactory = (timer?: FakeTimer): {
    factory: (url: string) => CapturingWebSocket;
    getSocket: () => CapturingWebSocket | null;
  } => {
    let socket: CapturingWebSocket | null = null;

    return {
      factory: (url: string) => {
        socket = new CapturingWebSocket(url, "none", 0, timer);
        return socket;
      },
      getSocket: () => socket
    };
  };

  const waitForSocketOpen = async (socket: FakeWebSocket | null): Promise<void> => {
    if (!socket) {
      return;
    }
    if (socket.readyState === WebSocketState.OPEN) {
      return;
    }
    await new Promise<void>(resolve => {
      socket.once("open", () => resolve());
    });
  };

  const waitForSocket = async (getSocket: () => FakeWebSocket | null): Promise<FakeWebSocket | null> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const socket = getSocket();
      if (socket) {
        return socket;
      }
      await new Promise(resolve => setImmediate(resolve));
    }
    return getSocket();
  };

  const waitForSentMessages = async (socket: CapturingWebSocket | null, minCount: number = 1): Promise<void> => {
    if (!socket) {
      return;
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      if (socket.sentMessages.length >= minCount) {
        return;
      }
      await new Promise(resolve => setImmediate(resolve));
    }
  };

  const flushPromises = async (iterations: number = 3): Promise<void> => {
    for (let i = 0; i < iterations; i += 1) {
      await new Promise(resolve => setImmediate(resolve));
    }
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

      // Use FakeTimer for fast, deterministic test execution
      const testTimer = new FakeTimer();
      testTimer.enableAutoAdvance();

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          timestamp: testTimer.now(),
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
        updatedAt: 100, // Use timer-relative timestamp
        packageName: "com.google.android.deskclock",
        hierarchy: {
          text: "Cached Data",
          clickable: "true"
        }
      };

      const testTimer = new FakeTimer();
      // Don't use autoAdvance - we need to control time for polling
      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        testTimer
      );

      try {
        // First call to populate cache - use resolveWithFakeTimer for polling
        const firstResultPromise = testClient.getLatestHierarchy(true, 2000);

        // Wait for socket and send message (this happens in parallel with the promise)
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        // Simulate message - this sets cachedHierarchy
        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          timestamp: testTimer.now(),
          data: mockHierarchyData
        }));

        // Now advance time so the polling interval finds the fresh data
        await testTimer.resolvePromise(firstResultPromise);

        // Second call should return cached data immediately (no polling needed)
        testTimer.enableAutoAdvance(); // Now autoAdvance is fine
        const startTime = testTimer.now();
        const result = await testClient.getLatestHierarchy(false, 0);
        const duration = testTimer.now() - startTime;

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

      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createSuccessWebSocketFactory(fakeTimer),
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

      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createInstantFailureWebSocketFactory(fakeTimer),
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

    test.skip("should seed navigation graph from hierarchy updates", async function() {
      NavigationGraphManager.resetInstance();
      const navManager = NavigationGraphManager.getInstance();

      const testTimer = new FakeTimer();
      testTimer.enableAutoAdvance();
      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          timestamp: testTimer.now(),
          data: {
            updatedAt: testTimer.now(),
            packageName: "com.google.android.deskclock",
            hierarchy: {
              "text": "6:43 AM",
              "content-desc": "6:43 AM",
              "resource-id": "com.google.android.deskclock:id/digital_clock",
            }
          }
        }));

        await resultPromise;
        // Allow async event handlers to process (navigation graph update is async)
        for (let i = 0; i < 10; i++) {
          await testTimer.advanceTimersByTimeAsync(1);
        }

        // With named-nodes-only feature, hierarchy updates alone don't create screens
        // They only update screens when there's an active SDK navigation event
        // or when the fingerprint is already correlated to a named node.
        // The app ID is still set from the package name.
        expect(navManager.getCurrentAppId()).toBe("com.google.android.deskclock");
        // Without SDK events (named nodes), currentScreen remains null
        expect(navManager.getCurrentScreen()).toBeNull();
      } finally {
        await testClient.close();
        NavigationGraphManager.resetInstance();
      }
    });

    test("should preserve SDK screen names when hierarchy updates follow navigation events", async function() {
      NavigationGraphManager.resetInstance();
      const navManager = NavigationGraphManager.getInstance();

      const testTimer = new FakeTimer();
      testTimer.enableAutoAdvance();
      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        socket!.simulateMessage(JSON.stringify({
          type: "navigation_event",
          event: {
            destination: "SdkHome",
            source: "SdkStart",
            arguments: {},
            metadata: {},
            timestamp: testTimer.now(),
            sequenceNumber: 1,
            applicationId: "com.example.sdk",
          }
        }));

        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          timestamp: testTimer.now(),
          data: {
            updatedAt: testTimer.now(),
            packageName: "com.example.sdk",
            hierarchy: {
              "text": "SDK Home",
              "resource-id": "com.example.sdk:id/home",
            }
          }
        }));

        await resultPromise;
        await testTimer.advanceTimersByTimeAsync(1);

        expect(navManager.getCurrentScreen()).toBe("SdkHome");
      } finally {
        await testClient.close();
        NavigationGraphManager.resetInstance();
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

  });

  describe("getAccessibilityHierarchy", function() {
    test("should return null when service is not available", async function() {

      // Configure service as not available
      fakeAdb.setCommandResponse("pm list packages", { stdout: "", stderr: "" });

      const result = await accessibilityServiceClient.getAccessibilityHierarchy();
      expect(result).toBeNull();
    });

    // WebSocket-based hierarchy retrieval is tested through integration tests

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

      // Create a new client with FakeWebSocket that fails instantly and FakeTimer
      const failingClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        createInstantFailureWebSocketFactory(fakeTimer),
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

  describe("package events", function() {
    test("should upsert package on added event", async function() {
      const repo = new FakeInstalledAppsRepository();
      const timer = new FakeTimer();
      timer.enableAutoAdvance();
      const timestamp = timer.now();

      const { factory, getSocket } = createCapturingWebSocketFactory(timer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        timer,
        repo
      );

      try {
        await testClient.ensureConnected();
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        socket!.simulateMessage(JSON.stringify({
          type: "package_event",
          timestamp,
          event: {
            action: "added",
            packageName: "com.example.new",
            userId: 0,
            isSystem: false
          }
        }));

        await flushPromises();

        const rows = await repo.listInstalledApps(testDevice.deviceId);
        expect(rows).toHaveLength(1);
        expect(rows[0].package_name).toBe("com.example.new");
        expect(rows[0].user_id).toBe(0);
        expect(rows[0].is_system).toBe(0);
        expect(rows[0].last_verified_at).toBe(timestamp);
      } finally {
        await testClient.close();
      }
    });

    test("should remove package for a single user on removed event", async function() {
      const repo = new FakeInstalledAppsRepository();
      const timer = new FakeTimer();
      timer.enableAutoAdvance();
      const baseTime = timer.now();

      await repo.replaceInstalledApps(testDevice.deviceId, [
        {
          device_id: testDevice.deviceId,
          user_id: 0,
          package_name: "com.example.remove",
          is_system: 0,
          installed_at: baseTime,
          last_verified_at: baseTime
        },
        {
          device_id: testDevice.deviceId,
          user_id: 10,
          package_name: "com.example.remove",
          is_system: 0,
          installed_at: baseTime,
          last_verified_at: baseTime
        }
      ]);

      const { factory, getSocket } = createCapturingWebSocketFactory(timer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        timer,
        repo
      );

      try {
        await testClient.ensureConnected();
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        socket!.simulateMessage(JSON.stringify({
          type: "package_event",
          timestamp: timer.now(),
          event: {
            action: "removed",
            packageName: "com.example.remove",
            userId: 0
          }
        }));

        await flushPromises();

        const rows = await repo.listInstalledApps(testDevice.deviceId);
        expect(rows.some(row => row.user_id === 0)).toBe(false);
        expect(rows.some(row => row.user_id === 10)).toBe(true);
      } finally {
        await testClient.close();
      }
    });

    test("should remove package for all users when removedForAllUsers is true", async function() {
      const repo = new FakeInstalledAppsRepository();
      const timer = new FakeTimer();
      timer.enableAutoAdvance();
      const baseTime = timer.now();

      await repo.replaceInstalledApps(testDevice.deviceId, [
        {
          device_id: testDevice.deviceId,
          user_id: 0,
          package_name: "com.example.all",
          is_system: 0,
          installed_at: baseTime,
          last_verified_at: baseTime
        },
        {
          device_id: testDevice.deviceId,
          user_id: 10,
          package_name: "com.example.all",
          is_system: 0,
          installed_at: baseTime,
          last_verified_at: baseTime
        }
      ]);

      const { factory, getSocket } = createCapturingWebSocketFactory(timer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        timer,
        repo
      );

      try {
        await testClient.ensureConnected();
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);

        socket!.simulateMessage(JSON.stringify({
          type: "package_event",
          timestamp: timer.now(),
          event: {
            action: "removed",
            packageName: "com.example.all",
            userId: 0,
            removedForAllUsers: true
          }
        }));

        await flushPromises();

        const rows = await repo.listInstalledApps(testDevice.deviceId);
        expect(rows).toHaveLength(0);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("highlight requests", function() {
    test("requestAddHighlight sends payload and resolves highlight response", async function() {
      const highlightTimer = new FakeTimer();
      // Don't use autoAdvance - we need to control time for the request timeout

      const { factory, getSocket } = createCapturingWebSocketFactory(highlightTimer);
      const testClient = AccessibilityServiceClient.createForTesting(
        testDevice,
        fakeAdb,
        factory,
        highlightTimer
      );

      const shape: HighlightShape = {
        type: "box",
        bounds: {
          x: 10,
          y: 20,
          width: 100,
          height: 80
        },
        style: {
          strokeColor: "#FF0000",
          strokeWidth: 4
        }
      };

      try {
        // Start the request (don't await yet)
        const requestPromise = testClient.requestAddHighlight("highlight-1", shape, 2000);

        // Wait for socket to be created and open
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket);

        // Verify the request payload was sent
        expect(socket!.sentMessages.length).toBeGreaterThan(0);
        const payload = JSON.parse(socket!.sentMessages[0]);
        expect(payload.type).toBe("add_highlight");
        expect(payload.id).toBe("highlight-1");
        expect(payload.shape.bounds.width).toBe(100);

        // Simulate the response from the server
        socket!.simulateMessage(JSON.stringify({
          type: "highlight_response",
          requestId: payload.requestId,
          success: true,
          error: null
        }));

        // Advance time to process the response
        const result = await highlightTimer.resolvePromise(requestPromise);
        expect(result.success).toBe(true);
      } finally {
        await testClient.close();
      }
    });

  });
});
