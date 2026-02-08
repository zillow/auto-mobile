import { describe, it, expect } from "bun:test";
import { SharedGestureDelegate } from "../../../../src/features/observe/shared/SharedGestureDelegate";
import type { DelegateContext } from "../../../../src/features/observe/shared/types";
import { FakeTimer } from "../../../fakes/FakeTimer";
import { RequestManager } from "../../../../src/utils/RequestManager";

function createFakeContext(overrides?: Partial<DelegateContext>): {
  context: DelegateContext;
  sent: string[];
  cancelCalls: () => number;
} {
  const timer = new FakeTimer();
  timer.enableAutoAdvance();
  let cancelCount = 0;
  const sent: string[] = [];
  const context: DelegateContext = {
    getWebSocket: () => ({
      send: (data: string) => { sent.push(data); },
      readyState: 1,
    } as any),
    requestManager: new RequestManager(timer),
    timer,
    ensureConnected: async () => true,
    cancelScreenshotBackoff: () => { cancelCount++; },
    ...overrides,
  };
  return { context, sent, cancelCalls: () => cancelCount };
}

/** Helper: call a gesture method, let the microtask complete, then resolve the request */
async function callAndResolve<T>(
  sent: string[],
  requestManager: RequestManager,
  action: () => Promise<T>,
  result: unknown = { success: true, totalTimeMs: 1 }
): Promise<{ result: T; sentMsg: Record<string, unknown> }> {
  const promise = action();
  // Let async ensureConnected resolve so the message gets sent
  await Promise.resolve();
  await Promise.resolve();
  const sentMsg = JSON.parse(sent[sent.length - 1]);
  requestManager.resolve(sentMsg.requestId as string, result);
  const r = await promise;
  return { result: r, sentMsg };
}

describe("SharedGestureDelegate", () => {
  describe("coordinate rounding", () => {
    it("rounds coordinates when configured", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: true });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestTapCoordinates(10.7, 20.3)
      );

      expect(sentMsg.x).toBe(11);
      expect(sentMsg.y).toBe(20);
    });

    it("passes exact coordinates when rounding disabled", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestTapCoordinates(10.7, 20.3)
      );

      expect(sentMsg.x).toBe(10.7);
      expect(sentMsg.y).toBe(20.3);
    });

    it("rounds swipe coordinates", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: true });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestSwipe(1.1, 2.2, 3.7, 4.9)
      );

      expect(sentMsg.x1).toBe(1);
      expect(sentMsg.y1).toBe(2);
      expect(sentMsg.x2).toBe(4);
      expect(sentMsg.y2).toBe(5);
    });

    it("rounds pinch coordinates", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: true });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestPinch(50.1, 50.9, 100.3, 200.7, 0)
      );

      expect(sentMsg.centerX).toBe(50);
      expect(sentMsg.centerY).toBe(51);
      expect(sentMsg.distanceStart).toBe(100);
      expect(sentMsg.distanceEnd).toBe(201);
    });
  });

  describe("cancelScreenshotBackoff", () => {
    it("cancels on every gesture type", async () => {
      const { context, sent, cancelCalls } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      await callAndResolve(sent, context.requestManager, () => delegate.requestTapCoordinates(10, 20));
      expect(cancelCalls()).toBe(1);

      await callAndResolve(sent, context.requestManager, () => delegate.requestSwipe(0, 0, 100, 100));
      expect(cancelCalls()).toBe(2);

      await callAndResolve(sent, context.requestManager, () => delegate.requestDrag(0, 0, 100, 100, 200, 300, 100, 5000));
      expect(cancelCalls()).toBe(3);

      await callAndResolve(sent, context.requestManager, () => delegate.requestPinch(50, 50, 100, 200, 0));
      expect(cancelCalls()).toBe(4);
    });
  });

  describe("message format", () => {
    it("sends correct tap message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestTapCoordinates(10, 20, 50)
      );

      expect(sentMsg.type).toBe("request_tap_coordinates");
      expect(sentMsg.x).toBe(10);
      expect(sentMsg.y).toBe(20);
      expect(sentMsg.duration).toBe(50);
      expect(sentMsg.requestId).toBeDefined();
    });

    it("sends correct swipe message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestSwipe(10, 20, 30, 40, 500)
      );

      expect(sentMsg.type).toBe("request_swipe");
      expect(sentMsg.x1).toBe(10);
      expect(sentMsg.y1).toBe(20);
      expect(sentMsg.x2).toBe(30);
      expect(sentMsg.y2).toBe(40);
      expect(sentMsg.duration).toBe(500);
    });

    it("sends correct drag message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestDrag(10, 20, 30, 40, 100, 200, 50, 5000)
      );

      expect(sentMsg.type).toBe("request_drag");
      expect(sentMsg.pressDurationMs).toBe(100);
      expect(sentMsg.dragDurationMs).toBe(200);
      expect(sentMsg.holdDurationMs).toBe(50);
    });

    it("sends correct pinch message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestPinch(50, 60, 100, 200, 45, 500)
      );

      expect(sentMsg.type).toBe("request_pinch");
      expect(sentMsg.centerX).toBe(50);
      expect(sentMsg.centerY).toBe(60);
      expect(sentMsg.distanceStart).toBe(100);
      expect(sentMsg.distanceEnd).toBe(200);
      expect(sentMsg.rotationDegrees).toBe(45);
      expect(sentMsg.duration).toBe(500);
    });
  });

  describe("not connected", () => {
    it("returns error for all gestures when not connected", async () => {
      const { context, sent } = createFakeContext({ ensureConnected: async () => false });
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const tap = await delegate.requestTapCoordinates(10, 20);
      expect(tap.success).toBe(false);
      expect(tap.error).toBe("Not connected");

      const swipe = await delegate.requestSwipe(0, 0, 100, 100);
      expect(swipe.success).toBe(false);
      expect(swipe.error).toBe("Not connected");

      const drag = await delegate.requestDrag(0, 0, 100, 100, 200, 300, 100, 5000);
      expect(drag.success).toBe(false);
      expect(drag.error).toBe("Not connected");

      const pinch = await delegate.requestPinch(50, 50, 100, 200, 0);
      expect(pinch.success).toBe(false);
      expect(pinch.error).toBe("Not connected");

      expect(sent.length).toBe(0);
    });
  });

  describe("timeout handling", () => {
    it("times out when no response received", async () => {
      const timer = new FakeTimer();
      const requestManager = new RequestManager(timer);
      const { context } = createFakeContext({ timer, requestManager });
      const delegate = new SharedGestureDelegate(context, { logTag: "TEST", roundCoordinates: false });

      const promise = delegate.requestTapCoordinates(10, 20, 0, 100);

      // Let async ensureConnected resolve
      await Promise.resolve();
      await Promise.resolve();

      // Advance time past the timeout
      timer.advanceTime(101);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });
  });
});
