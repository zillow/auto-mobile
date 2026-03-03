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
import type { OverlayCandidate, SwipeOnResolvedOptions } from "../../../../src/features/action/swipeon/types";

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
  "text": "Skills",
  "scrollable": false
} as unknown as Element;

function makeScrollUntilVisible({
  accessibilityDetector,
  finder,
  timer,
  accessibilityService,
  observeResults,
  talkBackExecutor,
  getDuration,
  overlayDetector
}: {
  accessibilityDetector: FakeAccessibilityDetector;
  finder: FakeElementFinder;
  timer: FakeTimer;
  accessibilityService: FakeScrollAccessibilityService;
  observeResults: ObserveResult[];
  talkBackExecutor: FakeTalkBackSwipeExecutor;
  getDuration?: (options: SwipeOnResolvedOptions) => number;
  overlayDetector?: FakeOverlayDetector;
}): ScrollUntilVisible {
  let callIdx = 0;

  const fakeObserveScreen = {
    execute: async () => observeResults[Math.min(callIdx, observeResults.length - 1)],
    getMostRecentCachedObserveResult: async () =>
      observeResults[Math.min(callIdx, observeResults.length - 1)]
  };

  const fakeGeometry = new FakeElementGeometry();

  const fakeOverlayDetector = overlayDetector ?? new FakeOverlayDetector();

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
    getDuration: getDuration ?? (() => 300),
    resolveBoomerangConfig: () => undefined,
    buildPredictionArgs: () => ({}),
    observedInteraction
  });
}

const BASE_OPTIONS: SwipeOnResolvedOptions = {
  direction: "up",
  lookFor: { text: "Skills" }
};

describe("ScrollUntilVisible overshoot recovery", () => {
  let detector: FakeAccessibilityDetector;
  let finder: FakeElementFinder;
  let timer: FakeTimer;
  let accessibilityService: FakeScrollAccessibilityService;
  let talkBackExecutor: FakeTalkBackSwipeExecutor;

  beforeEach(() => {
    detector = new FakeAccessibilityDetector();
    detector.setTalkBackEnabled(false);
    finder = new FakeElementFinder();
    timer = new FakeTimer();
    timer.enableAutoAdvance();
    accessibilityService = new FakeScrollAccessibilityService();
    talkBackExecutor = new FakeTalkBackSwipeExecutor();
  });

  test("element found in reverse after forward end-of-list", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    // Forward phase: obs[1] same as obs[0] → 1 unchanged scroll → switch to reverseMode
    // Reverse phase: obs[2] is different fingerprint → element found
    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      // found on the 3rd call (initial check + 1 forward miss + found after reverse)
      return findCount >= 3 ? TARGET_ELEMENT : null;
    };

    const sameObs = makeObserveResult(0);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      // [0]=initial, [1]=same fingerprint (forward end), [2]=different (reverse finds element)
      observeResults: [sameObs, sameObs, makeObserveResult(1)],
      talkBackExecutor
    });

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.scrollIterations).toBeGreaterThan(0);
  });

  test("throws when both forward and reverse directions exhaust without finding element", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;
    finder.nextElementByText = null; // never found

    // All observations identical — both forward and reverse end-of-list trigger
    const sameObs = makeObserveResult(99);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [sameObs, sameObs, sameObs, sameObs, sameObs, sameObs, sameObs, sameObs],
      talkBackExecutor
    });

    await expect(suv.execute(BASE_OPTIONS)).rejects.toThrow(
      /Scroll reached end of container/
    );
  });

  test("element found in forward direction without entering reverse mode", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      // found after 2 forward scrolls (findCount=3: initial check + 2 post-swipe checks)
      return findCount >= 3 ? TARGET_ELEMENT : null;
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

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);

    // Verify that executeSwipeGesture was never called with the reversed direction ("down")
    const allDirections = talkBackExecutor.getDirections();
    expect(allDirections.every(d => d === "up")).toBe(true);
  });

  test("switches to opposite direction after forward end-of-list", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    // Forward phase triggers end-of-list (1 same), then reverse finds element
    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      return findCount >= 3 ? TARGET_ELEMENT : null;
    };

    const sameObs = makeObserveResult(0);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [sameObs, sameObs, makeObserveResult(1)],
      talkBackExecutor
    });

    await suv.execute(BASE_OPTIONS);

    const allDirections = talkBackExecutor.getDirections();

    // Forward swipes should be "up", reverse swipe should be "down"
    expect(allDirections).toContain("up");
    expect(allDirections).toContain("down");

    // The last call should be the reversed direction
    expect(allDirections[allDirections.length - 1]).toBe("down");
  });

  test("scroll idle detection: uses settled observation when swipe returns mid-scroll state", async () => {
    // Scenario: observedInteraction returns a mid-scroll hierarchy (hierarchyId=1).
    // Direct execute() calls for idle polling return a different obs (hierarchyId=2) first,
    // then the same obs again (hierarchyId=2) → fingerprints match → settled.
    // The element is only findable in the settled state (call 2+).
    const obs0 = makeObserveResult(0); // initial
    const obs1mid = makeObserveResult(1); // mid-scroll returned by observedInteraction
    const obs2settled = makeObserveResult(2); // settled (idle poll 1 and 2 both return this)

    let executeCallCount = 0;
    const fakeObserveScreen = {
      execute: async () => {
        executeCallCount++;
        if (executeCallCount === 1) {return obs0;} // initial observe
        // Idle polls: first sees obs2settled (different from obs1mid → sleep),
        // second also sees obs2settled (same → settled)
        return obs2settled;
      },
      getMostRecentCachedObserveResult: async () => obs0,
      appendRawViewHierarchy: async () => {}
    };

    const fakeGeometry = new FakeElementGeometry();
    const fakeOverlayDetector = new FakeOverlayDetector();
    const fakeDetector = new FakeAccessibilityDetector();
    fakeDetector.setTalkBackEnabled(false);
    const fakeFinder = new FakeElementFinder();
    fakeFinder.nextScrollableContainer = CONTAINER_ELEMENT;
    const fakeTimer = new FakeTimer();
    fakeTimer.enableAutoAdvance();
    const fakeTalkBack = new FakeTalkBackSwipeExecutor();
    const fakeAccessibilityService = new FakeScrollAccessibilityService();

    // Element not found initially; found after idle poll settles to obs2settled
    let findCount = 0;
    fakeFinder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      return findCount >= 2 ? TARGET_ELEMENT : null;
    };

    // observedInteraction: always returns obs1mid as the post-swipe observation
    const observedInteraction = async (action: (obs: ObserveResult) => Promise<any>, _opts: any) => {
      const result = await action(obs0);
      return { ...result, observation: obs1mid };
    };

    const suv = new ScrollUntilVisible({
      device: DEVICE,
      finder: fakeFinder as any,
      geometry: fakeGeometry,
      observeScreen: fakeObserveScreen as any,
      accessibilityService: fakeAccessibilityService,
      accessibilityDetector: fakeDetector,
      overlayDetector: fakeOverlayDetector,
      talkBackExecutor: fakeTalkBack,
      timer: fakeTimer,
      getDuration: () => 300,
      resolveBoomerangConfig: () => undefined,
      buildPredictionArgs: () => ({}),
      observedInteraction
    });

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    // Verify idle polls occurred: 1 initial + at least 2 idle polls
    expect(executeCallCount).toBeGreaterThanOrEqual(3);
  });

  test("scroll idle detection: no extra sleep when observation already settled", async () => {
    // When observedInteraction and the first idle poll return the same fingerprint,
    // waitForScrollIdle returns immediately without sleeping.
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      return findCount >= 3 ? TARGET_ELEMENT : null;
    };

    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      // All distinct so fingerprints keep changing → scroll detected each iteration
      observeResults: [
        makeObserveResult(0),
        makeObserveResult(1),
        makeObserveResult(2),
        makeObserveResult(3)
      ],
      talkBackExecutor
    });

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);
    // In the existing helper, idle polls see the same obs as observedInteraction returned
    // → settle immediately. Sleep calls should only come from other sources, not idle polling.
    // Timer is in auto-advance mode so no pending sleeps remain.
    expect(timer.getPendingSleepCount()).toBe(0);
  });

  test("reverse mode uses slow speed even when original options had fast speed", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    // Forward phase triggers end-of-list (1 same), reverse finds element
    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => {
      findCount++;
      return findCount >= 3 ? TARGET_ELEMENT : null;
    };

    const getDurationCalls: SwipeOnResolvedOptions[] = [];
    const getDuration = (opts: SwipeOnResolvedOptions) => {
      getDurationCalls.push({ ...opts });
      return 300;
    };

    const sameObs = makeObserveResult(0);
    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [sameObs, sameObs, makeObserveResult(1)],
      talkBackExecutor,
      getDuration
    });

    // Use fast speed to verify it gets overridden to slow in reverse mode
    await suv.execute({ ...BASE_OPTIONS, speed: "fast" });

    // The last getDuration call corresponds to the reverse swipe — must use "slow"
    const lastCall = getDurationCalls[getDurationCalls.length - 1];
    expect(lastCall.speed).toBe("slow");
  });

  test("uses safe swipe coordinates from overlay detector when overlay is present", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => ++findCount >= 2 ? TARGET_ELEMENT : null;

    const overlayDetector = new FakeOverlayDetector();
    const candidate: OverlayCandidate = {
      bounds: { left: 0, top: 0, right: 400, bottom: 200 },
      overlapBounds: { left: 0, top: 0, right: 400, bottom: 200 },
      coverage: 80000,
      zOrder: { windowRank: 1, nodeOrder: 0 }
    };
    overlayDetector.candidates = [candidate];
    overlayDetector.safeCoords = { startX: 50, startY: 600, endX: 50, endY: 300 };

    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [makeObserveResult(0), makeObserveResult(1), makeObserveResult(2)],
      talkBackExecutor,
      overlayDetector
    });

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);
    const firstSwipe = talkBackExecutor.getSwipeCalls()[0];
    expect(firstSwipe.x1).toBe(50);
  });

  test("scroll proceeds past a failed swipe if observation is still returned", async () => {
    finder.nextScrollableContainer = CONTAINER_ELEMENT;

    let findCount = 0;
    finder.findElementByText = (_h: any, _t: any) => ++findCount >= 3 ? TARGET_ELEMENT : null;

    talkBackExecutor.setFailureResult({ success: false, error: "gesture rejected" });

    const suv = makeScrollUntilVisible({
      accessibilityDetector: detector,
      finder,
      timer,
      accessibilityService,
      observeResults: [makeObserveResult(0), makeObserveResult(1), makeObserveResult(2), makeObserveResult(3)],
      talkBackExecutor
    });

    const result = await suv.execute(BASE_OPTIONS);

    expect(result.success).toBe(true);
    expect(talkBackExecutor.getCallCount()).toBeGreaterThanOrEqual(2);
  });
});
