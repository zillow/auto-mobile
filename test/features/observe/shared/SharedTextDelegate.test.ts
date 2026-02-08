import { describe, it, expect } from "bun:test";
import { SharedTextDelegate } from "../../../../src/features/observe/shared/SharedTextDelegate";
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

async function callAndResolve<T>(
  sent: string[],
  requestManager: RequestManager,
  action: () => Promise<T>,
  result: unknown = { success: true, totalTimeMs: 1 }
): Promise<{ result: T; sentMsg: Record<string, unknown> }> {
  const promise = action();
  await Promise.resolve();
  await Promise.resolve();
  const sentMsg = JSON.parse(sent[sent.length - 1]);
  requestManager.resolve(sentMsg.requestId as string, result);
  const r = await promise;
  return { result: r, sentMsg };
}

describe("SharedTextDelegate", () => {
  describe("cancelScreenshotBackoff", () => {
    it("cancels on every text operation", async () => {
      const { context, sent, cancelCalls } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      await callAndResolve(sent, context.requestManager, () => delegate.requestSetText("hello"));
      expect(cancelCalls()).toBe(1);

      await callAndResolve(sent, context.requestManager, () =>
        delegate.requestImeAction("done"), { success: true, action: "done", totalTimeMs: 1 }
      );
      expect(cancelCalls()).toBe(2);

      await callAndResolve(sent, context.requestManager, () => delegate.requestSelectAll());
      expect(cancelCalls()).toBe(3);
    });
  });

  describe("message format", () => {
    it("sends correct setText message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestSetText("hello world")
      );

      expect(sentMsg.type).toBe("request_set_text");
      expect(sentMsg.text).toBe("hello world");
      expect(sentMsg.requestId).toBeDefined();
    });

    it("includes resourceId when provided", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestSetText("hello", "com.app:id/input")
      );

      expect(sentMsg.resourceId).toBe("com.app:id/input");
    });

    it("omits resourceId when not provided", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestSetText("hello")
      );

      expect(sentMsg.resourceId).toBeUndefined();
    });

    it("sends correct IME action message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestImeAction("next"), { success: true, action: "next", totalTimeMs: 1 }
      );

      expect(sentMsg.type).toBe("request_ime_action");
      expect(sentMsg.action).toBe("next");
    });

    it("sends correct selectAll message", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestSelectAll()
      );

      expect(sentMsg.type).toBe("request_select_all");
    });
  });

  describe("clearText", () => {
    it("delegates to requestSetText with empty string", async () => {
      const { context, sent } = createFakeContext();
      const delegate = new SharedTextDelegate(context);

      const { sentMsg } = await callAndResolve(sent, context.requestManager, () =>
        delegate.requestClearText()
      );

      expect(sentMsg.type).toBe("request_set_text");
      expect(sentMsg.text).toBe("");
    });
  });

  describe("not connected", () => {
    it("returns error for all text operations when not connected", async () => {
      const { context, sent } = createFakeContext({ ensureConnected: async () => false });
      const delegate = new SharedTextDelegate(context);

      const setText = await delegate.requestSetText("hello");
      expect(setText.success).toBe(false);
      expect(setText.error).toBe("Not connected");

      const imeAction = await delegate.requestImeAction("done");
      expect(imeAction.success).toBe(false);
      expect(imeAction.error).toBe("Not connected");
      expect(imeAction.action).toBe("done");

      const selectAll = await delegate.requestSelectAll();
      expect(selectAll.success).toBe(false);
      expect(selectAll.error).toBe("Not connected");

      expect(sent.length).toBe(0);
    });
  });

  describe("timeout handling", () => {
    it("times out when no response received", async () => {
      const timer = new FakeTimer();
      const requestManager = new RequestManager(timer);
      const { context } = createFakeContext({ timer, requestManager });
      const delegate = new SharedTextDelegate(context);

      const promise = delegate.requestSetText("hello", undefined, 100);

      await Promise.resolve();
      await Promise.resolve();

      timer.advanceTime(101);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });
  });
});
