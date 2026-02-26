import { beforeEach, describe, expect, test } from "bun:test";
import { CtrlProxyClient } from "../../../../src/features/observe/ios";
import type { BootedDevice } from "../../../../src/models";
import {
  FakeWebSocket,
  createInstantFailureWebSocketFactory,
  WebSocketState,
} from "../../../fakes/FakeWebSocket";
import { FakeTimer } from "../../../fakes/FakeTimer";

describe("CtrlProxyVoiceOver", function() {
  let testDevice: BootedDevice;
  let fakeTimer: FakeTimer;
  const serverPort = 8765;

  beforeEach(function() {
    fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();

    testDevice = {
      deviceId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
      platform: "ios",
      name: "iPhone 16 Simulator",
    };

    CtrlProxyClient.resetInstances();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  class CapturingWebSocket extends FakeWebSocket {
    sentMessages: string[] = [];

    send(data: unknown): void {
      this.sentMessages.push(String(data));
      super.send(data);
    }
  }

  const createCapturingFactory = (
    timer?: FakeTimer
  ): { factory: (url: string) => CapturingWebSocket; getSocket: () => CapturingWebSocket | null } => {
    let socket: CapturingWebSocket | null = null;
    return {
      factory: (url: string) => {
        socket = new CapturingWebSocket(url, "none", 0, timer);
        return socket;
      },
      getSocket: () => socket,
    };
  };

  const waitForSocket = async (
    getSocket: () => CapturingWebSocket | null
  ): Promise<CapturingWebSocket | null> => {
    for (let i = 0; i < 5; i++) {
      const s = getSocket();
      if (s) {return s;}
      await new Promise(r => setImmediate(r));
    }
    return getSocket();
  };

  const waitForSocketOpen = async (socket: FakeWebSocket | null): Promise<void> => {
    if (!socket || socket.readyState === WebSocketState.OPEN) {return;}
    await new Promise<void>(resolve => socket.once("open", () => resolve()));
  };

  const waitForSentMessages = async (
    socket: CapturingWebSocket | null,
    minCount = 1
  ): Promise<void> => {
    if (!socket) {return;}
    for (let i = 0; i < 10; i++) {
      if (socket.sentMessages.length >= minCount) {return;}
      await new Promise(r => setImmediate(r));
    }
  };

  // ---------------------------------------------------------------------------
  // Tests
  // ---------------------------------------------------------------------------

  describe("requestVoiceOverState", function() {
    test("returns enabled=true when VoiceOver is running", async function() {
      const { factory, getSocket } = createCapturingFactory(fakeTimer);
      const client = CtrlProxyClient.createForTesting(testDevice, serverPort, factory, fakeTimer);

      try {
        const resultPromise = client.requestVoiceOverState();
        const socket = await waitForSocket(getSocket);
        expect(socket).not.toBeNull();
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMsg = JSON.parse(socket!.sentMessages[0]);
        expect(sentMsg.type).toBe("get_voiceover_state");
        expect(typeof sentMsg.requestId).toBe("string");

        socket!.simulateMessage(JSON.stringify({
          type: "voiceover_state_result",
          requestId: sentMsg.requestId,
          success: true,
          enabled: true,
          totalTimeMs: 2,
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.enabled).toBe(true);
      } finally {
        await client.close();
      }
    });

    test("returns enabled=false when VoiceOver is not running", async function() {
      const { factory, getSocket } = createCapturingFactory(fakeTimer);
      const client = CtrlProxyClient.createForTesting(testDevice, serverPort, factory, fakeTimer);

      try {
        const resultPromise = client.requestVoiceOverState();
        const socket = await waitForSocket(getSocket);
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMsg = JSON.parse(socket!.sentMessages[0]);

        socket!.simulateMessage(JSON.stringify({
          type: "voiceover_state_result",
          requestId: sentMsg.requestId,
          success: true,
          enabled: false,
          totalTimeMs: 1,
        }));

        const result = await resultPromise;
        expect(result.success).toBe(true);
        expect(result.enabled).toBe(false);
      } finally {
        await client.close();
      }
    });

    test("returns success=false and enabled=false when not connected", async function() {
      const client = CtrlProxyClient.createForTesting(
        testDevice,
        serverPort,
        createInstantFailureWebSocketFactory(fakeTimer),
        fakeTimer
      );

      try {
        const result = await client.requestVoiceOverState();
        expect(result.success).toBe(false);
        expect(result.enabled).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        await client.close();
      }
    });

    test("sends correct message type get_voiceover_state", async function() {
      const { factory, getSocket } = createCapturingFactory(fakeTimer);
      const client = CtrlProxyClient.createForTesting(testDevice, serverPort, factory, fakeTimer);

      try {
        const resultPromise = client.requestVoiceOverState();
        const socket = await waitForSocket(getSocket);
        await waitForSocketOpen(socket);
        await waitForSentMessages(socket, 1);

        const sentMsg = JSON.parse(socket!.sentMessages[0]);
        expect(sentMsg.type).toBe("get_voiceover_state");

        // Resolve the pending request to avoid leaking
        socket!.simulateMessage(JSON.stringify({
          type: "voiceover_state_result",
          requestId: sentMsg.requestId,
          success: true,
          enabled: false,
        }));

        await resultPromise;
      } finally {
        await client.close();
      }
    });
  });
});
