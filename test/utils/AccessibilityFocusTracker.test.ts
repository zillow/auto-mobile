import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AccessibilityFocusTracker } from "../../src/utils/AccessibilityFocusTracker";
import { AccessibilityServiceClient } from "../../src/features/observe/AccessibilityServiceClient";
import type { CurrentFocusResult, Element, TraversalOrderResult } from "../../src/models";
import { FakeTimer } from "../fakes/FakeTimer";

describe("AccessibilityFocusTracker", () => {
  let tracker: AccessibilityFocusTracker;
  let fakeClient: FakeAccessibilityServiceClient;
  let getInstanceSpy: ReturnType<typeof spyOn> | null = null;
  let requestCurrentFocusSpy: ReturnType<typeof spyOn> | null = null;
  let requestTraversalOrderSpy: ReturnType<typeof spyOn> | null = null;
  let originalDateNow: typeof Date.now;
  let fakeTimer: FakeTimer;

  const deviceId = "test-device";

  const createElement = (overrides: Partial<Element> = {}): Element => {
    return {
      bounds: { left: 0, top: 0, right: 10, bottom: 10 },
      ...overrides
    } as Element;
  };

  const createFocusResult = (
    element: Element | null,
    overrides: Partial<CurrentFocusResult> = {}
  ): CurrentFocusResult => {
    return {
      focusedElement: element,
      totalTimeMs: 1,
      ...overrides
    };
  };

  const createTraversalResult = (
    elements: Element[],
    focusedIndex: number | null = null,
    overrides: Partial<TraversalOrderResult> = {}
  ): TraversalOrderResult => {
    return {
      elements,
      focusedIndex,
      totalCount: elements.length,
      totalTimeMs: 1,
      ...overrides
    };
  };

  interface FocusClient {
    requestCurrentFocus: (timeoutMs: number) => Promise<CurrentFocusResult>;
    requestTraversalOrder: (timeoutMs: number) => Promise<TraversalOrderResult>;
  }

  class FakeAccessibilityServiceClient implements FocusClient {
    async requestCurrentFocus(_timeoutMs: number): Promise<CurrentFocusResult> {
      return createFocusResult(null);
    }

    async requestTraversalOrder(_timeoutMs: number): Promise<TraversalOrderResult> {
      return createTraversalResult([]);
    }
  }

  beforeEach(() => {
    originalDateNow = Date.now;
    fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();
    Date.now = () => fakeTimer.now();

    tracker = AccessibilityFocusTracker.getInstance();
    tracker.invalidateAll(deviceId);

    fakeClient = new FakeAccessibilityServiceClient();

    requestCurrentFocusSpy = spyOn(fakeClient, "requestCurrentFocus");
    requestTraversalOrderSpy = spyOn(fakeClient, "requestTraversalOrder");

    getInstanceSpy = spyOn(AccessibilityServiceClient, "getInstance").mockReturnValue(
      fakeClient as AccessibilityServiceClient
    );
  });

  afterEach(() => {
    getInstanceSpy?.mockRestore();
    requestCurrentFocusSpy?.mockRestore();
    requestTraversalOrderSpy?.mockRestore();
    Date.now = originalDateNow;
  });

  describe("getCurrentFocus", () => {
    test("returns cached focus when cache is valid", async () => {
      const focusedElement = createElement({ resourceId: "com.test:id/primary" });
      requestCurrentFocusSpy!.mockResolvedValue(createFocusResult(focusedElement));

      const first = await tracker.getCurrentFocus(deviceId);
      const second = await tracker.getCurrentFocus(deviceId);

      expect(first).toBe(focusedElement);
      expect(second).toBe(focusedElement);
      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(1);
    });

    test("bypasses cache when useCache is false", async () => {
      const focusedElement = createElement({ resourceId: "com.test:id/primary" });
      requestCurrentFocusSpy!.mockResolvedValue(createFocusResult(focusedElement));

      await tracker.getCurrentFocus(deviceId, true);
      await tracker.getCurrentFocus(deviceId, false);

      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(2);
    });

    test("refreshes cache when TTL expires", async () => {
      const firstElement = createElement({ resourceId: "com.test:id/first" });
      const secondElement = createElement({ resourceId: "com.test:id/second" });
      requestCurrentFocusSpy!
        .mockResolvedValueOnce(createFocusResult(firstElement))
        .mockResolvedValueOnce(createFocusResult(secondElement));

      const first = await tracker.getCurrentFocus(deviceId);
      fakeTimer.advanceTime(4000);
      const cached = await tracker.getCurrentFocus(deviceId);
      fakeTimer.advanceTime(2000);
      const refreshed = await tracker.getCurrentFocus(deviceId);

      expect(first).toBe(firstElement);
      expect(cached).toBe(firstElement);
      expect(refreshed).toBe(secondElement);
      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(2);
    });

    test("caches null focus and avoids re-query", async () => {
      requestCurrentFocusSpy!.mockResolvedValue(createFocusResult(null));

      const first = await tracker.getCurrentFocus(deviceId);
      const second = await tracker.getCurrentFocus(deviceId);

      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(1);
    });

    test("returns null on error without caching", async () => {
      requestCurrentFocusSpy!.mockResolvedValue(
        createFocusResult(null, { error: "Focus unavailable" })
      );

      const first = await tracker.getCurrentFocus(deviceId);
      const second = await tracker.getCurrentFocus(deviceId);

      expect(first).toBeNull();
      expect(second).toBeNull();
      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("buildTraversalOrder", () => {
    test("returns cached traversal order when cache is valid", async () => {
      const elements = [
        createElement({ resourceId: "com.test:id/root", depth: 0 }),
        createElement({ resourceId: "com.test:id/child", depth: 1 }),
        createElement({ resourceId: "com.test:id/sibling", depth: 0 })
      ];
      requestTraversalOrderSpy!.mockResolvedValue(createTraversalResult(elements, 1));

      const first = await tracker.buildTraversalOrder(deviceId);
      const second = await tracker.buildTraversalOrder(deviceId);

      expect(first).toBe(elements);
      expect(second).toBe(elements);
      expect(requestTraversalOrderSpy).toHaveBeenCalledTimes(1);
    });

    test("refreshes traversal order when TTL expires", async () => {
      const firstOrder = [createElement({ resourceId: "com.test:id/first" })];
      const secondOrder = [createElement({ resourceId: "com.test:id/second" })];
      requestTraversalOrderSpy!
        .mockResolvedValueOnce(createTraversalResult(firstOrder, 0))
        .mockResolvedValueOnce(createTraversalResult(secondOrder, 0));

      const initial = await tracker.buildTraversalOrder(deviceId);
      fakeTimer.advanceTime(4000);
      const cached = await tracker.buildTraversalOrder(deviceId);
      fakeTimer.advanceTime(2000);
      const refreshed = await tracker.buildTraversalOrder(deviceId);

      expect(initial).toBe(firstOrder);
      expect(cached).toBe(firstOrder);
      expect(refreshed).toBe(secondOrder);
      expect(requestTraversalOrderSpy).toHaveBeenCalledTimes(2);
    });

    test("returns empty list on error and does not cache", async () => {
      requestTraversalOrderSpy!.mockResolvedValue(
        createTraversalResult([], null, { error: "Traversal failed" })
      );

      const first = await tracker.buildTraversalOrder(deviceId);
      const second = await tracker.buildTraversalOrder(deviceId);

      expect(first).toEqual([]);
      expect(second).toEqual([]);
      expect(requestTraversalOrderSpy).toHaveBeenCalledTimes(2);
    });

    test("handles empty hierarchy without error", async () => {
      requestTraversalOrderSpy!.mockResolvedValue(createTraversalResult([], null));

      const first = await tracker.buildTraversalOrder(deviceId);
      const second = await tracker.buildTraversalOrder(deviceId);

      expect(first).toEqual([]);
      expect(second).toEqual([]);
      expect(requestTraversalOrderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("findElementIndex", () => {
    test("returns null for empty traversal order", async () => {
      const index = await tracker.findElementIndex({ resourceId: "missing" }, []);
      expect(index).toBeNull();
    });

    test("matches by resourceId", async () => {
      const elements = [
        createElement({ resourceId: "com.test:id/alpha" }),
        createElement({ resourceId: "com.test:id/beta" })
      ];

      const index = await tracker.findElementIndex({ resourceId: "com.test:id/beta" }, elements);
      expect(index).toBe(1);
    });

    test("matches by text", async () => {
      const elements = [
        createElement({ text: "Settings" }),
        createElement({ text: "Profile" })
      ];

      const index = await tracker.findElementIndex({ text: "Profile" }, elements);
      expect(index).toBe(1);
    });

    test("matches by contentDesc", async () => {
      const elements = [
        createElement({ contentDesc: "Back" }),
        createElement({ contentDesc: "Forward" })
      ];

      const index = await tracker.findElementIndex({ contentDesc: "Forward" }, elements);
      expect(index).toBe(1);
    });

    test("matches by testTag", async () => {
      const elements = [
        createElement({ testTag: "primary-button" }),
        createElement({ testTag: "secondary-button" })
      ];

      const index = await tracker.findElementIndex({ testTag: "secondary-button" }, elements);
      expect(index).toBe(1);
    });

    test("prefers visible match when multiple elements match", async () => {
      const invisible = createElement({
        resourceId: "com.test:id/duplicate",
        bounds: { left: 0, top: 0, right: 0, bottom: 10 }
      });
      const visible = createElement({
        resourceId: "com.test:id/duplicate",
        bounds: { left: 0, top: 0, right: 10, bottom: 10 }
      });
      const elements = [invisible, visible];

      const index = await tracker.findElementIndex({ resourceId: "com.test:id/duplicate" }, elements);
      expect(index).toBe(1);
    });

    test("returns null when no elements match", async () => {
      const elements = [
        createElement({ resourceId: "com.test:id/alpha" }),
        createElement({ resourceId: "com.test:id/beta" })
      ];

      const index = await tracker.findElementIndex({ resourceId: "com.test:id/missing" }, elements);
      expect(index).toBeNull();
    });
  });

  describe("cache invalidation", () => {
    test("invalidateFocus clears focus cache", async () => {
      const firstElement = createElement({ resourceId: "com.test:id/first" });
      const secondElement = createElement({ resourceId: "com.test:id/second" });
      requestCurrentFocusSpy!
        .mockResolvedValueOnce(createFocusResult(firstElement))
        .mockResolvedValueOnce(createFocusResult(secondElement));

      await tracker.getCurrentFocus(deviceId);
      tracker.invalidateFocus(deviceId);
      const refreshed = await tracker.getCurrentFocus(deviceId);

      expect(refreshed).toBe(secondElement);
      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(2);
    });

    test("invalidateTraversalOrder clears traversal cache", async () => {
      const firstOrder = [createElement({ resourceId: "com.test:id/first" })];
      const secondOrder = [createElement({ resourceId: "com.test:id/second" })];
      requestTraversalOrderSpy!
        .mockResolvedValueOnce(createTraversalResult(firstOrder, 0))
        .mockResolvedValueOnce(createTraversalResult(secondOrder, 0));

      await tracker.buildTraversalOrder(deviceId);
      tracker.invalidateTraversalOrder(deviceId);
      const refreshed = await tracker.buildTraversalOrder(deviceId);

      expect(refreshed).toBe(secondOrder);
      expect(requestTraversalOrderSpy).toHaveBeenCalledTimes(2);
    });

    test("invalidateAll clears both caches", async () => {
      const focusFirst = createElement({ resourceId: "com.test:id/first-focus" });
      const focusSecond = createElement({ resourceId: "com.test:id/second-focus" });
      const orderFirst = [createElement({ resourceId: "com.test:id/first-order" })];
      const orderSecond = [createElement({ resourceId: "com.test:id/second-order" })];

      requestCurrentFocusSpy!
        .mockResolvedValueOnce(createFocusResult(focusFirst))
        .mockResolvedValueOnce(createFocusResult(focusSecond));
      requestTraversalOrderSpy!
        .mockResolvedValueOnce(createTraversalResult(orderFirst, 0))
        .mockResolvedValueOnce(createTraversalResult(orderSecond, 0));

      await tracker.getCurrentFocus(deviceId);
      await tracker.buildTraversalOrder(deviceId);
      tracker.invalidateAll(deviceId);

      const refreshedFocus = await tracker.getCurrentFocus(deviceId);
      const refreshedOrder = await tracker.buildTraversalOrder(deviceId);

      expect(refreshedFocus).toBe(focusSecond);
      expect(refreshedOrder).toBe(orderSecond);
      expect(requestCurrentFocusSpy).toHaveBeenCalledTimes(2);
      expect(requestTraversalOrderSpy).toHaveBeenCalledTimes(2);
    });
  });
});
