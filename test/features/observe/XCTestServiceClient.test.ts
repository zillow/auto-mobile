import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { XCTestServiceClient, XCTestHierarchy } from "../../../src/features/observe/XCTestServiceClient";
import { BootedDevice } from "../../../src/models";
import {
  FakeWebSocket,
  createInstantFailureWebSocketFactory,
  createSuccessWebSocketFactory,
  WebSocketState
} from "../../fakes/FakeWebSocket";
import { defaultTimer } from "../../../src/utils/SystemTimer";

describe("XCTestServiceClient", function() {
  let xcTestServiceClient: XCTestServiceClient;
  let testDevice: BootedDevice;
  let fakeTimer = defaultTimer;
  const serverPort: number = 8765;

  beforeEach(function() {
    // Create fake timer
    fakeTimer = defaultTimer;

    // Create test device (iOS simulator format)
    testDevice = {
      deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
      platform: "ios",
      name: "iPhone 16 Simulator"
    };

    // Reset singleton instances for clean test state
    XCTestServiceClient.resetInstances();

    xcTestServiceClient = XCTestServiceClient.createForTesting(
      testDevice,
      serverPort,
      createSuccessWebSocketFactory(fakeTimer),
      fakeTimer
    );
  });

  afterEach(async function() {
    // Clean up WebSocket connections
    if (xcTestServiceClient) {
      await xcTestServiceClient.close();
    }
  });

  class CapturingWebSocket extends FakeWebSocket {
    sentMessages: string[] = [];

    send(data: unknown): void {
      this.sentMessages.push(String(data));
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
      const mockHierarchyData: XCTestHierarchy = {
        updatedAt: 1750934583218,
        packageName: "com.apple.mobilesafari",
        hierarchy: {
          text: "Welcome",
          contentDesc: "Welcome to Safari",
          resourceId: "safari_welcome",
          bounds: {
            left: 0,
            top: 100,
            right: 390,
            bottom: 200
          },
          clickable: "true",
          enabled: "true"
        }
      };

      // Use delayed mode with 1ms for fast execution
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        // Parse sent message to get requestId
        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_hierarchy_if_stale");

        // Respond with matching requestId
        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          requestId: sentMessage.requestId,
          timestamp: Date.now(),
          data: mockHierarchyData
        }));

        const result = await resultPromise;

        expect(result).not.toBeNull();
        expect(result.hierarchy).not.toBeNull();
        expect(result.fresh).toBe(true);
        expect(result.updatedAt).toBe(1750934583218);
        expect(result.hierarchy!.updatedAt).toBe(1750934583218);
        expect(result.hierarchy!.packageName).toBe("com.apple.mobilesafari");
        expect(result.hierarchy!.hierarchy.text).toBe("Welcome");
      } finally {
        await testClient.close();
      }
    });

    test("should return null hierarchy when not connected", async function() {
      const testTimer = defaultTimer;

      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        createInstantFailureWebSocketFactory(testTimer),
        testTimer
      );

      try {
        const result = await testClient.getLatestHierarchy(false, 100);

        expect(result.hierarchy).toBeNull();
        expect(result.fresh).toBe(false);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("requestSwipe", function() {
    test("should send swipe request and return result", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.requestSwipe(100, 200, 100, 500, 300, 5000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        // Parse sent message to get requestId
        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_swipe");
        expect(sentMessage.x1).toBe(100);
        expect(sentMessage.y1).toBe(200);
        expect(sentMessage.x2).toBe(100);
        expect(sentMessage.y2).toBe(500);
        expect(sentMessage.duration).toBe(300);

        // Simulate response
        socket!.simulateMessage(JSON.stringify({
          type: "swipe_result",
          requestId: sentMessage.requestId,
          success: true,
          totalTimeMs: 320
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.totalTimeMs).toBe(320);
      } finally {
        await testClient.close();
      }
    });

    test("should return error when not connected", async function() {
      const testTimer = defaultTimer;

      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        createInstantFailureWebSocketFactory(testTimer),
        testTimer
      );

      try {
        const result = await testClient.requestSwipe(100, 200, 100, 500, 300, 100);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Not connected");
      } finally {
        await testClient.close();
      }
    });
  });

  describe("requestTapCoordinates", function() {
    test("should send tap request and return result", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.requestTapCoordinates(150, 300, 0, 5000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_tap_coordinates");
        expect(sentMessage.x).toBe(150);
        expect(sentMessage.y).toBe(300);

        socket!.simulateMessage(JSON.stringify({
          type: "tap_coordinates_result",
          requestId: sentMessage.requestId,
          success: true,
          totalTimeMs: 50
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.totalTimeMs).toBe(50);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("requestSetText", function() {
    test("should send setText request and return result", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.requestSetText("Hello World", "text_field_1", 5000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_set_text");
        expect(sentMessage.text).toBe("Hello World");
        expect(sentMessage.resourceId).toBe("text_field_1");

        socket!.simulateMessage(JSON.stringify({
          type: "set_text_result",
          requestId: sentMessage.requestId,
          success: true,
          totalTimeMs: 100
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("requestScreenshot", function() {
    test("should send screenshot request and return base64 data", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.requestScreenshot(5000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_screenshot");

        const fakeBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        socket!.simulateMessage(JSON.stringify({
          type: "screenshot",
          requestId: sentMessage.requestId,
          data: fakeBase64,
          format: "png",
          timestamp: Date.now()
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.data).toBe(fakeBase64);
        expect(result.format).toBe("png");
      } finally {
        await testClient.close();
      }
    });
  });

  describe("requestImeAction", function() {
    test("should send imeAction request and return result", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.requestImeAction("done", 5000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_ime_action");
        expect(sentMessage.action).toBe("done");

        socket!.simulateMessage(JSON.stringify({
          type: "ime_action_result",
          requestId: sentMessage.requestId,
          action: "done",
          success: true,
          totalTimeMs: 50
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.action).toBe("done");
      } finally {
        await testClient.close();
      }
    });
  });

  describe("requestLaunchApp", function() {
    test("should send launch app request and return result", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        const resultPromise = testClient.requestLaunchApp("com.apple.Preferences", 5000);
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMessage = JSON.parse(socket!.sentMessages[0]);
        expect(sentMessage.type).toBe("request_launch_app");
        expect(sentMessage.bundleId).toBe("com.apple.Preferences");

        socket!.simulateMessage(JSON.stringify({
          type: "launch_app_result",
          requestId: sentMessage.requestId,
          success: true,
          totalTimeMs: 120
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.totalTimeMs).toBe(120);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("connection management", function() {
    test("isConnected should return true when WebSocket is open", async function() {
      const testTimer = defaultTimer;

      const { factory } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        // Initially not connected
        expect(testClient.isConnected()).toBe(false);

        // Connect
        await testClient.ensureConnected();
        await flushPromises();

        expect(testClient.isConnected()).toBe(true);
      } finally {
        await testClient.close();
      }
    });

    test("isConnected should return false after close", async function() {
      const testTimer = defaultTimer;

      const { factory } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      await testClient.ensureConnected();
      await flushPromises();
      expect(testClient.isConnected()).toBe(true);

      await testClient.close();
      await flushPromises();

      expect(testClient.isConnected()).toBe(false);
    });
  });

  describe("caching", function() {
    test("hasCachedHierarchy should return true after receiving hierarchy", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        expect(testClient.hasCachedHierarchy()).toBe(false);

        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        const socket = await waitForSocket(getSocket);
        await waitForSocketOpen(socket);

        const mockHierarchy: XCTestHierarchy = {
          updatedAt: Date.now(),
          packageName: "com.test.app",
          hierarchy: { text: "Test" }
        };

        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          data: mockHierarchy
        }));

        await resultPromise;
        expect(testClient.hasCachedHierarchy()).toBe(true);
      } finally {
        await testClient.close();
      }
    });

    test("invalidateCache should mark cache as not fresh", async function() {
      const testTimer = defaultTimer;

      const { factory, getSocket } = createCapturingWebSocketFactory(testTimer);
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        factory,
        testTimer
      );

      try {
        // Get hierarchy to populate cache
        const resultPromise = testClient.getLatestHierarchy(true, 2000);
        const socket = await waitForSocket(getSocket);
        await waitForSocketOpen(socket);

        const mockHierarchy: XCTestHierarchy = {
          updatedAt: Date.now(),
          packageName: "com.test.app",
          hierarchy: { text: "Test" }
        };

        socket!.simulateMessage(JSON.stringify({
          type: "hierarchy_update",
          data: mockHierarchy
        }));

        await resultPromise;
        expect(testClient.hasCachedHierarchy()).toBe(true);

        // Invalidate cache
        testClient.invalidateCache();

        // Cache still exists but is marked as stale
        expect(testClient.hasCachedHierarchy()).toBe(true);
      } finally {
        await testClient.close();
      }
    });
  });

  describe("convertToViewHierarchyResult", function() {
    test("should convert XCTestHierarchy to ViewHierarchyResult format", async function() {
      const testTimer = defaultTimer;
      const testClient = XCTestServiceClient.createForTesting(
        testDevice,
        serverPort,
        createSuccessWebSocketFactory(testTimer),
        testTimer
      );

      try {
        const xcTestHierarchy: XCTestHierarchy = {
          updatedAt: 1234567890,
          packageName: "com.apple.test",
          hierarchy: {
            text: "Button",
            contentDesc: "Submit button",
            resourceId: "submit_btn",
            className: "UIButton",
            bounds: { left: 10, top: 20, right: 100, bottom: 60 },
            clickable: "true",
            enabled: "true",
            node: [
              {
                text: "Label",
                className: "UILabel"
              }
            ]
          }
        };

        const result = testClient.convertToViewHierarchyResult(xcTestHierarchy);

        expect(result.packageName).toBe("com.apple.test");
        expect(result.updatedAt).toBe(1234567890);
        expect(result.hierarchy).toBeDefined();
        expect(result.hierarchy.node.$["text"]).toBe("Button");
        expect(result.hierarchy.node.$["content-desc"]).toBe("Submit button");
        expect(result.hierarchy.node.$["resource-id"]).toBe("submit_btn");
        expect(result.hierarchy.node.$["class"]).toBe("UIButton");
        expect(result.hierarchy.node.$["bounds"]).toBe("[10,20][100,60]");
        expect(result.hierarchy.node.$["clickable"]).toBe("true");
      } finally {
        await testClient.close();
      }
    });
  });
});
