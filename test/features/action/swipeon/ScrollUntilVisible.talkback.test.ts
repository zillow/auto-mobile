import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ScrollUntilVisible } from "../../../../src/features/action/swipeon/ScrollUntilVisible";
import { FakeAccessibilityDetector } from "../../../fakes/FakeAccessibilityDetector";
import { FakeElementFinder } from "../../../fakes/FakeElementFinder";
import { FakeTimer } from "../../../fakes/FakeTimer";
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
  accessibilityService: { requestAction: ReturnType<typeof mock> };
  observeResults: ObserveResult[];
  talkBackExecutor: { executeSwipeGesture: ReturnType<typeof mock> };
}): ScrollUntilVisible {
  let callIdx = 0;

  const fakeObserveScreen = {
    execute: async () => observeResults[Math.min(callIdx, observeResults.length - 1)],
    getMostRecentCachedObserveResult: async () =>
      observeResults[Math.min(callIdx, observeResults.length - 1)]
  };

  const fakeGeometry = {
    getSwipeWithinBounds: () => ({ startX: 200, startY: 700, endX: 200, endY: 200 }),
    getSwipeDurationFromSpeed: () => 300
  };

  const fakeOverlayDetector = {
    collectOverlayCandidates: () => [],
    computeSafeSwipeCoordinates: () => null
  };

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
    geometry: fakeGeometry as any,
    observeScreen: fakeObserveScreen as any,
    accessibilityService: accessibilityService as any,
    accessibilityDetector,
    overlayDetector: fakeOverlayDetector as any,
    talkBackExecutor: talkBackExecutor as any,
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
  let accessibilityService: { requestAction: ReturnType<typeof mock> };
  let talkBackExecutor: { executeSwipeGesture: ReturnType<typeof mock> };

  beforeEach(() => {
    detector = new FakeAccessibilityDetector();
    finder = new FakeElementFinder();
    timer = new FakeTimer();
    timer.enableAutoAdvance();
    accessibilityService = {
      requestAction: mock(async () => ({ success: true, action: "focus", totalTimeMs: 10 }))
    };
    talkBackExecutor = {
      executeSwipeGesture: mock(async () => ({
        success: true,
        x1: 200, y1: 700, x2: 200, y2: 200,
        duration: 300
      }))
    };
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
      expect(accessibilityService.requestAction).not.toHaveBeenCalled();
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
      expect(accessibilityService.requestAction).not.toHaveBeenCalled();
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
      expect(accessibilityService.requestAction).not.toHaveBeenCalled();
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
      expect(accessibilityService.requestAction).toHaveBeenCalledWith(
        "focus",
        "test:id/target",
        5000,
        expect.anything()
      );
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
      expect(accessibilityService.requestAction).toHaveBeenCalledWith(
        "focus",
        "test:id/target",
        5000,
        expect.anything()
      );
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
      expect(accessibilityService.requestAction).not.toHaveBeenCalled();
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

      expect(accessibilityService.requestAction).not.toHaveBeenCalledWith("clear_focus", expect.anything());
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
      expect(accessibilityService.requestAction).not.toHaveBeenCalled();
    });

    test("succeeds even when requestAction(focus) throws", async () => {
      accessibilityService.requestAction = mock(async () => {
        throw new Error("focus action failed");
      });

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
  let accessibilityService: { requestAction: ReturnType<typeof mock> };
  let talkBackExecutor: { executeSwipeGesture: ReturnType<typeof mock> };

  beforeEach(() => {
    detector = new FakeAccessibilityDetector();
    detector.setTalkBackEnabled(true);
    finder = new FakeElementFinder();
    timer = new FakeTimer();
    timer.enableAutoAdvance();
    accessibilityService = {
      requestAction: mock(async () => ({ success: true, action: "focus", totalTimeMs: 10 }))
    };
    talkBackExecutor = {
      executeSwipeGesture: mock(async () => ({
        success: true,
        x1: 200, y1: 700, x2: 200, y2: 200,
        duration: 300
      }))
    };
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
      // Found after 4 scrolls
      return findCount > 4 ? TARGET_ELEMENT : null;
    };

    // Two same, one different, two same — the different one resets the unchanged counter
    const sameA = makeObserveResult(10);
    const sameB = makeObserveResult(20);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [sameA, sameA, makeObserveResult(30), sameB, sameB, makeObserveResult(40)],
      talkBackExecutor
    });

    // Should not throw despite two repeated observations in a row (count resets on change)
    const result = await suv.execute(BASE_OPTIONS);
    expect(result.success).toBe(true);
  });
});
