import { beforeEach, describe, expect, test } from "bun:test";
import { ScrollUntilVisible } from "../../../../src/features/action/swipeon/ScrollUntilVisible";
import { FakeAccessibilityDetector } from "../../../fakes/FakeAccessibilityDetector";
import { FakeElementFinder } from "../../../fakes/FakeElementFinder";
import { FakeTimer } from "../../../fakes/FakeTimer";
import { FakeTalkBackSwipeExecutor } from "../../../fakes/FakeTalkBackSwipeExecutor";
import { FakeOverlayDetector } from "../../../fakes/FakeOverlayDetector";
import { FakeScrollAccessibilityService } from "../../../fakes/FakeScrollAccessibilityService";
import { FakeElementGeometry } from "../../../fakes/FakeElementGeometry";
import type { BootedDevice, Element, ObserveResult } from "../../../../src/models";
import type { SwipeOnResolvedOptions } from "../../../../src/features/action/swipeon/types";

const DEVICE: BootedDevice = {
  name: "test-device",
  platform: "android",
  deviceId: "device-1"
};

const SCREEN_SIZE = { width: 400, height: 900 };

const makeObserveResult = (hierarchyId: number = 0): ObserveResult => ({
  timestamp: 0,
  screenSize: SCREEN_SIZE,
  systemInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  viewHierarchy: {
    hierarchy: { node: { $: { _id: String(hierarchyId) } } }
  }
});

const CONTAINER_ELEMENT: Element = {
  "bounds": { left: 0, top: 0, right: 400, bottom: 900 },
  "resource-id": "test:id/list",
  "scrollable": true
} as unknown as Element;

const TARGET_ELEMENT: Element = {
  "bounds": { left: 10, top: 200, right: 390, bottom: 250 },
  "resource-id": "test:id/target",
  "text": "Target Item",
  "scrollable": false
} as unknown as Element;

function makeScrollUntilVisible({
  accessibilityDetector,
  finder,
  timer,
  accessibilityService,
  observeResults,
  talkBackExecutor
}: {
  accessibilityDetector: FakeAccessibilityDetector;
  finder: FakeElementFinder;
  timer: FakeTimer;
  accessibilityService: FakeScrollAccessibilityService;
  observeResults: ObserveResult[];
  talkBackExecutor: FakeTalkBackSwipeExecutor;
}): ScrollUntilVisible {
  let callIdx = 0;

  const fakeObserveScreen = {
    execute: async () => observeResults[Math.min(callIdx, observeResults.length - 1)],
    getMostRecentCachedObserveResult: async () =>
      observeResults[Math.min(callIdx, observeResults.length - 1)]
  };

  const fakeGeometry = new FakeElementGeometry();

  const fakeOverlayDetector = new FakeOverlayDetector();

  // Each observedInteraction call advances to the next observation
  const observedInteraction = async (action: (obs: ObserveResult) => Promise<any>, _opts: any) => {
    const obs = observeResults[Math.min(callIdx, observeResults.length - 1)];
    const result = await action(obs);
    callIdx++;
    const nextObs = observeResults[Math.min(callIdx, observeResults.length - 1)];
    return { ...result, observation: nextObs };
  };

  return new ScrollUntilVisible({
    device: DEVICE,
    finder: finder as any,
    geometry: fakeGeometry,
    observeScreen: fakeObserveScreen as any,
    accessibilityService,
    accessibilityDetector,
    overlayDetector: fakeOverlayDetector,
    talkBackExecutor,
    timer,
    getDuration: () => 300,
    resolveBoomerangConfig: () => undefined,
    buildPredictionArgs: () => ({}),
    observedInteraction
  });
}

const BASE_OPTIONS: SwipeOnResolvedOptions = {
  direction: "up",
  lookFor: { text: "Target Item" }
};

describe("ScrollUntilVisible TalkBack focus behavior", () => {
  let detector: FakeAccessibilityDetector;
  let finder: FakeElementFinder;
  let timer: FakeTimer;
  let accessibilityService: FakeScrollAccessibilityService;
  let talkBackExecutor: FakeTalkBackSwipeExecutor;

  beforeEach(() => {
    detector = new FakeAccessibilityDetector();
    finder = new FakeElementFinder();
    timer = new FakeTimer();
    timer.enableAutoAdvance();
    accessibilityService = new FakeScrollAccessibilityService();
    talkBackExecutor = new FakeTalkBackSwipeExecutor();
  });

  describe("when TalkBack is disabled", () => {
    beforeEach(() => {
      detector.setTalkBackEnabled(false);
    });

    test("does not call requestAction(focus) even with focusTarget:true when element already visible", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      finder.nextElementByText = TARGET_ELEMENT;

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0)],
        talkBackExecutor
      });

      const result = await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(accessibilityService.requestActionCalls).toHaveLength(0);
    });

    test("does not call requestAction(focus) when element found after scrolling", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      let findCount = 0;
      finder.findElementByText = (_h: any, _t: any) => {
        findCount++;
        return findCount > 1 ? TARGET_ELEMENT : null;
      };

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0), makeObserveResult(1), makeObserveResult(2)],
        talkBackExecutor
      });

      const result = await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(result.success).toBe(true);
      expect(accessibilityService.requestActionCalls).toHaveLength(0);
    });
  });

  describe("when TalkBack is enabled", () => {
    beforeEach(() => {
      detector.setTalkBackEnabled(true);
    });

    test("does not call requestAction(focus) when focusTarget is not set and element already visible", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      finder.nextElementByText = TARGET_ELEMENT;

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0)],
        talkBackExecutor
      });

      const result = await suv.execute(BASE_OPTIONS);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(accessibilityService.requestActionCalls).toHaveLength(0);
    });

    test("calls requestAction(focus, resourceId) when focusTarget:true and element already visible", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      finder.nextElementByText = TARGET_ELEMENT;

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0)],
        talkBackExecutor
      });

      const result = await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(result.scrollIterations).toBe(0);
      expect(accessibilityService.requestActionCalls).toContainEqual({
        action: "focus",
        resourceId: "test:id/target",
        timeoutMs: 5000
      });
    });

    test("calls requestAction(focus) after scrolling finds element with focusTarget:true", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      let findCount = 0;
      finder.findElementByText = (_h: any, _t: any) => {
        findCount++;
        return findCount > 1 ? TARGET_ELEMENT : null;
      };

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0), makeObserveResult(1), makeObserveResult(2)],
        talkBackExecutor
      });

      const result = await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(result.scrollIterations).toBeGreaterThan(0);
      expect(accessibilityService.requestActionCalls).toContainEqual({
        action: "focus",
        resourceId: "test:id/target",
        timeoutMs: 5000
      });
    });

    test("does not call requestAction(focus) after scrolling finds element without focusTarget", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      let findCount = 0;
      finder.findElementByText = (_h: any, _t: any) => {
        findCount++;
        return findCount > 1 ? TARGET_ELEMENT : null;
      };

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0), makeObserveResult(1), makeObserveResult(2)],
        talkBackExecutor
      });

      const result = await suv.execute(BASE_OPTIONS);

      expect(result.success).toBe(true);
      expect(accessibilityService.requestActionCalls).toHaveLength(0);
    });

    test("never calls requestAction(clear_focus) during scrolling", async () => {
      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      let findCount = 0;
      finder.findElementByText = (_h: any, _t: any) => {
        findCount++;
        return findCount > 2 ? TARGET_ELEMENT : null;
      };

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [
          makeObserveResult(0),
          makeObserveResult(1),
          makeObserveResult(2),
          makeObserveResult(3)
        ],
        talkBackExecutor
      });

      await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(accessibilityService.requestActionCalls.some(c => c.action === "clear_focus")).toBe(false);
    });

    test("skips focus if found element has no resource-id", async () => {
      const elementWithoutId: Element = {
        bounds: { left: 10, top: 200, right: 390, bottom: 250 },
        text: "Target Item",
        scrollable: false
      } as unknown as Element;

      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      finder.nextElementByText = elementWithoutId;

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0)],
        talkBackExecutor
      });

      // Should succeed but not call requestAction since there's no resource-id to focus
      const result = await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(result.success).toBe(true);
      expect(accessibilityService.requestActionCalls).toHaveLength(0);
    });

    test("succeeds even when requestAction(focus) throws", async () => {
      accessibilityService.setRequestActionThrows(new Error("focus action failed"));

      finder.nextScrollableContainer = CONTAINER_ELEMENT;
      finder.nextElementByText = TARGET_ELEMENT;

      const suv = makeScrollUntilVisible({
        accessibilityDetector: detector,
        finder,
        timer,
        accessibilityService,
        observeResults: [makeObserveResult(0)],
        talkBackExecutor
      });

      const result = await suv.execute({ ...BASE_OPTIONS, focusTarget: true });

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
    });
  });
});

describe("ScrollUntilVisible end-of-list detection", () => {
  let detector: FakeAccessibilityDetector;
  let finder: FakeElementFinder;
  let timer: FakeTimer;
  let accessibilityService: FakeScrollAccessibilityService;
  let talkBackExecutor: FakeTalkBackSwipeExecutor;

  beforeEach(() => {
    detector = new FakeAccessibilityDetector();
    detector.setTalkBackEnabled(true);
    finder = new FakeElementFinder();
    timer = new FakeTimer();
    timer.enableAutoAdvance();
    accessibilityService = new FakeScrollAccessibilityService();
    talkBackExecutor = new FakeTalkBackSwipeExecutor();
  });

  test("throws when hierarchy unchanged for maxUnchangedScrolls iterations", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;
    finder.nextElementByText = null; // never found

    // Same observation repeated — fingerprint will never change
    const sameObs = makeObserveResult(99);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [sameObs, sameObs, sameObs, sameObs, sameObs],
      talkBackExecutor
    });

    await expect(suv.execute(BASE_OPTIONS)).rejects.toThrow(
      /Scroll reached end of container/
    );
  });

  test("continues scrolling when hierarchy changes between iterations", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;
    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      return findCount > 3 ? TARGET_ELEMENT : null;
    };

    // Varying observations so fingerprint changes each scroll
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [
        makeObserveResult(0),
        makeObserveResult(1),
        makeObserveResult(2),
        makeObserveResult(3),
        makeObserveResult(4)
      ],
      talkBackExecutor
    });

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.scrollIterations).toBeGreaterThan(1);
  });

  test("resets unchanged count when hierarchy changes", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;
    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      // Found after 3 calls: initial check + 1 forward miss + 1 reverse miss + found on 4th
      return findCount > 3 ? TARGET_ELEMENT : null;
    };

    // One same triggers reverseMode; subsequent changes in reverse reset the counter,
    // allowing continued scrolling until the element is found.
    const sameA = makeObserveResult(10);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [sameA, sameA, makeObserveResult(30), makeObserveResult(40)],
      talkBackExecutor
    });

    // Should not throw — hierarchy changes during reverse reset the unchanged counter
    const result = await suv.execute(BASE_OPTIONS);
    expect(result.success).toBe(true);
  });
});
